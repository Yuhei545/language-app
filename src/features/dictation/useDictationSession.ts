import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { featureById, type DictationFeatureId } from '../../content/dictationFeatures'
import { loadDictation, type DictationSentence } from '../../content/dictationSchema'
import { speak, unlockAudio } from '../../services/speech'
import { getSettings, subscribe, type Settings } from '../../services/settings'
import { getSession } from '../../services/supabase/auth'
import {
  listDictationFeatureStats,
  listDictationProgress,
  upsertDictationFeatureStat,
  upsertDictationProgress,
} from '../../services/supabase/db'
import type { DictationFeatureStatRow, DictationProgressRow } from '../../services/supabase/types'
import type { EncounterEntry } from '../chunks/ledger'
import { recordEncounters, reportLedgerFailure } from '../chunks/record'
import type { Chunk } from '../chunks/registry'
import { loadChunkContext } from '../chunks/targetsStore'
import { dictationEncounters, indexSentenceChunks, sentencesWithTargets } from './chunkEncounters'
import { buildCloze, checkBlank, type Cloze } from './cloze'
import { wordDiff, type DiffToken } from './diff'
import { nextSchedule, type DictationStage } from './schedule'
import { selectSentences, type FeatureAccuracy } from './selectSentences'

export type DictationStatus = 'loading' | 'listening' | 'typing' | 'result' | 'finished'

export type DictationResult = {
  tokens: DiffToken[]
  ratio: number
  /** 穴埋めのとき、空欄ごとの正誤。 */
  blankResults: boolean[]
  /** この文で扱った現象と、できたかどうか。 */
  featureResults: Array<{ featureId: DictationFeatureId; correct: boolean }>
}

const MAX_INITIAL_PLAYS = 3
/** 聞き直しの速さ。段階的に上げていく。 */
export const PLAY_RATES = [0.85, 1, 1.15] as const

