import { useCallback, useEffect, useRef, useState } from 'react'
import { loadCore } from '../../content/coreSchema'
import {
  createSpeechInput,
  isWebSpeechAvailable,
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
import { resolveCheck, type ResolvedCheck } from './checkMode'
import { buildHint, type Hint } from './hint'
import { suggestLevel } from './mastery'
import { withPersonalWords } from './personal'
import { buildPatternSession, type PatternItem, type PatternSession } from './patternSession'
import { buildComboHistory, buildFrameStats, identityKey, progressIdentity } from './progress'

export type PatternPhase =
  | 'loading'
  | 'idle'
  /** 新しい型に入る前の紹介。解説と例文を見せる。 */
  | 'intro'
  /** 録音の準備中(合図を表示した直後)。 */
  | 'starting'
  | 'recording'
  | 'checking'
  | 'hint'
  /** 自分で判定するとき: 合図を見て声に出す時間。数秒たつか「答えを見る」で模範へ。 */
  | 'thinking'
  /** 言えても言えなくても、模範を見せる。 */
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

/**
 * 保存の失敗が「マイグレーション未適用」なら、何をすればよいかを伝える。
 * 列が無いだけなので練習そのものは続けられる。
 */
function migrationError(error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error)
  if (/schema cache|column .* does not exist|first_try_count|latency_ms_total|speaking_sessions/i.test(message)) {
    return new Error(
      '成績を保存できません。Supabase の SQL Editor で supabase/migrations/004_speaking.sql を実行してください。'
      + '練習はこのまま続けられます',
    )
  }
  return error instanceof Error ? error : new Error(String(error))
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
  /** 直前の項目を言えたかどうか。模範の見出しに使う。 */
  const [matched, setMatched] = useState(false)
  const [checkMode, setCheckModeState] = useState<ResolvedCheck>(() => resolveCheck(getSettings().patternCheck))
  /** 自分で判定するときの、声に出す残り秒数。 */
  const [secondsLeft, setSecondsLeft] = useState(0)

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
    setCheckModeState(resolveCheck(next.patternCheck))
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
    // 保存に失敗しても練習は続ける。成績が残らないだけなので、伝えて先に進む。
    const identity = progressIdentity(item.frame, item.words)
    const key = identityKey(identity)
    const previous = rowsRef.current.get(key)

    try {
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
    } catch (saveError) {
      console.error('練習の成績を保存できませんでした', saveError)
      setError(migrationError(saveError))
    }
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
      console.error('練習の記録を保存できませんでした', saveError)
      setError(migrationError(saveError))
    }
  }, [lang, session])

  const advance = useCallback((allAttempts: PatternAttempt[]) => {
    triesRef.current = 0
    setHint(null)
    setHeardText(null)
    setMatched(false)
    if (!session) {
      return
    }
    const round = session.rounds[roundIndex] ?? []
    if (itemIndex + 1 < round.length) {
      const changingFrame = round[itemIndex + 1]?.frame.id !== round[itemIndex]?.frame.id
      setItemIndex(itemIndex + 1)
      // 1 周目で型が変わるときだけ紹介を挟む。2 周目は知っているので挟まない。
      setPhase(changingFrame && roundIndex === 0 ? 'intro' : 'starting')
      return
    }
    if (roundIndex + 1 < session.rounds.length) {
      setRoundIndex(roundIndex + 1)
      setItemIndex(0)
      setPhase('starting')
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
      setCheckModeState(resolveCheck(settingsRef.current.patternCheck))
      setSession(built)
      setRoundIndex(0)
      setItemIndex(0)
      setAttempts([])
      setSummary(null)
      setHint(null)
      setHeardText(null)
      setError(null)
      triesRef.current = 0
      setPhase('intro')
    } catch (startError) {
      captureError(startError)
    }
  }, [cancelActive, captureError, lang, phase, ready])

  // 合図は画面に出すだけ。読み上げずに、すぐ録音(または声に出す時間)を始める
  useEffect(() => {
    if (phase !== 'starting' || !currentItem) {
      return
    }
    generationRef.current += 1
    const generation = generationRef.current
    let cancelled = false

    if (checkMode === 'self') {
      stopSpeaking()
      setSecondsLeft(Math.max(1, Math.round(settingsRef.current.lessonPauseSeconds)))
      setPhase('thinking')
      return
    }

    const run = async () => {
      try {
        stopSpeaking()
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
  }, [captureError, checkMode, currentItem, lang, phase])

  const speakAnswer = useCallback(async (item: PatternItem) => {
    try {
      await speak(item.answer, {
        lang,
        rate: settingsRef.current.ttsRate,
        voiceURI: settingsRef.current.ttsVoice[lang],
      })
    } catch (speakError) {
      captureError(speakError)
    }
  }, [captureError, lang])

  /** 自分で判定するとき: 声に出す時間が過ぎたら模範へ。 */
  const reveal = useCallback(() => {
    if (phase !== 'thinking' || !currentItem) {
      return
    }
    setPhase('model')
    void speakAnswer(currentItem)
  }, [currentItem, phase, speakAnswer])

  useEffect(() => {
    if (phase !== 'thinking') {
      return
    }
    const timer = setInterval(() => {
      setSecondsLeft((current) => current - 1)
    }, 1000)
    return () => {
      clearInterval(timer)
    }
  }, [phase])

  useEffect(() => {
    if (phase === 'thinking' && secondsLeft <= 0) {
      reveal()
    }
  }, [phase, reveal, secondsLeft])

  /** 自分で判定するとき: 言えたか言えなかったかを記録して次へ。 */
  const judgeSelf = useCallback(async (said: boolean) => {
    const item = currentItem
    if (phase !== 'model' || checkMode !== 'self' || !item) {
      return
    }
    stopSpeaking()
    const attempt: PatternAttempt = {
      itemId: item.id,
      round: roundIndex,
      firstTry: said,
      usedHint: false,
      latencyMs: null,
      heardText: '',
    }
    const next = [...attempts, attempt]
    setAttempts(next)
    await saveAttempt(item, attempt)
    if (!mountedRef.current) {
      return
    }
    advance(next)
  }, [advance, attempts, checkMode, currentItem, phase, roundIndex, saveAttempt])

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
        setMatched(true)
        setPhase('model')
        await saveAttempt(item, attempt)
        if (generationRef.current !== generation || !mountedRef.current) {
          return
        }
        await speakAnswer(item)
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
      setMatched(false)
      setPhase('model')
      await saveAttempt(item, attempt)
      if (generationRef.current !== generation || !mountedRef.current) {
        return
      }
      await speakAnswer(item)
    } catch (stopError) {
      if (generationRef.current === generation && mountedRef.current) {
        inputRef.current?.cancel()
        inputRef.current = null
        captureError(stopError)
        setPhase('idle')
      }
    }
  }, [attempts, captureError, currentItem, lang, phase, roundIndex, saveAttempt, speakAnswer])

  /** ヒントを聞いてからの言い直し。 */
  const retry = useCallback(() => {
    if (phase !== 'hint') {
      return
    }
    setPhase('starting')
  }, [phase])

  /** 型の紹介を読み終えて、練習に入る。 */
  const beginItems = useCallback(() => {
    if (phase !== 'intro') {
      return
    }
    setPhase('starting')
  }, [phase])

  /** 模範を聞いたあと、次の項目へ(録音で確かめるとき)。 */
  const next = useCallback(() => {
    if (phase !== 'model' || checkMode === 'self') {
      return
    }
    stopSpeaking()
    advance(attempts)
  }, [advance, attempts, checkMode, phase])

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

  /** 確かめ方を切り替える。練習中は次のセッションから効く。 */
  const setCheckMode = useCallback((mode: ResolvedCheck) => {
    try {
      setSettings({ patternCheck: mode })
    } catch (settingsError) {
      captureError(settingsError)
    }
  }, [captureError])

  const round = session?.rounds[roundIndex] ?? []

  return {
    phase,
    level: settings.mixingLevel,
    checkMode,
    webSpeechAvailable: isWebSpeechAvailable(),
    session,
    currentItem,
    roundIndex,
    roundCount: session?.rounds.length ?? 0,
    itemIndex,
    itemCount: round.length,
    hint,
    heardText,
    matched,
    secondsLeft,
    summary,
    sttEngine,
    error,
    start,
    beginItems,
    stopRecording,
    reveal,
    judgeSelf,
    retry,
    next,
    stop,
    setLevel,
    setCheckMode,
    clearError: () => setError(null),
  }
}
