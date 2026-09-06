import { useCallback, useEffect, useRef, useState } from 'react'
import { loadCore } from '../../content/coreSchema'
import {
  generateQuickQuestions,
  judgeQuickAnswers,
  type QuickAnswerJudgment,
  type QuickQuestion,
} from '../../services/gemini/speaking'
import { transcribeAudio } from '../../services/gemini/transcribe'
import {
  createSpeechInput,
  speak,
  stopSpeaking,
  unlockAudio,
  type SpeechInput,
} from '../../services/speech'
import { getSettings, subscribe, type Settings } from '../../services/settings'
import { getSession } from '../../services/supabase/auth'
import { insertSpeakingSession, listMixingProgress } from '../../services/supabase/db'
import { resolveCheck, type ResolvedCheck } from './checkMode'
import { withPersonalWords } from './personal'
import { buildFrameStats } from './progress'
import { frameMastery } from './mastery'

export type QuickPhase =
  | 'idle'
  | 'preparing'
  | 'cue'
  /** 自分で判定するとき: 声に出して答え、言い終わったらタップ。 */
  | 'answering'
  | 'recording'
  | 'judging'
  | 'finished'

export type QuickAnswer = {
  round: number
  index: number
  heardText: string
  latencyMs: number | null
}

export type QuickSummary = {
  roundLatencyMs: (number | null)[]
  understood: number
  total: number
  judgments: QuickAnswerJudgment[]
  answers: QuickAnswer[]
}

export const QUICK_ROUNDS = 3
export const QUICK_TARGET_SECONDS = [3, 2, 1.5] as const
const QUESTION_COUNT = 8

function cacheKey(lang: 'en' | 'ko'): string {
  const today = new Date().toISOString().slice(0, 10)
  return `lla.quick.${lang}.${today}`
}

function readCache(lang: 'en' | 'ko'): QuickQuestion[] | null {
  try {
    const raw = localStorage.getItem(cacheKey(lang))
    if (!raw) {
      return null
    }
    const parsed = JSON.parse(raw) as unknown
    if (
      Array.isArray(parsed)
      && parsed.length > 0
      && parsed.every((item) => (
        typeof item === 'object' && item !== null
        && typeof (item as QuickQuestion).q === 'string'
        && typeof (item as QuickQuestion).ja === 'string'
      ))
    ) {
      return parsed as QuickQuestion[]
    }
    return null
  } catch (error) {
    console.error('今日の質問を読み込めませんでした', error)
    return null
  }
}

function writeCache(lang: 'en' | 'ko', questions: QuickQuestion[]): void {
  try {
    localStorage.setItem(cacheKey(lang), JSON.stringify(questions))
  } catch (error) {
    console.error('今日の質問を保存できませんでした', error)
  }
}

function average(values: (number | null)[]): number | null {
  const samples = values.filter((value): value is number => value !== null)
  if (samples.length === 0) {
    return null
  }
  return Math.round(samples.reduce((total, value) => total + value, 0) / samples.length)
}

