import { useCallback, useEffect, useRef, useState } from 'react'
import { prefetchSpeech, speak, stopSpeaking, unlockAudio } from '../../services/speech'
import { getSettings, subscribe, type Settings } from '../../services/settings'
import { getSession } from '../../services/supabase/auth'
import { listLessonDialogues } from '../../services/supabase/db'
import type { LessonDialogueRow } from '../../services/supabase/types'
import type { EncounterEntry } from '../chunks/ledger'
import { recordEncounters, reportLedgerFailure } from '../chunks/record'
import { chunksIn, type Chunk } from '../chunks/registry'
import { loadChunkContext } from '../chunks/targetsStore'

export type ReplayStatus = 'loading' | 'idle' | 'playing' | 'finished'

/** 聞き流す会話の本数。3 本で 3〜5 分ほど。 */
export const REPLAY_DIALOGUE_COUNT = 3
/** 台詞と台詞のあいだ。会話らしい間。 */
export const TURN_GAP_MS = 700
/** 会話と会話のあいだ。 */
export const DIALOGUE_GAP_MS = 1800

function wait(ms: number, signal: { cancelled: boolean }): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms)
    const check = setInterval(() => {
      if (signal.cancelled) {
        clearTimeout(timer)
        clearInterval(check)
        resolve()
      }
    }, 100)
    setTimeout(() => clearInterval(check), ms + 100)
  })
}

export function useReplaySession(lang: 'en' | 'ko') {
  const [settings, setSettingsState] = useState<Settings>(getSettings)
  const settingsRef = useRef(settings)
  const [status, setStatus] = useState<ReplayStatus>('loading')
  const [dialogues, setDialogues] = useState<LessonDialogueRow[]>([])
  const [dialogueIndex, setDialogueIndex] = useState(0)
  const [turnIndex, setTurnIndex] = useState(0)
  const [scriptVisible, setScriptVisible] = useState(false)
  const [targets, setTargets] = useState<Chunk[]>([])
  const [error, setError] = useState<unknown>(null)

  const userIdRef = useRef<string | null>(null)
  const registryRef = useRef<Chunk[]>([])
  const pendingRef = useRef<EncounterEntry[]>([])
  const ledgerWarnedRef = useRef({ current: false })
  const runRef = useRef<{ cancelled: boolean } | null>(null)
  const mountedRef = useRef(true)

  useEffect(() => subscribe((next) => {
    settingsRef.current = next
    setSettingsState(next)
  }), [])

  const captureError = useCallback((caught: unknown) => {
    console.error('聞き流しでエラーが発生しました', caught)
    setError(caught ?? new Error('不明なエラーが発生しました'))
  }, [])

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

  const cancelRun = useCallback(() => {
    if (runRef.current) {
      runRef.current.cancelled = true
      runRef.current = null
    }
    stopSpeaking()
  }, [])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  useEffect(() => {
    let active = true
    cancelRun()
    setStatus('loading')
    setDialogues([])
    setDialogueIndex(0)
    setTurnIndex(0)
    setError(null)
    userIdRef.current = null
    registryRef.current = []
    pendingRef.current = []

    const load = async () => {
      try {
        const authSession = await getSession()
        if (!authSession) {
          throw new Error('ログイン情報を確認できませんでした')
        }
        const userId = authSession.user.id
        const [rows, chunkContext] = await Promise.all([
          listLessonDialogues(userId, lang, REPLAY_DIALOGUE_COUNT),
          loadChunkContext({ userId, lang }),
        ])
        if (!active) {
          return
        }
        userIdRef.current = userId
        registryRef.current = chunkContext.registry
        setTargets(chunkContext.targets)
        setDialogues(rows)
        setStatus('idle')
        if (chunkContext.error && !ledgerWarnedRef.current.current) {
          ledgerWarnedRef.current.current = true
          setError(chunkContext.error)
        }
      } catch (loadError) {
        if (active) {
          captureError(loadError)
          setStatus('idle')
        }
      }
    }

    void load()
    return () => {
      active = false
      cancelRun()
      flushLedger()
    }
  }, [cancelRun, captureError, flushLedger, lang])

  /** 台詞に含まれるチャンクを seen としてためる。 */
  const noteTurn = useCallback((dialogue: LessonDialogueRow, index: number, text: string) => {
    for (const chunk of chunksIn(text, registryRef.current, lang)) {
      pendingRef.current.push({ chunkKey: chunk.key, mode: 'replay', kind: 'seen', context: `${dialogue.id}:${index}` })
    }
  }, [lang])

  const start = useCallback(async () => {
    if (status !== 'idle' && status !== 'finished') {
      return
    }
    if (dialogues.length === 0) {
      return
    }
    cancelRun()
    const run = { cancelled: false }
    runRef.current = run
    setError(null)
    setStatus('playing')
    setDialogueIndex(0)
    setTurnIndex(0)

    try {
      unlockAudio()
      // 先に音声を作っておく(Gemini の声のとき。作成済みなら何もしない)
      void prefetchSpeech(dialogues.flatMap((dialogue) => (
        dialogue.dialogue.map((turn) => ({ text: turn.text, lang, speaker: turn.speaker }))
      ))).catch((prefetchError) => console.error('音声の先読みに失敗しました', prefetchError))

      for (let dialoguePosition = 0; dialoguePosition < dialogues.length; dialoguePosition += 1) {
        const dialogue = dialogues[dialoguePosition]
        if (run.cancelled) {
          return
        }
        setDialogueIndex(dialoguePosition)
        for (let turnPosition = 0; turnPosition < dialogue.dialogue.length; turnPosition += 1) {
          if (run.cancelled) {
            return
          }
          const turn = dialogue.dialogue[turnPosition]
          setTurnIndex(turnPosition)
          await speak(turn.text, {
            lang,
            rate: settingsRef.current.ttsRate,
            voiceURI: settingsRef.current.ttsVoice[lang],
            speaker: turn.speaker,
          })
          if (run.cancelled) {
            return
          }
          noteTurn(dialogue, turnPosition, turn.text)
          await wait(TURN_GAP_MS, run)
        }
        if (dialoguePosition + 1 < dialogues.length) {
          await wait(DIALOGUE_GAP_MS, run)
        }
      }
      if (!run.cancelled && mountedRef.current) {
        runRef.current = null
        setStatus('finished')
        flushLedger()
      }
    } catch (playError) {
      if (!run.cancelled && mountedRef.current) {
        captureError(playError)
        runRef.current = null
        setStatus('idle')
        flushLedger()
      }
    }
  }, [cancelRun, captureError, dialogues, flushLedger, lang, noteTurn, status])

  const stop = useCallback(() => {
    if (status !== 'playing') {
      return
    }
    cancelRun()
    flushLedger()
    setStatus('idle')
  }, [cancelRun, flushLedger, status])

  const toggleScript = useCallback(() => {
    setScriptVisible((current) => !current)
  }, [])

  const totalTurns = dialogues.reduce((total, dialogue) => total + dialogue.dialogue.length, 0)

  return {
    status,
    dialogues,
    dialogueIndex,
    turnIndex,
    totalTurns,
    scriptVisible,
    targets,
    error,
    start,
    stop,
    toggleScript,
    clearError: () => setError(null),
  }
}
