import { useCallback, useEffect, useRef, useState } from 'react'
import { loadCore } from '../../content/coreSchema'
import { speak, stopSpeaking, unlockAudio } from '../../services/speech'
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
  listChunkEncounters,
  listMixingProgress,
  upsertMixingProgress,
} from '../../services/supabase/db'
import type { MixingProgressRow } from '../../services/supabase/types'
import { recentContexts, WEEK_MS, type EncounterEntry } from '../chunks/ledger'
import { recordEncounters, reportLedgerFailure } from '../chunks/record'
import { chunkKeyForFrame, chunkKeyForPhrasal, type Chunk } from '../chunks/registry'
import { loadChunkContext, type ChunkContext } from '../chunks/targetsStore'
import { suggestLevel } from './mastery'
import { withPersonalWords } from './personal'
import {
  buildPatternSession,
  comboContext,
  type PatternItem,
  type PatternSession,
  type PatternTargets,
} from './patternSession'
import { buildComboHistory, buildFrameStats, identityKey, progressIdentity } from './progress'

export type PatternPhase =
  | 'loading'
  | 'idle'
  /** 新しい型に入る前の紹介。解説と例文を見せる。 */
  | 'intro'
  /** 合図を見て声に出す時間。数秒たつか「答えを見る」で模範へ。 */
  | 'thinking'
  /** 言えても言えなくても、模範を見せる。 */
  | 'model'
  | 'finished'

export type PatternAttempt = {
  itemId: string
  round: number
  /** 声に出せたと自分で判定したか。 */
  said: boolean
}

export type PatternSummary = {
  total: number
  said: number
  nextLevel: MixingLevel | null
}

/** 同じ型で、直近この回数分の部品の組は避ける。 */
export const RECENT_COMBOS_TO_AVOID = 3

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

/** 今日の狙いから、型を回すに渡す形を作る。 */
function toPatternTargets(
  context: ChunkContext | null,
  recent: ReadonlyMap<string, readonly string[]>,
): PatternTargets | undefined {
  if (!context || context.targets.length === 0) {
    return undefined
  }
  return {
    frameIds: context.targets.flatMap((chunk) => (chunk.frameId ? [chunk.frameId] : [])),
    phrasal: context.targets.filter((chunk) => chunk.kind === 'phrasal').map((chunk) => chunk.display),
    recentContexts: recent,
  }
}

