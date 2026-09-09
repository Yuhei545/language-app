import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { loadTwoWord, type TwoWordQuestion, type TwoWordSet } from '../../content/twoWordSchema'
import { speak, stopSpeaking, unlockAudio } from '../../services/speech'
import {
  getSettings,
  setSettings,
  subscribe,
  type Settings,
  type TwoWordLevel,
  type TwoWordOrder,
} from '../../services/settings'
import {
  appendResult,
  bestRoundMs,
  buildTwoWordSession,
  reachedTarget,
  readTwoWordStats,
  suggestNextLevel,
  writeTwoWordStats,
  type TwoWordResult,
  type TwoWordSession,
} from './twoWordSession'

export type TwoWordPhase =
  | 'idle'
  /** お題を見て、声に出す。セットの時間が進む。 */
  | 'asking'
  /** セットの 4 問の答えを見て、言えたかを自分で直す。 */
  | 'checking'
  | 'finished'

export type TwoWordSummary = {
  said: number
  total: number
  roundMs: number[]
  reached: boolean
  bestMs: number | null
  nextLevel: TwoWordLevel | null
}

const TICK_MS = 200

/** 2 語で言うの進行。成績はこの端末に残す(Supabase も Gemini も使わない)。 */
export function useTwoWordSession(lang: 'en' | 'ko') {
  const [settings, setSettingsState] = useState<Settings>(getSettings)
  const settingsRef = useRef(settings)
  const [phase, setPhase] = useState<TwoWordPhase>('idle')
  const [session, setSession] = useState<TwoWordSession | null>(null)
  const [roundIndex, setRoundIndex] = useState(0)
  const [questionIndex, setQuestionIndex] = useState(0)
  const [elapsedMs, setElapsedMs] = useState(0)
  const [roundMs, setRoundMs] = useState<number[]>([])
  const [marks, setMarks] = useState<Record<string, boolean>>({})
  const [summary, setSummary] = useState<TwoWordSummary | null>(null)
  const [error, setError] = useState<unknown>(null)
  const roundStartedAtRef = useRef(0)

  /** 教材は英語だけ。韓国語では使えないことを画面で伝える。 */
  const supported = lang === 'en'
  const content: TwoWordSet | null = useMemo(() => (supported ? loadTwoWord() : null), [supported])

  useEffect(() => subscribe((next) => {
    settingsRef.current = next
    setSettingsState(next)
  }), [])

  useEffect(() => () => {
    stopSpeaking()
  }, [])

  const captureError = useCallback((caught: unknown) => {
    console.error('2 語で言うでエラーが発生しました', caught)
    setError(caught ?? new Error('不明なエラーが発生しました'))
  }, [])

  const round = session?.rounds[roundIndex] ?? null
  const current: TwoWordQuestion | null = round?.questions[questionIndex] ?? null

  const start = useCallback(() => {
    if (!content) {
      return
    }
    try {
      unlockAudio()
      const stats = readTwoWordStats(lang)
      const built = buildTwoWordSession({
        content,
        level: settingsRef.current.twoWordLevel,
        order: settingsRef.current.twoWordOrder,
        recent: stats.recent,
      })
      stopSpeaking()
      setSession(built)
      setRoundIndex(0)
      setQuestionIndex(0)
      setRoundMs([])
      setMarks({})
      setSummary(null)
      setError(null)
      roundStartedAtRef.current = Date.now()
      setElapsedMs(0)
      setPhase('asking')
    } catch (startError) {
      captureError(startError)
    }
  }, [captureError, content, lang])

  // セットの時間を進める
  useEffect(() => {
    if (phase !== 'asking') {
      return
    }
    const timer = setInterval(() => {
      setElapsedMs(Date.now() - roundStartedAtRef.current)
    }, TICK_MS)
    return () => {
      clearInterval(timer)
    }
  }, [phase])

  /** 声に出したら次の問題へ。4 問終わったら答え合わせ。 */
  const next = useCallback(() => {
    if (phase !== 'asking' || !round) {
      return
    }
    if (questionIndex + 1 < round.questions.length) {
      setQuestionIndex(questionIndex + 1)
      return
    }
    const ms = Date.now() - roundStartedAtRef.current
    setElapsedMs(ms)
    setRoundMs((previous) => [...previous, ms])
    // 答え合わせは「言えた」を既定にして、言えなかったものだけ直す
    setMarks((previous) => {
      const updated = { ...previous }
      for (const question of round.questions) {
        updated[question.id] = true
      }
      return updated
    })
    setPhase('checking')
  }, [phase, questionIndex, round])

  const toggleSaid = useCallback((questionId: string) => {
    setMarks((previous) => ({ ...previous, [questionId]: !previous[questionId] }))
  }, [])

  const finish = useCallback((allMarks: Record<string, boolean>, allRoundMs: number[]) => {
    if (!session) {
      return
    }
    const questions = session.rounds.flatMap((item) => item.questions)
    const said = questions.filter((question) => allMarks[question.id]).length
    const result: TwoWordResult = {
      at: new Date().toISOString(),
      level: session.level,
      said,
      total: questions.length,
      roundMs: allRoundMs,
    }
    let history: TwoWordResult[] = [result]
    try {
      const stats = appendResult(readTwoWordStats(lang), result, questions.map((question) => question.id))
      writeTwoWordStats(lang, stats)
      history = stats.history
    } catch (saveError) {
      console.error('2 語で言うの成績を保存できませんでした', saveError)
      setError(new Error('成績をこの端末に保存できませんでした。練習の結果は表示だけになります', { cause: saveError }))
    }
    setSummary({
      said,
      total: questions.length,
      roundMs: allRoundMs,
      reached: reachedTarget(result),
      bestMs: bestRoundMs(history, session.level),
      nextLevel: suggestNextLevel(history, session.level),
    })
    setPhase('finished')
  }, [lang, session])

  /** 答え合わせを終えて次のセットへ。最後なら結果へ。 */
  const nextRound = useCallback(() => {
    if (phase !== 'checking' || !session) {
      return
    }
    stopSpeaking()
    if (roundIndex + 1 < session.rounds.length) {
      setRoundIndex(roundIndex + 1)
      setQuestionIndex(0)
      roundStartedAtRef.current = Date.now()
      setElapsedMs(0)
      setPhase('asking')
      return
    }
    finish(marks, roundMs)
  }, [finish, marks, phase, roundIndex, roundMs, session])

  const say = useCallback((text: string) => {
    void speak(text, {
      lang: 'en',
      rate: settingsRef.current.ttsRate,
      voiceURI: settingsRef.current.ttsVoice.en,
    }).catch(captureError)
  }, [captureError])

  const stop = useCallback(() => {
    stopSpeaking()
    setSession(null)
    setPhase('idle')
  }, [])

  const setLevel = useCallback((level: TwoWordLevel) => {
    try {
      setSettings({ twoWordLevel: level })
    } catch (settingsError) {
      captureError(settingsError)
    }
  }, [captureError])

  /** 動詞の並びと、問題の出る順。 */
  const setOrder = useCallback((order: TwoWordOrder) => {
    try {
      setSettings({ twoWordOrder: order })
    } catch (settingsError) {
      captureError(settingsError)
    }
  }, [captureError])

  return {
    supported,
    verbs: content?.verbs ?? [],
    phase,
    level: settings.twoWordLevel,
    order: settings.twoWordOrder,
    session,
    round,
    roundIndex,
    roundCount: session?.rounds.length ?? 0,
    questionIndex,
    current,
    elapsedMs,
    roundMs,
    marks,
    summary,
    error,
    start,
    next,
    toggleSaid,
    nextRound,
    say,
    stop,
    setLevel,
    setOrder,
    clearError: () => setError(null),
  }
}
