import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { loadPieces, type Piece, type PieceSet } from '../../content/pieceSchema'
import { speak, stopSpeaking, unlockAudio } from '../../services/speech'
import { getSettings, subscribe, type Settings } from '../../services/settings'
import { getSession } from '../../services/supabase/auth'
import { listChunkEncounterSummary } from '../../services/supabase/db'
import { summaryFromView, type ChunkSummary, type EncounterEntry } from '../chunks/ledger'
import { ledgerError, recordEncounters, reportLedgerFailure } from '../chunks/record'
import {
  buildPieceSession,
  choosePieces,
  ledgerEntries,
  pieceChunkKey,
  pieceKindFor,
  pieceStatus,
  type PieceItem,
  type PieceSession,
  type PieceStage,
  type PieceStatus,
} from './piecesSession'

export type PiecePhase =
  | 'loading'
  | 'idle'
  /** ピースの意味と例文を見せる。 */
  | 'intro'
  /** 合図を見て声に出す時間。 */
  | 'thinking'
  /** 答えを見せて、言えたかを自分で押す。 */
  | 'model'
  | 'finished'

export type PieceAttempt = { itemId: string; said: boolean }

export type PieceListEntry = { piece: Piece; status: PieceStatus }

export type PieceSummary = {
  said: number
  total: number
  pieces: PieceListEntry[]
}

/** 台帳の集計を、書き込みを待たずに手元で進める(一覧の数字がすぐ動くように)。 */
function bump(summary: ChunkSummary | undefined, said: boolean, now: number): ChunkSummary {
  const base: ChunkSummary = summary ?? {
    seen: 0,
    said: 0,
    contexts: 0,
    lastAt: null,
    before: { seen: 0, said: 0, contexts: 0 },
  }
  return {
    ...base,
    seen: base.seen + 1,
    said: base.said + (said ? 1 : 0),
    contexts: Math.max(base.contexts, 1),
    lastAt: now,
  }
}