export function useQuickSession(lang: 'en' | 'ko') {
  const [settings, setSettingsState] = useState<Settings>(getSettings)
  const settingsRef = useRef(settings)
  const [phase, setPhase] = useState<QuickPhase>('idle')
  const [questions, setQuestions] = useState<QuickQuestion[]>([])
  const [roundIndex, setRoundIndex] = useState(0)
  const [index, setIndex] = useState(0)
  const [answers, setAnswers] = useState<QuickAnswer[]>([])
  const [summary, setSummary] = useState<QuickSummary | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [checkMode, setCheckMode] = useState<ResolvedCheck>(() => resolveCheck(getSettings().patternCheck))

  const inputRef = useRef<SpeechInput | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const cueEndedAtRef = useRef<number | null>(null)
  const recordStartedAtRef = useRef<number | null>(null)
  const generationRef = useRef(0)
  const mountedRef = useRef(true)
  const userIdRef = useRef<string | null>(null)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  useEffect(() => subscribe((next) => {
    settingsRef.current = next
    setSettingsState(next)
    setCheckMode(resolveCheck(next.patternCheck))
  }), [])

  useEffect(() => {
    let active = true
    void getSession()
      .then((authSession) => {
        if (active) {
          userIdRef.current = authSession?.user.id ?? null
        }
      })
      .catch((sessionError) => {
        console.error('ログイン情報を確認できませんでした', sessionError)
      })
    return () => {
      active = false
    }
  }, [])

  const captureError = useCallback((caught: unknown) => {
    console.error('即答の練習でエラーが発生しました', caught)
    setError(caught ?? new Error('不明なエラーが発生しました'))
  }, [])

  const cancelActive = useCallback(() => {
    generationRef.current += 1
    stopSpeaking()
    inputRef.current?.cancel()
    inputRef.current = null
    abortRef.current?.abort()
    abortRef.current = null
  }, [])

  useEffect(() => {
    cancelActive()
    setPhase('idle')
    setQuestions([])
    setAnswers([])
    setSummary(null)
    setError(null)
    return cancelActive
  }, [cancelActive, lang])

  const start = useCallback(async () => {
    if (phase === 'preparing' || phase === 'recording') {
      return
    }
    generationRef.current += 1
    const generation = generationRef.current
    const controller = new AbortController()
    abortRef.current = controller
    setError(null)
    setPhase('preparing')

    try {
      unlockAudio()
      setCheckMode(resolveCheck(settingsRef.current.patternCheck))
      let list = readCache(lang)
      if (!list) {
        const core = withPersonalWords(loadCore(lang), settingsRef.current.personalWords, lang)
        const userId = userIdRef.current
        const rows = userId ? await listMixingProgress(userId, lang) : []
        const stats = buildFrameStats(rows)
        const statsById = new Map(stats.map((item) => [item.frameId, item]))
        const frames = core.frames
          .filter((frame) => frame.level <= settingsRef.current.mixingLevel)
          .sort((left, right) => (
            frameMastery(statsById.get(right.id)).accuracy - frameMastery(statsById.get(left.id)).accuracy
          ))
          .slice(0, 4)
          .map((frame) => ({ pattern: frame.pattern, hint_ja: frame.hint_ja }))

        list = await generateQuickQuestions({
          lang,
          frames,
          personalWords: settingsRef.current.personalWords
            .filter((word) => word[lang].trim() !== '')
            .map((word) => ({ text: word[lang], kind: word.kind })),
          count: QUESTION_COUNT,
        }, { signal: controller.signal })
        if (generationRef.current !== generation || !mountedRef.current) {
          return
        }
        writeCache(lang, list)
      }

      setQuestions(list)
      setRoundIndex(0)
      setIndex(0)
      setAnswers([])
      setSummary(null)
      setPhase('cue')
    } catch (startError) {
      if (generationRef.current === generation && mountedRef.current) {
        captureError(startError)
        setPhase('idle')
      }
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null
      }
    }
  }, [captureError, lang, phase])

  const current = questions[index] ?? null

  const saveSession = useCallback(async (
    allAnswers: QuickAnswer[],
    roundLatencyMs: (number | null)[],
    understoodRatio: number | null,
  ) => {
    if (!userIdRef.current || allAnswers.length === 0) {
      return
    }
    try {
      await insertSpeakingSession({
        user_id: userIdRef.current,
        lang,
        kind: 'quick',
        rounds: roundLatencyMs.map((latency, round) => ({ round, avg_latency_ms: latency })),
        understood_ratio: understoodRatio,
        avg_latency_ms: average(allAnswers.map((answer) => answer.latencyMs)),
      })
    } catch (saveError) {
      console.error('即答の記録を保存できませんでした', saveError)
      captureError(saveError)
    }
  }, [captureError, lang])

  const finish = useCallback(async (allAnswers: QuickAnswer[]) => {
    generationRef.current += 1
    const generation = generationRef.current
    const roundLatencyMs = Array.from({ length: QUICK_ROUNDS }, (_, round) => (
      average(allAnswers.filter((answer) => answer.round === round).map((answer) => answer.latencyMs))
    ))

    // 自分で判定するときは聞き取った文が無いので、判定は頼まず速さだけを記録する
    if (checkMode === 'self') {
      setSummary({ roundLatencyMs, understood: 0, total: 0, judgments: [], answers: allAnswers })
      setPhase('finished')
      await saveSession(allAnswers, roundLatencyMs, null)
      return
    }

    const controller = new AbortController()
    abortRef.current = controller
    setPhase('judging')
    try {
      const judgments = await judgeQuickAnswers({
        lang,
        items: allAnswers.map((answer) => ({
          q: questions[answer.index]?.q ?? '',
          answer: answer.heardText,
        })),
      }, { signal: controller.signal })
      if (generationRef.current !== generation || !mountedRef.current) {
        return
      }
      const understood = judgments.filter((judgment) => judgment.understood).length
      setSummary({
        roundLatencyMs,
        understood,
        total: judgments.length,
        judgments,
        answers: allAnswers,
      })
      setPhase('finished')
      await saveSession(allAnswers, roundLatencyMs, judgments.length > 0 ? understood / judgments.length : null)
    } catch (judgeError) {
      if (generationRef.current === generation && mountedRef.current) {
        captureError(judgeError)
        // 判定に失敗しても、速さの記録は見せる
        setSummary({ roundLatencyMs, understood: 0, total: 0, judgments: [], answers: allAnswers })
        setPhase('finished')
      }
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null
      }
    }
  }, [captureError, checkMode, lang, questions, saveSession])

  // 質問を読み上げ、終わったら録音(または答える時間)を始める
  useEffect(() => {
    if (phase !== 'cue' || !current) {
      return
    }
    generationRef.current += 1
    const generation = generationRef.current
    let cancelled = false

    const run = async () => {
      try {
        stopSpeaking()
        await speak(current.q, {
          lang,
          rate: settingsRef.current.ttsRate,
          voiceURI: settingsRef.current.ttsVoice[lang],
        })
        if (cancelled || generationRef.current !== generation || !mountedRef.current) {
          return
        }
        cueEndedAtRef.current = Date.now()

        if (checkMode === 'self') {
          setPhase('answering')
          return
        }

        const input = createSpeechInput({
          lang,
          engine: settingsRef.current.sttEngine,
          transcribe: transcribeAudio,
        })
        inputRef.current = input
        await input.start()
        if (cancelled || generationRef.current !== generation || !mountedRef.current) {
          input.cancel()
          inputRef.current = null
          return
        }
        recordStartedAtRef.current = Date.now()
        setPhase('recording')
      } catch (cueError) {
        if (!cancelled && generationRef.current === generation && mountedRef.current) {
          inputRef.current?.cancel()
          inputRef.current = null
          captureError(cueError)
          setPhase('idle')
        }
      }
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [captureError, checkMode, current, lang, phase])

  const moveOn = useCallback((next: QuickAnswer[]) => {
    setAnswers(next)
    if (index + 1 < questions.length) {
      setIndex(index + 1)
      setPhase('cue')
      return
    }
    if (roundIndex + 1 < QUICK_ROUNDS) {
      setRoundIndex(roundIndex + 1)
      setIndex(0)
      setPhase('cue')
      return
    }
    void finish(next)
  }, [finish, index, questions.length, roundIndex])

  /** 自分で判定するとき: 言い終わったらタップ。質問の終わりからここまでを応答時間にする。 */
  const answered = useCallback(() => {
    if (phase !== 'answering') {
      return
    }
    const cueEndedAt = cueEndedAtRef.current
    const latencyMs = cueEndedAt === null ? null : Math.max(0, Date.now() - cueEndedAt)
    moveOn([...answers, { round: roundIndex, index, heardText: '', latencyMs }])
  }, [answers, index, moveOn, phase, roundIndex])

  const stopRecording = useCallback(async () => {
    const input = inputRef.current
    if (!input || phase !== 'recording') {
      return
    }
    generationRef.current += 1
    const generation = generationRef.current

    try {
      const result = await input.stop()
      inputRef.current = null
      if (generationRef.current !== generation || !mountedRef.current) {
        return
      }
      const cueEndedAt = cueEndedAtRef.current
      const recordStartedAt = recordStartedAtRef.current
      const latencyMs = (
        result.onsetMs !== undefined && cueEndedAt !== null && recordStartedAt !== null
      )
        ? Math.max(0, recordStartedAt - cueEndedAt) + result.onsetMs
        : null

      moveOn([...answers, { round: roundIndex, index, heardText: result.text.trim(), latencyMs }])
    } catch (stopError) {
      if (generationRef.current === generation && mountedRef.current) {
        inputRef.current?.cancel()
        inputRef.current = null
        captureError(stopError)
        setPhase('idle')
      }
    }
  }, [answers, captureError, index, moveOn, phase, roundIndex])

  const stop = useCallback(() => {
    cancelActive()
    setPhase('idle')
  }, [cancelActive])

  return {
    phase,
    checkMode,
    questions,
    current,
    roundIndex,
    index,
    targetSeconds: QUICK_TARGET_SECONDS[Math.min(roundIndex, QUICK_TARGET_SECONDS.length - 1)],
    summary,
    error,
    start,
    answered,
    stopRecording,
    stop,
    clearError: () => setError(null),
  }
}
