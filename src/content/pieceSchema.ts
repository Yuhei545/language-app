import mediumJson from './en/pieces-medium.json'
import largeJson from './en/pieces-large.json'
import {
  fail,
  requireArray,
  requireInteger,
  requireNonEmptyString,
  requireRecord,
  requireString,
  type UnknownRecord,
} from './validation'

/**
 * ピース(かたまり)を組み合わせて話す練習の素材。
 * - small: 日常動作のかたまり(do the laundry など)。ミディアムピースの後ろに入る
 * - medium: 後ろにかたまりが入るピース(I can 〜、I'm 〜ing)
 * - large: 後ろに「文」が入るピース(I didn't know that 〜)。中身はミディアムで作った文
 * 根拠: 定型表現は語より速く処理され、少ない部品を組み替えるほど言える範囲が広がる。
 */
export type PieceKind = 'medium' | 'large'

export type PieceCombo = {
  text: string
  ja: string
  /** ラージピースのとき、その文を作るのに使ったミディアムピースの id。 */
  uses?: string[]
}

/** 同じピースの言い換え(You can 〜、Can I 〜? など)。 */
export type PieceVariant = {
  text: string
  ja: string
  /** 疑問文として組み立てる。 */
  question?: boolean
  /** 文の末尾に足す語(yet、already など)。 */
  suffix?: string
  combos: PieceCombo[]
}

export type Piece = {
  id: string
  no: number
  kind: PieceKind
  /** 文を組み立てるときに前に置く語。 */
  text: string
  /** 画面に見せる形(I can 〜)。 */
  display: string
  ja: string
  note_ja: string
  example: { text: string; ja: string }
  combos: PieceCombo[]
  variants: PieceVariant[]
}

export type SmallPiece = { text: string; ja: string }

export type PieceSet = {
  version: 1
  small: SmallPiece[]
  pieces: Piece[]
}

export const PIECE_ID_PATTERN = /^p\d{2}$/

function validateCombo(value: unknown, label: string, path: string): PieceCombo {
  const record = requireRecord(value, label, path)
  const combo: PieceCombo = {
    text: requireNonEmptyString(record, 'text', label, path),
    ja: requireNonEmptyString(record, 'ja', label, path),
  }
  if (record.uses !== undefined) {
    combo.uses = requireArray(record, 'uses', label, path).map((id, index) => {
      if (typeof id !== 'string' || !PIECE_ID_PATTERN.test(id)) {
        fail(label, `${path}.uses[${index}]`, `がピースの id ではありません: ${String(id)}`)
      }
      return id
    })
  }
  return combo
}

function validateVariant(value: unknown, label: string, path: string): PieceVariant {
  const record = requireRecord(value, label, path)
  const variant: PieceVariant = {
    text: requireNonEmptyString(record, 'text', label, path),
    ja: requireNonEmptyString(record, 'ja', label, path),
    combos: requireArray(record, 'combos', label, path)
      .map((combo, index) => validateCombo(combo, label, `${path}.combos[${index}]`)),
  }
  if (record.question !== undefined) {
    if (typeof record.question !== 'boolean') {
      fail(label, `${path}.question`, 'は boolean である必要があります')
    }
    variant.question = record.question
  }
  if (record.suffix !== undefined) {
    variant.suffix = requireNonEmptyString(record, 'suffix', label, path)
  }
  if (variant.combos.length === 0) {
    fail(label, `${path}.combos`, 'が空です')
  }
  return variant
}