export function usePiecesSession(lang: 'en' | 'ko') {
  const [settings, setSettingsState] = useState<Settings>(getSettings)
  const settingsRef = useRef(settings)
  const [phase, setPhase] = useState<PiecePhase>('loading')
  const [stage, setStageState] = useState<PieceStage>('fit')
  const [session, setSession] = useState<PieceSession | null>(null)
  const [pieceIndex, setPieceIndex] = useState(0)
  const [itemIndex, setItemIndex] = useState(0)
  const [attempts, setAttempts] = useState<PieceAttempt[]>([])
  const [secondsLeft, setSecondsLeft] = useState(0)
  const [summaries, setSummaries] = useState<Map<string, ChunkSummary>>(new Map())
  const [summary, setSummary] = useState<PieceSummary | null>(null)
  const [error, setError] = useState<unknown>(null)

  const userIdRef = useRef<string | null>(null)
  const pendingRef = useRef<EncounterEntry[]>([])
  const ledgerWarnedRef = useRef({ current: false })
  const mountedRef = useRef(true)

  const supported = lang === 'en'
  const content: PieceSet | null = useMemo(() => (supported ? loadPieces() : null), [supported])

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
    console.error('ピースをつなぐでエラーが発生しました', caught)
    setError(caught ?? new Error('不明なエラーが発生しました'))
  }, [])

  /** ためた出会いを台帳にまとめて書く。失敗しても練習は止めない。 */
  const flushLedger = useCallback(() => {
    const userId = userIdRef.current
    const entries = pendingRef.current.splice(0)
    if (!userId || entries.length === 0) {
      return
    }
    void recordEncounters(userId, lang, entries).catch((caught: unknown) => {
      reportLedgerFailure(caught, ledgerWarnedRef.current, setError)
    })
  }, [lang])

  // 読み込み: ログインと台帳の集計
  useEffect(() => {
    let active = true
    stopSpeaking()
    setSession(null)
    setSummary(null)
    setAttempts([])
    setError(null)
    pendingRef.current = []
    if (!supported) {
      setPhase('idle')
      return undefined
    }
    setPhase('loading')

    const load = async () => {
      try {
        const authSession = await getSession()
        if (!authSession) {
          throw new Error('ログイン情報を確認できませんでした')
        }
        const userId = authSession.user.id
        let loaded = new Map<string, ChunkSummary>()
        try {
          loaded = summaryFromView(await listChunkEncounterSummary(userId, lang))
        } catch (summaryError) {
          console.error('表現の台帳を読めませんでした', summaryError)
          if (!ledgerWarnedRef.current.current) {
            ledgerWarnedRef.current.current = true
            setError(ledgerError(summaryError))
          }
        }
        if (!active) {
          return
        }
        userIdRef.current = userId
        setSummaries(loaded)
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
      stopSpeaking()
      flushLedger()
    }
  }, [captureError, flushLedger, lang, supported])

  /** この段階のピース一覧と、台帳の状態。 */
  const list: PieceListEntry[] = useMemo(() => {
    if (!content) {
      return []
    }
    const kind = pieceKindFor(stage)
    return content.pieces
      .filter((piece) => piece.kind === kind)
      .map((piece) => ({ piece, status: pieceStatus(summaries, piece.id) }))
  }, [content, stage, summaries])

  /** 次に出る予定のピース(はじめる前に見せる)。 */
  const upcoming: Piece[] = useMemo(() => (
    content ? choosePieces({ pieces: content.pieces, stage, summaries }) : []
  ), [content, stage, summaries])

  const currentItems: PieceItem[] = session?.items[pieceIndex] ?? []
  const currentPiece: Piece | null = session?.pieces[pieceIndex] ?? null
  const currentItem: PieceItem | null = currentItems[itemIndex] ?? null

  const start = useCallback((preferred?: string) => {
    if (!content || phase === 'loading') {
      return
    }
    try {
      unlockAudio()
      const pieces = choosePieces({ pieces: content.pieces, stage, summaries, preferred })
      if (pieces.length === 0) {
        throw new Error('練習できるピースが見つかりませんでした')
      }
      stopSpeaking()
      setSession(buildPieceSession({ stage, pieces, small: content.small }))
      setPieceIndex(0)
      setItemIndex(0)
      setAttempts([])
      setSummary(null)
      setError(null)
      setPhase('intro')
    } catch (startError) {
      captureError(startError)
    }
  }, [captureError, content, phase, stage, summaries])

  const beginItems = useCallback(() => {
    if (phase === 'intro') {
      setPhase('thinking')
    }
  }, [phase])

  const speakText = useCallback(async (text: string) => {
    try {
      await speak(text, {
        lang: 'en',
        rate: settingsRef.current.ttsRate,
        voiceURI: settingsRef.current.ttsVoice.en,
      })
    } catch (speakError) {
      captureError(speakError)
    }
  }, [captureError])

  const say = useCallback((text: string) => {
    void speakText(text)
  }, [speakText])

  useEffect(() => {
    if (phase !== 'thinking' || !currentItem) {
      return
    }
    stopSpeaking()
    setSecondsLeft(Math.max(1, Math.round(settingsRef.current.lessonPauseSeconds)))
  }, [currentItem, phase])

  const reveal = useCallback(() => {
    if (phase !== 'thinking' || !currentItem) {
      return
    }
    setPhase('model')
    void speakText(currentItem.answer)
  }, [currentItem, phase, speakText])

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

  const finish = useCallback((allAttempts: PieceAttempt[], latest: Map<string, ChunkSummary>) => {
    if (!session) {
      return
    }
    flushLedger()
    setSummary({
      said: allAttempts.filter((attempt) => attempt.said).length,
      total: allAttempts.length,
      pieces: session.pieces.map((piece) => ({ piece, status: pieceStatus(latest, piece.id) })),
    })
    setPhase('finished')
  }, [flushLedger, session])

  /** 言えたか言えなかったかを記録して次へ。ピースが変わるときは紹介を挟む。 */
  const judgeSelf = useCallback((said: boolean) => {
    const item = currentItem
    if (phase !== 'model' || !item || !session) {
      return
    }
    stopSpeaking()
    const nextAttempts = [...attempts, { itemId: item.id, said }]
    setAttempts(nextAttempts)
    const entries = ledgerEntries(item, said)
    pendingRef.current.push(...entries)
    const now = Date.now()
    const updated = new Map(summaries)
    for (const entry of entries) {
      updated.set(entry.chunkKey, bump(updated.get(entry.chunkKey), entry.kind === 'said', now))
    }
    setSummaries(updated)

    if (itemIndex + 1 < currentItems.length) {
      setItemIndex(itemIndex + 1)
      setPhase('thinking')
      return
    }
    if (pieceIndex + 1 < session.pieces.length) {
      setPieceIndex(pieceIndex + 1)
      setItemIndex(0)
      setPhase('intro')
      return
    }
    finish(nextAttempts, updated)
  }, [attempts, currentItem, currentItems.length, finish, itemIndex, phase, pieceIndex, session, summaries])

  const stop = useCallback(() => {
    stopSpeaking()
    flushLedger()
    setSession(null)
    setPhase('idle')
  }, [flushLedger])

  const setStage = useCallback((next: PieceStage) => {
    if (phase === 'idle' || phase === 'finished') {
      setStageState(next)
      setSummary(null)
      if (phase === 'finished') {
        setPhase('idle')
      }
    }
  }, [phase])

  return {
    supported,
    phase,
    stage,
    list,
    upcoming,
    session,
    currentPiece,
    currentItem,
    pieceIndex,
    pieceCount: session?.pieces.length ?? 0,
    itemIndex,
    itemCount: currentItems.length,
    secondsLeft,
    summary,
    error,
    /** 台帳の鍵(一覧の表示やテストで使う)。 */
    chunkKey: pieceChunkKey,
    start,
    beginItems,
    reveal,
    judgeSelf,
    say,
    stop,
    setStage,
    clearError: () => setError(null),
  }
}