export function usePatternSession(lang: 'en' | 'ko') {
  const [settings, setSettingsState] = useState<Settings>(getSettings)
  const settingsRef = useRef(settings)
  const [phase, setPhase] = useState<PatternPhase>('loading')
  const [session, setSession] = useState<PatternSession | null>(null)
  const [roundIndex, setRoundIndex] = useState(0)
  const [itemIndex, setItemIndex] = useState(0)
  const [attempts, setAttempts] = useState<PatternAttempt[]>([])
  const [summary, setSummary] = useState<PatternSummary | null>(null)
  const [error, setError] = useState<unknown>(null)
  /** 自分で判定するときの、声に出す残り秒数。 */
  const [secondsLeft, setSecondsLeft] = useState(0)
  /** 今日の狙い(型・句動詞・表現)。idle 画面で見せる。 */
  const [targets, setTargets] = useState<Chunk[]>([])

  const userIdRef = useRef<string | null>(null)
  const rowsRef = useRef(new Map<string, MixingProgressRow>())
  const chunkContextRef = useRef<ChunkContext | null>(null)
  const recentRef = useRef<ReadonlyMap<string, readonly string[]>>(new Map())
  const pendingRef = useRef<EncounterEntry[]>([])
  const ledgerWarnedRef = useRef({ current: false })
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

  /** 型と、部品に含まれる句動詞を台帳にためる(登録簿にあるものだけ。自分の語は数えない)。 */
  const noteEncounter = useCallback((item: PatternItem, said: boolean) => {
    const registry = chunkContextRef.current?.registry ?? []
    const known = new Set(registry.map((chunk) => chunk.key))
    const kind = said ? 'said' : 'seen'
    const context = comboContext(item.words)
    const frameKey = chunkKeyForFrame(item.frame)
    if (known.has(frameKey)) {
      pendingRef.current.push({ chunkKey: frameKey, mode: 'pattern', kind, context })
    }
    for (const word of item.words) {
      const phrasalKey = chunkKeyForPhrasal(word.text, lang)
      if (known.has(phrasalKey)) {
        pendingRef.current.push({ chunkKey: phrasalKey, mode: 'pattern', kind, context: item.frame.id })
      }
    }
  }, [lang])

  // 読み込み: 語彙と保存済みの成績、今日の狙い
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
    setTargets([])
    chunkContextRef.current = null
    recentRef.current = new Map()
    pendingRef.current = []

    const load = async () => {
      try {
        const authSession = await getSession()
        if (!authSession) {
          throw new Error('ログイン情報を確認できませんでした')
        }
        const userId = authSession.user.id
        const rows = await listMixingProgress(userId, lang)
        const chunkContext = await loadChunkContext({ userId, lang })

        // 狙いの型で最近使った組(1 週間、型を回すの記録だけ)。台帳が無ければ空のまま
        const recent = new Map<string, readonly string[]>()
        if (!chunkContext.error) {
          try {
            const since = new Date(Date.now() - WEEK_MS).toISOString()
            const encounters = await listChunkEncounters(userId, lang, { mode: 'pattern', since })
            for (const chunk of chunkContext.targets) {
              if (chunk.frameId) {
                recent.set(chunk.key, recentContexts(encounters, chunk.key, 'pattern', RECENT_COMBOS_TO_AVOID))
              }
            }
          } catch (recentError) {
            console.error('最近の組を読めませんでした。避けずに出します', recentError)
          }
        }

        if (!active) {
          return
        }
        userIdRef.current = userId
        rowsRef.current = new Map(rows.map((row) => [identityKey({
          frameId: row.frame_id,
          verbText: row.verb_text,
          nounText: row.noun_text,
        }), row]))
        chunkContextRef.current = chunkContext
        recentRef.current = recent
        setTargets(chunkContext.targets)
        if (chunkContext.error && !ledgerWarnedRef.current.current) {
          ledgerWarnedRef.current.current = true
          setError(chunkContext.error)
        }
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
      // 途中でやめても、ここまでの出会いは書く
      flushLedger()
    }
  }, [cancelActive, captureError, flushLedger, lang])

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
        understood_count: (previous?.understood_count ?? 0) + (attempt.said ? 1 : 0),
        attempt_count: (previous?.attempt_count ?? 0) + 1,
        first_try_count: (previous?.first_try_count ?? 0) + (attempt.said ? 1 : 0),
        hint_count: previous?.hint_count ?? 0,
        latency_ms_total: previous?.latency_ms_total ?? 0,
        latency_samples: previous?.latency_samples ?? 0,
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
    const said = allAttempts.filter((attempt) => attempt.said).length
    const core = withPersonalWords(loadCore(lang), settingsRef.current.personalWords, lang)
    const stats = buildFrameStats([...rowsRef.current.values()])
    const level = settingsRef.current.mixingLevel
    const suggested = suggestLevel(level, core.frames, stats)

    setSummary({
      total: allAttempts.length,
      said,
      nextLevel: suggested !== level ? suggested : null,
    })
    setPhase('finished')
    flushLedger()

    if (!userId || allAttempts.length === 0) {
      return
    }
    try {
      await insertSpeakingSession({
        user_id: userId,
        lang,
        kind: 'pattern',
        rounds: (session?.rounds ?? []).map((_items, round) => ({
          round,
          said: allAttempts.filter((attempt) => attempt.round === round && attempt.said).length,
          total: allAttempts.filter((attempt) => attempt.round === round).length,
        })),
        understood_ratio: said / allAttempts.length,
        avg_latency_ms: null,
      })
    } catch (saveError) {
      console.error('練習の記録を保存できませんでした', saveError)
      setError(migrationError(saveError))
    }
  }, [flushLedger, lang, session])

  const advance = useCallback((allAttempts: PatternAttempt[]) => {
    if (!session) {
      return
    }
    const round = session.rounds[roundIndex] ?? []
    if (itemIndex + 1 < round.length) {
      const changingFrame = round[itemIndex + 1]?.frame.id !== round[itemIndex]?.frame.id
      setItemIndex(itemIndex + 1)
      // 1 周目で型が変わるときだけ紹介を挟む。2 周目は知っているので挟まない。
      setPhase(changingFrame && roundIndex === 0 ? 'intro' : 'thinking')
      return
    }
    if (roundIndex + 1 < session.rounds.length) {
      setRoundIndex(roundIndex + 1)
      setItemIndex(0)
      setPhase('thinking')
      return
    }
    void finish(allAttempts)
  }, [finish, itemIndex, roundIndex, session])

  const start = useCallback(() => {
    if (!ready) {
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
        targets: toPatternTargets(chunkContextRef.current, recentRef.current),
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
      setError(null)
      setPhase('intro')
    } catch (startError) {
      captureError(startError)
    }
  }, [cancelActive, captureError, lang, ready])

  // 合図は画面に出すだけ。読み上げずに、声に出す時間を始める
  useEffect(() => {
    if (phase !== 'thinking' || !currentItem) {
      return
    }
    stopSpeaking()
    setSecondsLeft(Math.max(1, Math.round(settingsRef.current.lessonPauseSeconds)))
  }, [currentItem, phase])

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

  /** 言えたか言えなかったかを自分で記録して次へ。 */
  const judgeSelf = useCallback(async (said: boolean) => {
    const item = currentItem
    if (phase !== 'model' || !item) {
      return
    }
    stopSpeaking()
    const attempt: PatternAttempt = { itemId: item.id, round: roundIndex, said }
    const next = [...attempts, attempt]
    setAttempts(next)
    noteEncounter(item, said)
    await saveAttempt(item, attempt)
    if (!mountedRef.current) {
      return
    }
    advance(next)
  }, [advance, attempts, currentItem, noteEncounter, phase, roundIndex, saveAttempt])

  /** 型の紹介を読み終えて、練習に入る。 */
  const beginItems = useCallback(() => {
    if (phase !== 'intro') {
      return
    }
    setPhase('thinking')
  }, [phase])

  const stop = useCallback(() => {
    cancelActive()
    flushLedger()
    setSession(null)
    setPhase('idle')
  }, [cancelActive, flushLedger])

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
    secondsLeft,
    summary,
    targets,
    error,
    start,
    beginItems,
    reveal,
    judgeSelf,
    stop,
    setLevel,
    clearError: () => setError(null),
  }
}
