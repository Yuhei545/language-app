import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { speak, unlockAudio } from '../../services/speech/tts'
import { getSettings, subscribe, type Settings } from '../../services/settings'
import { getSession } from '../../services/supabase/auth'
import {
  getVocabProgress,
  listVocabItems,
  upsertVocabProgress,
} from '../../services/supabase/db'
import type { VocabItemRow, VocabProgressRow } from '../../services/supabase/types'
import type { EncounterEntry } from '../chunks/ledger'
import { recordEncounters, reportLedgerFailure } from '../chunks/record'
import type { Chunk } from '../chunks/registry'
import { loadChunkContext } from '../chunks/targetsStore'
import { nextSrsState, selectDueCards, type Grade, type SrsState } from './srs'

export type CardPhase = 'presenting' | 'speaking' | 'result' | 'saving'

/** カードは 1 種類の文脈として数える(台帳の context)。 */
export const CARD_CONTEXT = 'card'

const EMPTY_SRS_STATE: SrsState = {
  status: 'new',
  correct_count: 0,
  next_review_at: null,
}

function toSrsState(progress: VocabProgressRow): SrsState {
  return {
    status: progress.status,
    correct_count: progress.correct_count,
    next_review_at: progress.next_review_at,
    last_reviewed_at: progress.last_reviewed_at,
  }
}

function isTomorrow(value: string | null, now: Date): boolean {
  if (!value) {
    return false
  }

  const reviewDate = new Date(value)
  if (Number.isNaN(reviewDate.getTime())) {
    return false
  }

  const tomorrow = new Date(now)
  tomorrow.setDate(tomorrow.getDate() + 1)

  return (
    reviewDate.getFullYear() === tomorrow.getFullYear()
    && reviewDate.getMonth() === tomorrow.getMonth()
    && reviewDate.getDate() === tomorrow.getDate()
  )
}

