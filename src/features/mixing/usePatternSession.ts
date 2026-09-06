import { useCallback, useEffect, useRef, useState } from 'react'
import { loadCore } from '../../content/coreSchema'
import {
  createSpeechInput,
  speak,
  stopSpeaking,
  unlockAudio,
  type SpeechInput,
} from '../../services/speech'
import { transcribeAudio } from '../../services/gemini/transcribe'
import {
  getSettings,
  setSettings,
  subscribe,
  type MixingLevel,
  type Settings,
} from '../../services/settings'
import { getSession } from '../../services/supabase/auth'
import {
  insertSpeakingSession,
  listMixingProgress,
  upsertMixingProgress,
} from '../../services/supabase/db'
import type { MixingProgressRow } from '../../services/supabase/types'
import { scorePronunciation } from '../cards/scoring'
import { buildHint, type Hint } from './hint'
import { suggestLevel } from './mastery'
import { withPersonalWords } from './personal'
import { buildPatternSession, type PatternItem, type PatternSession } from './patternSession'
import { buildComboHistory, buildFrameStats, identityKey, progressIdentity } from './progress'

export type PatternPhase =
  | 'loading'
  | 'idle'
  | 'cue'
  | 'recording'
  | 'checking'
  | 'hint'
  | 'model'
  | 'finished'

export type PatternAttempt = {
  itemId: string
  round: number
  firstTry: boolean
  usedHint: boolean
  latencyMs: number | null
  heardText: string
}

export type PatternSummary = {
  total: number
  firstTry: number
  withHint: number
  roundLatencyMs: (number | null)[]
  nextLevel: MixingLevel | null
}

/** 同じ項目で言い直せる回数。ヒントを見てからの 1 回だけ。 */
const MAX_TRIES = 2

function averageLatency(attempts: PatternAttempt[]): number | null {
  const samples = attempts
    .map((attempt) => attempt.latencyMs)
    .filter((value): value is number => value !== null)
  if (samples.length === 0) {
    return null
  }
  return Math.round(samples.reduce((total, value) => total + value, 0) / samples.length)
}