function validatePiece(value: unknown, label: string, index: number, kind: PieceKind): Piece {
  const path = `pieces[${index}]`
  const record = requireRecord(value, label, path)
  const id = requireNonEmptyString(record, 'id', label, path)
  if (!PIECE_ID_PATTERN.test(id)) {
    fail(label, `${path}.id`, `の形が不正です: ${id}(例: p01)`)
  }
  if (record.kind !== kind) {
    fail(label, `${path}.kind`, `は ${kind} である必要があります`)
  }
  const example = requireRecord(record.example, label, `${path}.example`)
  const piece: Piece = {
    id,
    no: requireInteger(record, 'no', label, path),
    kind,
    text: requireNonEmptyString(record, 'text', label, path),
    display: requireNonEmptyString(record, 'display', label, path),
    ja: requireNonEmptyString(record, 'ja', label, path),
    note_ja: requireString(record, 'note_ja', label, path).trim(),
    example: {
      text: requireNonEmptyString(example, 'text', label, `${path}.example`),
      ja: requireNonEmptyString(example, 'ja', label, `${path}.example`),
    },
    combos: requireArray(record, 'combos', label, path)
      .map((combo, comboIndex) => validateCombo(combo, label, `${path}.combos[${comboIndex}]`)),
    variants: record.variants === undefined
      ? []
      : requireArray(record, 'variants', label, path)
        .map((variant, variantIndex) => validateVariant(variant, label, `${path}.variants[${variantIndex}]`)),
  }
  if (piece.combos.length === 0) {
    fail(label, `${path}.combos`, 'が空です')
  }
  if (piece.id !== `p${String(piece.no).padStart(2, '0')}`) {
    fail(label, `${path}.id`, `が no と一致しません(${piece.id} / ${piece.no})`)
  }
  return piece
}

function validateFile(json: unknown, label: string, kind: PieceKind): { small: SmallPiece[]; pieces: Piece[] } {
  const record: UnknownRecord = requireRecord(json, label, 'root')
  if (record.version !== 1) {
    fail(label, 'version', 'は1である必要があります')
  }
  const small = record.small === undefined
    ? []
    : requireArray(record, 'small', label, 'root').map((value, index) => {
      const path = `small[${index}]`
      const item = requireRecord(value, label, path)
      return {
        text: requireNonEmptyString(item, 'text', label, path),
        ja: requireNonEmptyString(item, 'ja', label, path),
      }
    })
  const pieces = requireArray(record, 'pieces', label, 'root')
    .map((value, index) => validatePiece(value, label, index, kind))
  return { small, pieces }
}

/** 文の終わりの記号。疑問なら ?、それ以外は .(すでに記号があればそのまま)。 */
function punctuate(sentence: string, question: boolean): string {
  const trimmed = sentence.trim()
  if (/[.!?]$/.test(trimmed)) {
    return trimmed
  }
  return `${trimmed}${question ? '?' : '.'}`
}

/** ピース + かたまりで 1 文にする。variant を渡すとその言い換えで組む。 */
export function buildSentence(piece: Piece, combo: PieceCombo, variant?: PieceVariant): string {
  const head = variant ? variant.text : piece.text
  const tail = variant?.suffix ? ` ${variant.suffix}` : ''
  return punctuate(`${head} ${combo.text}${tail}`, variant?.question === true)
}

/** そのピースで作れる文をすべて(本体 + 言い換え)。 */
export function sentencesOf(piece: Piece): Array<{ text: string; ja: string; combo: PieceCombo; variant?: PieceVariant }> {
  return [
    ...piece.combos.map((combo) => ({ text: buildSentence(piece, combo), ja: combo.ja, combo })),
    ...piece.variants.flatMap((variant) => variant.combos.map((combo) => ({
      text: buildSentence(piece, combo, variant),
      ja: combo.ja,
      combo,
      variant,
    }))),
  ]
}

let cache: PieceSet | null = null

/** 英語のピース(ミディアム 34 + ラージ 36)とスモールピース。 */
export function loadPieces(): PieceSet {
  if (!cache) {
    const medium = validateFile(mediumJson, 'en/pieces-medium.json', 'medium')
    const large = validateFile(largeJson, 'en/pieces-large.json', 'large')
    cache = { version: 1, small: medium.small, pieces: [...medium.pieces, ...large.pieces] }
  }
  return cache
}

export function pieceById(id: string): Piece | undefined {
  return loadPieces().pieces.find((piece) => piece.id === id)
}