export function useCardSession(lang: 'en' | 'ko', prepEventId?: string) {
  const [settings, setSettingsState] = useState<Settings>(getSettings)
  const settingsRef = useRef(settings)
  const [cards, setCards] = useState<VocabItemRow[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [loading, setLoading] = useState(true)
  const [started, setStarted] = useState(false)
  const [finished, setFinished] = useState(false)
  const [phase, setPhase] = useState<CardPhase>('presenting')
  /** 答え(語と例文)を見せているか。音読して「言ってみた」を押したら true。 */
  const [answerVisible, setAnswerVisible] = useState(false)
  const [hintVisible, setHintVisible] = useState(false)
  const [hintSaving, setHintSaving] = useState(false)
  const [todayLearnedCount, setTodayLearnedCount] = useState(0)
  const [tomorrowCount, setTomorrowCount] = useState(0)
  /** 今日の狙いのうち、このセッションのカードにあるもの / 触れたもの。 */
  const [targetTotal, setTargetTotal] = useState(0)
  const [targetTouched, setTargetTouched] = useState(0)
  const [error, setError] = useState<unknown>(null)
  const userIdRef = useRef<string | null>(null)
  const progressRef = useRef(new Map<string, VocabProgressRow>())
  const chunkByItemIdRef = useRef(new Map<string, Chunk>())
  const targetKeysRef = useRef(new Set<string>())
  const touchedKeysRef = useRef(new Set<string>())
  const pendingRef = useRef<EncounterEntry[]>([])
  const ledgerWarnedRef = useRef({ current: false })

  const currentCard = cards[currentIndex] ?? null
  const currentProgress = currentCard
    ? progressRef.current.get(currentCard.id)
    : undefined
  const isFirstEncounter = currentCard !== null
    && (!currentProgress || currentProgress.last_reviewed_at === null)

  const captureError = useCallback((caught: unknown) => {
    setError(caught ?? new Error('不明なエラーが発生しました'))
  }, [])

  /** ためた出会いを台帳にまとめて書く。失敗しても練習は止めない。 */
  const flushLedger = useCallback(() => {
    const userId = userIdRef.current
    const entries = pendingRef.current.splice(0)
    if (!userId || entries.length === 0) {
      return
    }
    void recordEncounters(userId, lang, entries).catch((ledgerError: unknown) => {
      reportLedgerFailure(ledgerError, ledgerWarnedRef.current, captureError)
    })
  }, [captureError, lang])

  const noteEncounter = useCallback((card: VocabItemRow, kind: EncounterEntry['kind']) => {
    const chunk = chunkByItemIdRef.current.get(card.id)
    if (!chunk) {
      return
    }
    pendingRef.current.push({ chunkKey: chunk.key, mode: 'cards', kind, context: CARD_CONTEXT })
    if (targetKeysRef.current.has(chunk.key) && !touchedKeysRef.current.has(chunk.key)) {
      touchedKeysRef.current.add(chunk.key)
      setTargetTouched(touchedKeysRef.current.size)
    }
  }, [])

  useEffect(() => subscribe((nextSettings) => {
    settingsRef.current = nextSettings
    setSettingsState(nextSettings)
  }), [])

  useEffect(() => {
    let active = true
    setLoading(true)
    setStarted(false)
    setFinished(false)
    setCurrentIndex(0)
    setCards([])
    setAnswerVisible(false)
    setHintVisible(false)
    setTodayLearnedCount(0)
    setTomorrowCount(0)
    setTargetTotal(0)
    setTargetTouched(0)
    setError(null)
    setPhase('presenting')
    userIdRef.current = null
    progressRef.current = new Map()
    chunkByItemIdRef.current = new Map()
    targetKeysRef.current = new Set()
    touchedKeysRef.current = new Set()
    pendingRef.current = []

    const loadCards = async () => {
      try {
        const authSession = await getSession()
        if (!authSession) {
          throw new Error('ログイン情報を確認できませんでした')
        }

        const userId = authSession.user.id
        const vocabItems = await listVocabItems(
          userId,
          lang,
          prepEventId ? { prepEventId } : {},
        )
        const vocabProgress = await getVocabProgress(
          userId,
          vocabItems.map((item) => item.id),
        )
        const progressById = new Map(
          vocabProgress.map((progress) => [progress.vocab_item_id, progress]),
        )

        // 今日の狙い(型・句動詞・表現)を先に出す。準備モードは全件なので使わない
        const chunkContext = prepEventId
          ? null
          : await loadChunkContext({ userId, lang, vocabItems })
        const chunkByItemId = new Map<string, Chunk>()
        for (const chunk of chunkContext?.registry ?? []) {
          if (chunk.vocabItemId) {
            chunkByItemId.set(chunk.vocabItemId, chunk)
          }
        }
        const targets = chunkContext?.targets ?? []
        const prioritizeIds = targets.flatMap((chunk) => (chunk.vocabItemId ? [chunk.vocabItemId] : []))

        const selectedCards = prepEventId
          ? vocabItems
          : selectDueCards(
            vocabItems,
            new Map(
              vocabProgress.map((progress) => [progress.vocab_item_id, toSrsState(progress)]),
            ),
            new Date(),
            10,
            { prioritizeIds },
          )
        const selectedIds = new Set(selectedCards.map((card) => card.id))
        const targetKeys = new Set(
          targets
            .filter((chunk) => chunk.vocabItemId && selectedIds.has(chunk.vocabItemId))
            .map((chunk) => chunk.key),
        )

        if (active) {
          userIdRef.current = userId
          progressRef.current = progressById
          chunkByItemIdRef.current = chunkByItemId
          targetKeysRef.current = targetKeys
          setTargetTotal(targetKeys.size)
          setCards(selectedCards)
          if (chunkContext?.error && !ledgerWarnedRef.current.current) {
            ledgerWarnedRef.current.current = true
            captureError(chunkContext.error)
          }
        }
      } catch (loadError) {
        if (active) {
          captureError(loadError)
        }
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }

    void loadCards()

    return () => {
      active = false
      // 途中でやめても、ここまでの出会いは書く
      flushLedger()
    }
  }, [captureError, flushLedger, lang, prepEventId])

  const beginSession = useCallback(() => {
    if (loading || cards.length === 0) {
      return
    }

    try {
      unlockAudio()
      setStarted(true)
    } catch (unlockError) {
      captureError(unlockError)
    }
  }, [cards.length, captureError, loading])

  const playExample = useCallback(async () => {
    if (!currentCard || phase === 'saving') {
      return
    }

    const returnPhase: CardPhase = answerVisible ? 'result' : 'presenting'
    setPhase('speaking')

    try {
      await speak(currentCard.example || currentCard.text, {
        lang,
        rate: settingsRef.current.ttsRate,
        voiceURI: settingsRef.current.ttsVoice[lang],
      })
    } catch (speechError) {
      captureError(speechError)
    } finally {
      setPhase(returnPhase)
    }
  }, [answerVisible, captureError, currentCard, lang, phase])

  /** 音読したら答えを見せる。採点はしない(自分で判定する)。 */
  const saidIt = useCallback(() => {
    if (!currentCard || phase !== 'presenting') {
      return
    }
    setError(null)
    setAnswerVisible(true)
    setPhase('result')
    noteEncounter(currentCard, 'seen')
  }, [currentCard, noteEncounter, phase])

  const showHint = useCallback(async () => {
    const userId = userIdRef.current
    if (!currentCard || hintVisible || hintSaving) {
      return
    }

    if (!currentCard.hint_ja) {
      setHintVisible(true)
      return
    }

    if (!userId) {
      captureError(new Error('ログイン情報を確認できませんでした'))
      return
    }

    setHintSaving(true)

    try {
      const currentProgress = progressRef.current.get(currentCard.id)
      const now = new Date().toISOString()
      const updated = await upsertVocabProgress({
        user_id: userId,
        vocab_item_id: currentCard.id,
        status: currentProgress?.status ?? 'new',
        correct_count: currentProgress?.correct_count ?? 0,
        hint_used_count: (currentProgress?.hint_used_count ?? 0) + 1,
        last_reviewed_at: currentProgress?.last_reviewed_at ?? null,
        next_review_at: currentProgress?.next_review_at ?? now,
      })
      progressRef.current.set(currentCard.id, updated)
      setHintVisible(true)
    } catch (hintError) {
      captureError(hintError)
    } finally {
      setHintSaving(false)
    }
  }, [captureError, currentCard, hintSaving, hintVisible])

  const gradeCard = useCallback(async (grade: Grade) => {
    const userId = userIdRef.current
    if (!currentCard || !userId || phase !== 'result') {
      return
    }

    setError(null)
    setPhase('saving')

    try {
      const now = new Date()
      const currentProgress = progressRef.current.get(currentCard.id)
      const next = nextSrsState(
        currentProgress ? toSrsState(currentProgress) : EMPTY_SRS_STATE,
        grade,
        now,
      )
      const updated = await upsertVocabProgress({
        user_id: userId,
        vocab_item_id: currentCard.id,
        status: next.status,
        correct_count: next.correct_count,
        hint_used_count: currentProgress?.hint_used_count ?? 0,
        last_reviewed_at: now.toISOString(),
        next_review_at: next.next_review_at,
      })
      progressRef.current.set(currentCard.id, updated)

      if (grade === 'good') {
        setTodayLearnedCount((count) => count + 1)
        noteEncounter(currentCard, 'said')
      }
      if (isTomorrow(next.next_review_at, now)) {
        setTomorrowCount((count) => count + 1)
      }

      if (currentIndex + 1 >= cards.length) {
        setFinished(true)
        flushLedger()
      } else {
        setCurrentIndex((index) => index + 1)
        setAnswerVisible(false)
        setHintVisible(false)
        setPhase('presenting')
      }
    } catch (gradeError) {
      captureError(gradeError)
      setPhase('result')
    }
  }, [cards.length, captureError, currentCard, currentIndex, flushLedger, noteEncounter, phase])

  const progressPercent = useMemo(() => {
    if (cards.length === 0) {
      return 0
    }

    const completed = finished ? cards.length : currentIndex
    return Math.round((completed / cards.length) * 100)
  }, [cards.length, currentIndex, finished])

  return {
    loading,
    started,
    finished,
    currentCard,
    isFirstEncounter,
    currentIndex,
    totalCards: cards.length,
    progressPercent,
    phase,
    answerVisible,
    hintVisible,
    hintSaving,
    todayLearnedCount,
    tomorrowCount,
    targetTotal,
    targetTouched,
    error,
    beginSession,
    playExample,
    saidIt,
    showHint,
    gradeCard,
    clearError: () => setError(null),
  }
}