export function usePatternSession(lang: 'en' | 'ko') {
  const [settings, setSettingsState] = useState<Settings>(getSettings)
  const settingsRef = useRef(settings)
  const [phase, setPhase] = useState<PatternPhase>('loading')
  const [session, setSession] = useState<PatternSession | null>(null)
  const [roundIndex, setRoundIndex] = useState(0)
  const [itemIndex, setItemIndex] = useState(0)
  const [hint, setHint] = useState<Hint | null>(null)
  const [heardText, setHeardText] = useState<string | null>(null)
  const [attempts, setAttempts] = useState<PatternAttempt[]>([])
  const [summary, setSummary] = useState<PatternSummary | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [sttEngine, setSttEngine] = useState<'webspeech' | 'gemini' | null>(null)

  const userIdRef = useRef<string | null>(null)
  const rowsRef = useRef(new Map<string, MixingProgressRow>())
  const inputRef = useRef<SpeechInput | null>(null)
  const cueEndedAtRef = useRef<number | null>(null)
  const recordStartedAtRef = useRef<number | null>(null)
  const triesRef = useRef(0)
  const generationRef = useRef(0)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  useEffect(() => subscribe((next) => {
    settingsRef.current = next
    setSettingsState(next)
  }), [])

  const captureError = useCallback((caught: unknown) => {
    console.error('型の練習でエラーが発生しました', caught)
    setError(caught ?? new Error('不明なエラーが発生しました'))
  }, [])

  const cancelActive = useCallback(() => {
    generationRef.current += 1
    stopSpeaking()
    inputRef.current?.cancel()
    inputRef.current = null
    cueEndedAtRef.current = null
    recordStartedAtRef.current = null
  }, [])

  // 読み込み: 語彙と保存済みの成績
  const [ready, setReady] = useState(false)
  useEffect(() => {
    let active = true
    cancelActive()
    setReady(false)
    setPhase('loading')
    setSession(null)
    setSummary(null)
    setAttempts([])
    setError(null)

    const load = async () => {
      try {
        const authSession = await getSession()
        if (!authSession) {
          throw new Error('ログイン情報を確認できませんでした')
        }
        const rows = await listMixingProgress(authSession.user.id, lang)
        if (!active) {
          return
        }
        userIdRef.current = authSession.user.id
        rowsRef.current = new Map(rows.map((row) => [identityKey({
          frameId: row.frame_id,
          verbText: row.verb_text,
          nounText: row.noun_text,
        }), row]))
        setReady(true)
        setPhase('idle')
      } catch (loadError) {
        if (active) {
          captureError(loadError)
          setPhase('idle')
        }
      }
    }

    void load()
    return () => {
      active = false
      cancelActive()
    }
  }, [cancelActive, captureError, lang])

  const currentItem: PatternItem | null = session
    ? session.rounds[roundIndex]?.[itemIndex] ?? null
    : null

  const saveAttempt = useCallback(async (item: PatternItem, attempt: PatternAttempt) => {
    const userId = userIdRef.current
    if (!userId) {
      return
    }
    const identity = progressIdentity(item.frame, item.words)
    const key = identityKey(identity)
    const previous = rowsRef.current.get(key)

    const updated = await upsertMixingProgress({
      user_id: userId,
      lang,
      frame_id: identity.frameId,
      verb_text: identity.verbText,
      noun_text: identity.nounText,
      understood_count: (previous?.understood_count ?? 0) + (attempt.firstTry || !attempt.usedHint ? 1 : 0),
      attempt_count: (previous?.attempt_count ?? 0) + 1,
      first_try_count: (previous?.first_try_count ?? 0) + (attempt.firstTry ? 1 : 0),
      hint_count: (previous?.hint_count ?? 0) + (attempt.usedHint ? 1 : 0),
      latency_ms_total: (previous?.latency_ms_total ?? 0) + (attempt.latencyMs ?? 0),
      latency_samples: (previous?.latency_samples ?? 0) + (attempt.latencyMs === null ? 0 : 1),
      last_at: new Date().toISOString(),
    })
    rowsRef.current.set(key, updated)
  }, [lang])

  const finish = useCallback(async (allAttempts: PatternAttempt[]) => {
    const userId = userIdRef.current
    const roundCount = session?.rounds.length ?? 0
    const roundLatencyMs = Array.from({ length: roundCount }, (_, round) => (
      averageLatency(allAttempts.filter((attempt) => attempt.round === round))
    ))
    const firstTry = allAttempts.filter((attempt) => attempt.firstTry).length
    const core = withPersonalWords(loadCore(lang), settingsRef.current.personalWords, lang)
    const stats = buildFrameStats([...rowsRef.current.values()])
    const level = settingsRef.current.mixingLevel
    const suggested = suggestLevel(level, core.frames, stats)

    setSummary({
      total: allAttempts.length,
      firstTry,
      withHint: allAttempts.filter((attempt) => attempt.usedHint).length,
      roundLatencyMs,
      nextLevel: suggested !== level ? suggested : null,
    })
    setPhase('finished')

    if (!userId || allAttempts.length === 0) {
      return
    }
    try {
      await insertSpeakingSession({
        user_id: userId,
        lang,
        kind: 'pattern',
        rounds: roundLatencyMs.map((latency, round) => ({
          round,
          avg_latency_ms: latency,
          first_try: allAttempts.filter((attempt) => attempt.round === round && attempt.firstTry).length,
          total: allAttempts.filter((attempt) => attempt.round === round).length,
        })),
        understood_ratio: firstTry / allAttempts.length,
        avg_latency_ms: averageLatency(allAttempts),
      })
    } catch (saveError) {
      captureError(saveError)
    }
  }, [captureError, lang, session])

  const advance = useCallback((allAttempts: PatternAttempt[]) => {
    triesRef.current = 0
    setHint(null)
    setHeardText(null)
    if (!session) {
      return
    }
    const round = session.rounds[roundIndex] ?? []
    if (itemIndex + 1 < round.length) {
      setItemIndex(itemIndex + 1)
      setPhase('cue')
      return
    }
    if (roundIndex + 1 < session.rounds.length) {
      setRoundIndex(roundIndex + 1)
      setItemIndex(0)
      setPhase('cue')
      return
    }
    void finish(allAttempts)
  }, [finish, itemIndex, roundIndex, session])

  const start = useCallback(() => {
    if (!ready || phase === 'recording' || phase === 'checking') {
      return
    }
    try {
      unlockAudio()
      const core = withPersonalWords(loadCore(lang), settingsRef.current.personalWords, lang)
      const rows = [...rowsRef.current.values()]
      const built = buildPatternSession({
        core,
        level: settingsRef.current.mixingLevel,
        stats: buildFrameStats(rows),
        history: buildComboHistory(core, rows),
      })
      if (built.items.length === 0) {
        throw new Error('練習できる型が見つかりませんでした')
      }
      cancelActive()
      setSession(built)
      setRoundIndex(0)
      setItemIndex(0)
      setAttempts([])
      setSummary(null)
      setHint(null)
      setHeardText(null)
      setError(null)
      triesRef.current = 0
      setPhase('cue')
    } catch (startError) {
      captureError(startError)
    }
  }, [cancelActive, captureError, lang, phase, ready])

  // 合図を読み上げ、終わったら録音を始める
  useEffect(() => {
    if (phase !== 'cue' || !currentItem) {
      return
    }
    generationRef.current += 1
    const generation = generationRef.current
    let cancelled = false

    const run = async () => {
      try {
        stopSpeaking()
        const text = hint ? hint.textJa : currentItem.promptJa
        await speak(text, {
          lang: 'ja',
          rate: 1,
          voiceURI: settingsRef.current.ttsVoiceJa ?? undefined,
        })
        if (cancelled || generationRef.current !== generation || !mountedRef.current) {
          return
        }
        cueEndedAtRef.current = Date.now()

        const input = createSpeechInput({
          lang,
          engine: settingsRef.current.sttEngine,
          transcribe: transcribeAudio,
        })
        inputRef.current = input
        setSttEngine(input.engine)
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
  }, [captureError, currentItem, hint, lang, phase])

  const stopRecording = useCallback(async () => {
    const input = inputRef.current
    const item = currentItem
    if (!input || !item || phase !== 'recording') {
      return
    }
    generationRef.current += 1
    const generation = generationRef.current
    setPhase('checking')

    try {
      const result = await input.stop()
      inputRef.current = null
      if (generationRef.current !== generation || !mountedRef.current) {
        return
      }
      const spoken = result.text.trim()
      setHeardText(spoken)

      const cueEndedAt = cueEndedAtRef.current
      const recordStartedAt = recordStartedAtRef.current
      const latencyMs = (
        result.onsetMs !== undefined && cueEndedAt !== null && recordStartedAt !== null
      )
        ? Math.max(0, recordStartedAt - cueEndedAt) + result.onsetMs
        : null

      const score = scorePronunciation(spoken, { text: item.answer, example: '' }, lang)
      triesRef.current += 1
      const usedHint = triesRef.current > 1

      if (score.matched) {
        const attempt: PatternAttempt = {
          itemId: item.id,
          round: roundIndex,
          firstTry: !usedHint,
          usedHint,
          latencyMs: usedHint ? null : latencyMs,
          heardText: spoken,
        }
        const next = [...attempts, attempt]
        setAttempts(next)
        await saveAttempt(item, attempt)
        if (generationRef.current !== generation || !mountedRef.current) {
          return
        }
        await speak(item.answer, {
          lang,
          rate: settingsRef.current.ttsRate,
          voiceURI: settingsRef.current.ttsVoice[lang],
        })
        if (generationRef.current !== generation || !mountedRef.current) {
          return
        }
        advance(next)
        return
      }

      if (triesRef.current < MAX_TRIES) {
        const nextHint = buildHint(spoken, item.answer, lang)
          ?? { kind: 'start' as const, token: item.answer, textJa: 'もう一度、言ってみましょう' }
        setHint(nextHint)
        setPhase('hint')
        return
      }

      const attempt: PatternAttempt = {
        itemId: item.id,
        round: roundIndex,
        firstTry: false,
        usedHint: true,
        latencyMs: null,
        heardText: spoken,
      }
      const next = [...attempts, attempt]
      setAttempts(next)
      await saveAttempt(item, attempt)
      if (generationRef.current !== generation || !mountedRef.current) {
        return
      }
      setPhase('model')
      await speak(item.answer, {
        lang,
        rate: settingsRef.current.ttsRate,
        voiceURI: settingsRef.current.ttsVoice[lang],
      })
    } catch (stopError) {
      if (generationRef.current === generation && mountedRef.current) {
        inputRef.current?.cancel()
        inputRef.current = null
        captureError(stopError)
        setPhase('idle')
      }
    }
  }, [advance, attempts, captureError, currentItem, lang, phase, roundIndex, saveAttempt])

  /** ヒントを聞いてからの言い直し。 */
  const retry = useCallback(() => {
    if (phase !== 'hint') {
      return
    }
    setPhase('cue')
  }, [phase])

  /** 模範を聞いたあと、次の項目へ。 */
  const next = useCallback(() => {
    if (phase !== 'model') {
      return
    }
    stopSpeaking()
    advance(attempts)
  }, [advance, attempts, phase])

  const stop = useCallback(() => {
    cancelActive()
    triesRef.current = 0
    setHint(null)
    setHeardText(null)
    setSession(null)
    setPhase('idle')
  }, [cancelActive])

  const setLevel = useCallback((level: MixingLevel) => {
    try {
      setSettings({ mixingLevel: level })
    } catch (settingsError) {
      captureError(settingsError)
    }
  }, [captureError])

  const round = session?.rounds[roundIndex] ?? []

  return {
    phase,
    level: settings.mixingLevel,
    session,
    currentItem,
    roundIndex,
    roundCount: session?.rounds.length ?? 0,
    itemIndex,
    itemCount: round.length,
    hint,
    heardText,
    summary,
    sttEngine,
    error,
    start,
    stopRecording,
    retry,
    next,
    stop,
    setLevel,
    clearError: () => setError(null),
  }
}
