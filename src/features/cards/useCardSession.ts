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
import { nextSrsState, selectDueCards, type Grade, type SrsState } from './srs'

export type CardPhase = 'presenting' | 'speaking' | 'result' | 'saving'

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
  const [error, setError] = useState<unknown>(null)
  const userIdRef = useRef<string | null>(null)
  const progressRef = useRef(new Map<string, VocabProgressRow>())

  const currentCard = cards[currentIndex] ?? null
  const currentProgress = currentCard
    ? progressRef.current.get(currentCard.id)
    : undefined
  const isFirstEncounter = currentCard !== null
    && (!currentProgress || currentProgress.last_reviewed_at === null)

  const captureError = useCallback((caught: unknown) => {
    setError(caught ?? new Error('不明なエラーが発生しました'))
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
    setError(null)
    setPhase('presenting')
    userIdRef.current = null
    progressRef.current = new Map()

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
        const selectedCards = prepEventId
          ? vocabItems
          : selectDueCards(
            vocabItems,
            new Map(
              vocabProgress.map((progress) => [progress.vocab_item_id, toSrsState(progress)]),
            ),
            new Date(),
            10,
          )

        if (active) {
          userIdRef.current = userId
          progressRef.current = progressById
          setCards(selectedCards)
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
    }
  }, [captureError, lang, prepEventId])

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
  }, [currentCard, phase])

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
      }
      if (isTomorrow(next.next_review_at, now)) {
        setTomorrowCount((count) => count + 1)
      }

      if (currentIndex + 1 >= cards.length) {
        setFinished(true)
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
  }, [cards.length, captureError, currentCard, currentIndex, phase])

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
    error,
    beginSession,
    playExample,
    saidIt,
    showHint,
    gradeCard,
    clearError: () => setError(null),
  }
}