export function useDictationSession(lang: 'en' | 'ko') {
  const [settings, setSettingsState] = useState<Settings>(getSettings)
  const settingsRef = useRef(settings)
  const [status, setStatus] = useState<DictationStatus>('loading')
  const [sentences, setSentences] = useState<DictationSentence[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [playsRemaining, setPlaysRemaining] = useState(MAX_INITIAL_PLAYS)
  const playsRemainingRef = useRef(MAX_INITIAL_PLAYS)
  const [typedText, setTypedText] = useState('')
  const [blankInputs, setBlankInputs] = useState<string[]>([])
  const [result, setResult] = useState<DictationResult | null>(null)
  const [ratios, setRatios] = useState<number[]>([])
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const userIdRef = useRef<string | null>(null)
  const progressRef = useRef(new Map<string, DictationProgressRow>())
  const featureStatsRef = useRef(new Map<string, DictationFeatureStatRow>())
  /** 文ごとの、含まれるチャンク(型・句動詞・表現)。台帳に書くのに使う。 */
  const chunkIndexRef = useRef(new Map<string, Chunk[]>())
  const pendingRef = useRef<EncounterEntry[]>([])
  const ledgerWarnedRef = useRef({ current: false })

  const currentSentence = sentences[currentIndex] ?? null
  /** この文の段階。保存が無ければ穴埋めから。 */
  const stage: DictationStage = currentSentence
    ? progressRef.current.get(currentSentence.id)?.stage ?? 'cloze'
    : 'cloze'
  const cloze: Cloze | null = useMemo(() => (
    currentSentence && stage === 'cloze' ? buildCloze(currentSentence) : null
  ), [currentSentence, stage])

  const captureError = useCallback((caught: unknown) => {
    console.error('聞いて書くでエラーが発生しました', caught)
    setError(caught ?? new Error('予期しないエラーが発生しました'))
  }, [])

  /** ためた出会いを台帳にまとめて書く。失敗しても練習は止めない。 */
  const flushLedger = useCallback(() => {
    const userId = userIdRef.current
    const entries = pendingRef.current.splice(0)
    if (!userId || entries.length === 0) {
      return
    }
    void recordEncounters(userId, lang, entries).catch((ledgerError: unknown) => {
      reportLedgerFailure(ledgerError, ledgerWarnedRef.current, setError)
    })
  }, [lang])

  useEffect(() => subscribe((nextSettings) => {
    settingsRef.current = nextSettings
    setSettingsState(nextSettings)
  }), [])

  useEffect(() => {
    let active = true
    userIdRef.current = null
    progressRef.current = new Map()
    featureStatsRef.current = new Map()
    chunkIndexRef.current = new Map()
    pendingRef.current = []
    playsRemainingRef.current = MAX_INITIAL_PLAYS
    setStatus('loading')
    setSentences([])
    setCurrentIndex(0)
    setPlaysRemaining(MAX_INITIAL_PLAYS)
    setTypedText('')
    setBlankInputs([])
    setResult(null)
    setRatios([])
    setIsSpeaking(false)
    setIsSubmitting(false)
    setError(null)

    const load = async () => {
      try {
        const allSentences = loadDictation(lang)
        const authSession = await getSession()
        if (!authSession) {
          throw new Error('ログイン情報を確認できませんでした')
        }
        const userId = authSession.user.id

        const [progressRows, featureRows, chunkContext] = await Promise.all([
          listDictationProgress(userId, lang),
          listDictationFeatureStats(userId, lang),
          loadChunkContext({ userId, lang }),
        ])
        const featureStats: FeatureAccuracy[] = featureRows.map((row) => ({
          featureId: row.feature_id as DictationFeatureId,
          attempts: row.attempts,
          correct: row.correct,
        }))
        // 今日の狙いを含む文を、期限の文の次に出す
        const chunkIndex = indexSentenceChunks(allSentences, chunkContext.registry, lang)
        const targetIds = sentencesWithTargets(chunkIndex, chunkContext.targets)
        const selected = selectSentences(
          allSentences,
          new Map(progressRows.map((row) => [row.sentence_id, row])),
          5,
          Math.random,
          featureStats,
          new Date(),
          targetIds,
        )

        if (active) {
          userIdRef.current = userId
          progressRef.current = new Map(progressRows.map((row) => [row.sentence_id, row]))
          featureStatsRef.current = new Map(featureRows.map((row) => [row.feature_id, row]))
          chunkIndexRef.current = chunkIndex
          setSentences(selected)
          setBlankInputs([])
          setStatus(selected.length === 0 ? 'finished' : 'listening')
          if (chunkContext.error && !ledgerWarnedRef.current.current) {
            ledgerWarnedRef.current.current = true
            setError(chunkContext.error)
          }
        }
      } catch (loadError) {
        if (active) {
          captureError(loadError)
        }
      }
    }

    void load()
    return () => {
      active = false
      // 途中でやめても、ここまでの出会いは書く
      flushLedger()
    }
  }, [captureError, flushLedger, lang])

  /** 文全体、または一部(語)を読む。part を渡すとその部分だけ。 */
  const play = useCallback(async (rate: number, part?: string) => {
    if (!currentSentence || isSpeaking) {
      return
    }
    if (status !== 'listening' && status !== 'typing' && status !== 'result') {
      return
    }

    const beforeResult = status === 'listening' || status === 'typing'
    // 聞き取り中は回数制限。答え合わせのあとは何度でも聞ける
    if (beforeResult && part === undefined && playsRemainingRef.current <= 0) {
      return
    }

    setError(null)
    setIsSpeaking(true)
    try {
      unlockAudio()
      await speak(part ?? currentSentence.text, {
        lang,
        rate: beforeResult && part === undefined ? 1 : rate,
        voiceURI: settingsRef.current.ttsVoice[lang],
      })
      if (beforeResult && part === undefined) {
        const nextRemaining = Math.max(0, playsRemainingRef.current - 1)
        playsRemainingRef.current = nextRemaining
        setPlaysRemaining(nextRemaining)
      }
    } catch (speechError) {
      captureError(speechError)
    } finally {
      setIsSpeaking(false)
    }
  }, [captureError, currentSentence, isSpeaking, lang, status])

  const beginTyping = useCallback(() => {
    if (status !== 'listening') {
      return
    }

    try {
      unlockAudio()
      setBlankInputs(cloze ? cloze.blanks.map(() => '') : [])
      setStatus('typing')
    } catch (unlockError) {
      captureError(unlockError)
    }
  }, [captureError, cloze, status])

  const setBlankInput = useCallback((index: number, value: string) => {
    setBlankInputs((current) => current.map((item, position) => (position === index ? value : item)))
  }, [])

  /** 現象ごとの成績を貯める。失敗しても練習は止めない。 */
  const saveFeatureStats = useCallback(async (
    results: Array<{ featureId: DictationFeatureId; correct: boolean }>,
  ) => {
    const userId = userIdRef.current
    if (!userId || results.length === 0) {
      return
    }
    const now = new Date().toISOString()
    for (const item of results) {
      const previous = featureStatsRef.current.get(item.featureId)
      try {
        const updated = await upsertDictationFeatureStat({
          user_id: userId,
          lang,
          feature_id: item.featureId,
          attempts: (previous?.attempts ?? 0) + 1,
          correct: (previous?.correct ?? 0) + (item.correct ? 1 : 0),
          last_at: now,
        })
        featureStatsRef.current.set(item.featureId, updated)
      } catch (saveError) {
        console.error('音の現象の成績を保存できませんでした', saveError)
      }
    }
  }, [lang])

  const submit = useCallback(async (typed: string) => {
    const userId = userIdRef.current
    if (!userId || !currentSentence || status !== 'typing' || isSubmitting) {
      return
    }

    // 穴埋めは空欄ごと、全文は語ごとに照らす
    let ratio: number
    let tokens: DiffToken[]
    let blankResults: boolean[] = []
    let featureResults: Array<{ featureId: DictationFeatureId; correct: boolean }> = []
    /** 台帳の判定に使う、実際に書いた文(穴埋めは埋めた文)。 */
    let written = typed

    if (cloze) {
      blankResults = cloze.blanks.map((blank, index) => checkBlank(blankInputs[index] ?? '', blank.answer))
      ratio = blankResults.length === 0
        ? 0
        : blankResults.filter(Boolean).length / blankResults.length
      const filled = cloze.segments.reduce((text, segment, index) => (
        index < cloze.blanks.length
          ? `${text}${segment}${blankInputs[index] ?? ''}`
          : `${text}${segment}`
      ), '')
      written = filled
      tokens = wordDiff(currentSentence.text, filled, lang).tokens
      featureResults = cloze.blanks.map((blank, index) => ({
        featureId: blank.featureId,
        correct: blankResults[index] ?? false,
      }))
    } else {
      const diff = wordDiff(currentSentence.text, typed, lang)
      ratio = diff.ratio
      tokens = diff.tokens
      // 全文のときは、その現象の語が抜けていないかで判定する
      const missing = new Set(
        diff.tokens.filter((token) => token.kind === 'missing').map((token) => token.text.toLowerCase()),
      )
      featureResults = currentSentence.features.map((feature) => ({
        featureId: feature.id,
        correct: !feature.span.toLowerCase().split(/\s+/).some((word) => missing.has(word)),
      }))
    }

    const previous = progressRef.current.get(currentSentence.id)
    const schedule = nextSchedule({
      stage,
      box: previous?.box ?? 0,
      correctStreak: previous?.correct_streak ?? 0,
      nextReviewAt: previous?.next_review_at ?? null,
    }, ratio)

    setError(null)
    setIsSubmitting(true)

    try {
      const updated = await upsertDictationProgress({
        user_id: userId,
        lang,
        sentence_id: currentSentence.id,
        best_ratio: Math.max(previous?.best_ratio ?? 0, ratio),
        attempts: (previous?.attempts ?? 0) + 1,
        last_at: new Date().toISOString(),
        stage: schedule.stage,
        box: schedule.box,
        correct_streak: schedule.correctStreak,
        next_review_at: schedule.nextReviewAt,
      })
      progressRef.current.set(currentSentence.id, updated)
      await saveFeatureStats(featureResults)
      // 文に含まれるチャンクを台帳へ(書けたら said、聞いただけなら seen)
      pendingRef.current.push(...dictationEncounters({
        sentence: currentSentence,
        chunks: chunkIndexRef.current.get(currentSentence.id) ?? [],
        lang,
        cloze,
        written,
      }))
      setTypedText(typed)
      setResult({ tokens, ratio, blankResults, featureResults })
      setRatios((current) => [...current, ratio])
      setStatus('result')
    } catch (saveError) {
      captureError(saveError)
    } finally {
      setIsSubmitting(false)
    }
  }, [blankInputs, captureError, cloze, currentSentence, isSubmitting, lang, saveFeatureStats, stage, status])

  const next = useCallback(() => {
    if (status !== 'result' || isSpeaking) {
      return
    }

    if (currentIndex + 1 >= sentences.length) {
      setStatus('finished')
      flushLedger()
      return
    }

    playsRemainingRef.current = MAX_INITIAL_PLAYS
    setCurrentIndex((index) => index + 1)
    setPlaysRemaining(MAX_INITIAL_PLAYS)
    setTypedText('')
    setBlankInputs([])
    setResult(null)
    setStatus('listening')
  }, [currentIndex, flushLedger, isSpeaking, sentences.length, status])

  const averageRatio = useMemo(() => (
    ratios.length === 0
      ? 0
      : ratios.reduce((sum, ratio) => sum + ratio, 0) / ratios.length
  ), [ratios])

  /** 答え合わせのあとに見せる、この文の音の現象の説明。 */
  const featureNotes = useMemo(() => (
    (result?.featureResults ?? []).map((item) => ({
      ...featureById(item.featureId),
      correct: item.correct,
    }))
  ), [result])

  /** 苦手な現象(正答率の低い順に 3 つ)。まとめで見せる。 */
  const weakFeatures = useMemo(() => (
    [...featureStatsRef.current.values()]
      .filter((row) => row.attempts >= 3)
      .map((row) => ({
        ...featureById(row.feature_id as DictationFeatureId),
        accuracy: row.correct / row.attempts,
      }))
      .sort((left, right) => left.accuracy - right.accuracy)
      .slice(0, 3)
  ), [ratios])

  return {
    status,
    currentSentence,
    currentIndex,
    totalSentences: sentences.length,
    stage,
    cloze,
    blankInputs,
    playsRemaining,
    typedText,
    result,
    featureNotes,
    weakFeatures,
    averageRatio,
    isSpeaking,
    isSubmitting,
    error,
    play,
    beginTyping,
    setTypedText,
    setBlankInput,
    submit,
    next,
    clearError: () => setError(null),
  }
}
