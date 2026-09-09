import {
  buildSentence,
  sentencesOf,
  type Piece,
  type PieceCombo,
  type PieceVariant,
  type SmallPiece,
} from '../../content/pieceSchema'
import { isAcquired, type ChunkSummary, type EncounterEntry } from '../chunks/ledger'

/**
 * ピースをつなぐ。
 * - はめる(fit): ミディアムピース(I can 〜)に、かたまりを 5 つ続けてはめる
 * - つなぐ(link): ラージピース(I didn't know that 〜)に、ミディアムで作った文をつなぐ
 * 教材(パズル英会話)の Let's Puzzle をそのまま練習にしたもの。台帳には piece:pNN で記録し、
 * つなぐ段階では中の文を作ったミディアムピースにも「出会い」を付ける(教材の復習ピース)。
 */
export type PieceStage = 'fit' | 'link'

export const PIECES_PER_SESSION = 3
export const ITEMS_PER_PIECE = 5

/** 後ろに動詞のかたまり(日常のスモールピース)が入るミディアムピース。 */
export const VERB_PHRASE_PIECES = new Set([
  'p01', 'p03', 'p04', 'p05', 'p08', 'p09', 'p11', 'p12', 'p13', 'p15', 'p16', 'p19', 'p21', 'p22', 'p23', 'p25',
])

export function pieceChunkKey(id: string): string {
  return `piece:${id}`
}

export function pieceKindFor(stage: PieceStage): Piece['kind'] {
  return stage === 'fit' ? 'medium' : 'large'
}

export type PieceItem = {
  id: string
  piece: Piece
  variant?: PieceVariant
  combo: PieceCombo
  /** 合図(日本語)。 */
  cueJa: string
  /** つなぐ段階で先に見せる、中の文。 */
  inner?: string
  answer: string
  /** 日常のかたまりから作った、教材にない組み合わせ。 */
  fromSmall: boolean
}

export type PieceSession = {
  stage: PieceStage
  pieces: Piece[]
  /** ピースごとの練習項目。 */
  items: PieceItem[][]
}

export type PieceStatus = {
  seen: number
  said: number
  acquired: boolean
  lastAt: number | null
}

export function pieceStatus(summaries: ReadonlyMap<string, ChunkSummary>, id: string): PieceStatus {
  const summary = summaries.get(pieceChunkKey(id))
  return {
    seen: summary?.seen ?? 0,
    said: summary?.said ?? 0,
    acquired: isAcquired(summary),
    lastAt: summary?.lastAt ?? null,
  }
}

/**
 * 練習するピースを選ぶ。身についていないもの → 言えた回数が少ないもの → 長く触れていないもの → 番号順。
 * preferred(一覧から選んだピース)は先頭に入れる。
 */
export function choosePieces(params: {
  pieces: readonly Piece[]
  stage: PieceStage
  summaries: ReadonlyMap<string, ChunkSummary>
  count?: number
  preferred?: string
}): Piece[] {
  const count = params.count ?? PIECES_PER_SESSION
  const kind = pieceKindFor(params.stage)
  const ranked = params.pieces
    .filter((piece) => piece.kind === kind)
    .map((piece) => ({ piece, status: pieceStatus(params.summaries, piece.id) }))
    .sort((a, b) => {
      if (a.status.acquired !== b.status.acquired) {
        return a.status.acquired ? 1 : -1
      }
      if (a.status.said !== b.status.said) {
        return a.status.said - b.status.said
      }
      const aLast = a.status.lastAt ?? -1
      const bLast = b.status.lastAt ?? -1
      if (aLast !== bLast) {
        return aLast - bLast
      }
      return a.piece.no - b.piece.no
    })
    .map((entry) => entry.piece)

  const preferred = params.preferred ? ranked.find((piece) => piece.id === params.preferred) : undefined
  const rest = ranked.filter((piece) => piece !== preferred)
  return [...(preferred ? [preferred] : []), ...rest].slice(0, count)
}

function shuffle<T>(items: readonly T[], random: () => number): T[] {
  const copy = [...items]
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1))
    ;[copy[index], copy[swap]] = [copy[swap], copy[index]]
  }
  return copy
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/** つなぐ段階で先に見せる中の文。ラージピースの記号(? / !)に合わせる。 */
export function innerSentence(piece: Piece, combo: PieceCombo): string {
  const text = capitalize(combo.text)
  return /[.!?]$/.test(text) ? text : `${text}${piece.end ?? '.'}`
}

/** 1 つのピースの練習項目。はめるは本体と言い換えを混ぜ、日常のかたまりを 1 つ足す。 */
export function buildPieceItems(
  piece: Piece,
  options: { small?: readonly SmallPiece[]; random?: () => number } = {},
): PieceItem[] {
  const random = options.random ?? Math.random
  if (piece.kind === 'large') {
    return shuffle(piece.combos, random).slice(0, ITEMS_PER_PIECE).map((combo, index) => ({
      id: `${piece.id}:${index}`,
      piece,
      combo,
      cueJa: combo.ja,
      inner: innerSentence(piece, combo),
      answer: buildSentence(piece, combo),
      fromSmall: false,
    }))
  }

  const sentences = sentencesOf(piece)
  const main = shuffle(sentences.filter((sentence) => !sentence.variant), random)
  const variants = shuffle(sentences.filter((sentence) => sentence.variant), random)
  const small = options.small ?? []
  const withSmall = VERB_PHRASE_PIECES.has(piece.id) && small.length > 0
  const wanted = ITEMS_PER_PIECE - (withSmall ? 1 : 0)
  // 本体を 2 つは入れ、残りは言い換えと本体を交互に
  const chosen = [...main.slice(0, 2)]
  const pool = [...variants, ...main.slice(2)]
  for (const sentence of pool) {
    if (chosen.length >= wanted) {
      break
    }
    chosen.push(sentence)
  }
  const items: PieceItem[] = chosen.map((sentence, index) => ({
    id: `${piece.id}:${index}`,
    piece,
    variant: sentence.variant,
    combo: sentence.combo,
    cueJa: sentence.ja,
    answer: sentence.text,
    fromSmall: false,
  }))
  if (withSmall) {
    const pick = small[Math.floor(random() * small.length)]
    const combo: PieceCombo = { text: pick.text, ja: pick.ja }
    items.push({
      id: `${piece.id}:small`,
      piece,
      combo,
      cueJa: pick.ja,
      answer: buildSentence(piece, combo),
      fromSmall: true,
    })
  }
  return shuffle(items, random)
}

export function buildPieceSession(params: {
  stage: PieceStage
  pieces: Piece[]
  small: readonly SmallPiece[]
  random?: () => number
}): PieceSession {
  return {
    stage: params.stage,
    pieces: params.pieces,
    items: params.pieces.map((piece) => buildPieceItems(piece, { small: params.small, random: params.random })),
  }
}

/** 台帳に書く出会い。つなぐ段階では、中の文を作ったミディアムピースにも出会いを付ける。 */
export function ledgerEntries(item: PieceItem, said: boolean): EncounterEntry[] {
  const entries: EncounterEntry[] = [{
    chunkKey: pieceChunkKey(item.piece.id),
    mode: 'pieces',
    kind: said ? 'said' : 'seen',
    context: item.combo.text,
  }]
  for (const id of item.combo.uses ?? []) {
    entries.push({ chunkKey: pieceChunkKey(id), mode: 'pieces', kind: 'seen', context: item.piece.id })
  }
  return entries
}
