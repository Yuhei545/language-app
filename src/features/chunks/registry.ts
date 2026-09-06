import type { CoreFrame, CoreVocab } from '../../content/coreSchema'
import { normalizeText } from '../../services/speech/normalize'
import type { VocabItemRow } from '../../services/supabase/types'

/**
 * 繰り返す単位は「単語」ではなく、汎用性のあるチャンク。
 * - frame: 核の型(Could I get ___?)
 * - phrasal: 核の句動詞(pick up)
 * - expression: カードにある多語の表現(to be honest、会話レッスンで出た表現、道具箱の文)
 * 単語(週 2 の名詞・動詞、核の名詞・形容詞)は型に入れる部品であり、狙いにはしない。
 */
export type ChunkKind = 'frame' | 'phrasal' | 'expression'

export type Chunk = {
  key: string
  kind: ChunkKind
  lang: 'en' | 'ko'
  /** 見せる形。型はスロットを ___ にする。 */
  display: string
  hintJa: string
  /** 文の中にあるかを判定する固定部分(正規化済み)。空なら文との照合はできない。 */
  anchor: string
  /** 固定部分の別形(句動詞の活用など)。 */
  variants: string[]
  frameId?: string
  vocabItemId?: string
}

/** この種類のカードは、語数に関わらず表現として扱う。 */
export const EXPRESSION_CATEGORIES = new Set(['toolbox', 'glue', 'dialogue'])

/** 固定部分の最小の長さ。英語は語数、韓国語は文字数。短すぎる固定部分(the / was)は照合に使わない。 */
export const MIN_ANCHOR = { en: 2, ko: 2 } as const

const SLOT_PATTERN = /\{[^{}]+\}/g

const IRREGULAR_VERBS: Record<string, string[]> = {
  hang: ['hung'],
  meet: ['met'],
  catch: ['caught'],
  show: ['shown'],
  get: ['got', 'gotten'],
  go: ['went', 'gone'],
  come: ['came'],
  run: ['ran'],
  find: ['found'],
  take: ['took', 'taken'],
  give: ['gave', 'given'],
  make: ['made'],
  bring: ['brought'],
  see: ['saw', 'seen'],
  have: ['has', 'had'],
  do: ['does', 'did', 'done'],
  buy: ['bought'],
  think: ['thought'],
  tell: ['told'],
  leave: ['left'],
  sit: ['sat'],
  keep: ['kept'],
  feel: ['felt'],
}

/** 英語の動詞の活用形(規則 + よく使う不規則)。句動詞の照合に使う。 */
export function verbForms(base: string): string[] {
  const forms = new Set([base, `${base}s`, `${base}ed`, `${base}ing`])
  if (base.endsWith('e')) {
    const stem = base.slice(0, -1)
    forms.add(`${stem}ing`)
    forms.add(`${base}d`)
  }
  if (/[^aeiou][aeiou][^aeiouwxy]$/.test(base)) {
    const last = base.slice(-1)
    forms.add(`${base}${last}ed`)
    forms.add(`${base}${last}ing`)
  }
  if (/[^aeiou]y$/.test(base)) {
    const stem = base.slice(0, -1)
    forms.add(`${stem}ies`)
    forms.add(`${stem}ied`)
  }
  if (/(s|sh|ch|x|z)$/.test(base)) {
    forms.add(`${base}es`)
  }
  for (const form of IRREGULAR_VERBS[base] ?? []) {
    forms.add(form)
  }
  return [...forms]
}

function normalizeForMatch(text: string, lang: 'en' | 'ko'): string {
  const normalized = normalizeText(text, lang)
  // 韓国語は分かち書きのゆれが大きいので、空白を除いて比べる
  return lang === 'ko' ? normalized.replace(/\s+/g, '') : normalized
}

function anchorLength(text: string, lang: 'en' | 'ko'): number {
  if (text.length === 0) {
    return 0
  }
  return lang === 'en' ? text.split(' ').length : Array.from(text).length
}

export function chunkKeyForFrame(frame: Pick<CoreFrame, 'id'>): string {
  return `frame:${frame.id}`
}

export function chunkKeyForPhrasal(text: string, lang: 'en' | 'ko'): string {
  return `phrasal:${normalizeForMatch(text, lang)}`
}

export function chunkKeyForExpression(text: string, lang: 'en' | 'ko'): string {
  return `expr:${normalizeForMatch(text, lang)}`
}

/** 型の見せる形。{noun:thing} → ___。助詞(을/를 など)は残す。 */
export function frameDisplay(frame: Pick<CoreFrame, 'pattern'>): string {
  return frame.pattern.replace(SLOT_PATTERN, '___')
}

/** 型の日本語。{1} のような番号を「〜」にする。 */
export function frameHintJa(frame: Pick<CoreFrame, 'hint_ja'>): string {
  return frame.hint_ja.replace(/\{\d+\}/g, '〜')
}

/**
 * 型の固定部分のうち、いちばん長いもの。文にその型が使われているかの判定に使う。
 * 例: Could I get {noun:thing}? → could i get / Is {noun:place} far from here? → far from here
 * 短すぎるもの(英語 1 語、韓国語 1 文字)は空にする。
 */
export function frameAnchor(frame: Pick<CoreFrame, 'pattern'>, lang: 'en' | 'ko'): string {
  const segments = frame.pattern
    .split(SLOT_PATTERN)
    // スロット直後の助詞は部品次第で変わるので固定部分に含めない
    .map((segment) => segment.replace(/^(을\/를|이\/가|은\/는)/, ''))
    .map((segment) => normalizeForMatch(segment, lang))
    .filter((segment) => segment.length > 0)
  if (segments.length === 0) {
    return ''
  }
  const best = segments.reduce((current, segment) => (
    anchorLength(segment, lang) > anchorLength(current, lang) ? segment : current
  ))
  return anchorLength(best, lang) >= MIN_ANCHOR[lang] ? best : ''
}

/** 句動詞の別形。先頭の動詞だけ活用させる(picked up / picking up)。 */
export function phrasalVariants(text: string, lang: 'en' | 'ko'): string[] {
  if (lang !== 'en') {
    return []
  }
  const [verb, ...rest] = normalizeForMatch(text, lang).split(' ')
  if (!verb) {
    return []
  }
  return verbForms(verb)
    .filter((form) => form !== verb)
    .map((form) => [form, ...rest].join(' '))
}

/** 表現として狙いにするカードか。2 語以上、または表現の種類。型・句動詞の種まき分(chunk_key あり)は除く。 */
export function isExpressionItem(item: Pick<VocabItemRow, 'text' | 'category' | 'chunk_key'>, lang: 'en' | 'ko'): boolean {
  if (item.chunk_key) {
    return false
  }
  if (EXPRESSION_CATEGORIES.has(item.category ?? '')) {
    return true
  }
  return normalizeText(item.text, lang).includes(' ')
}

export function buildChunkRegistry(
  core: CoreVocab,
  vocabItems: VocabItemRow[],
  lang: 'en' | 'ko',
): Chunk[] {
  const chunks: Chunk[] = []
  const seen = new Set<string>()
  const push = (chunk: Chunk) => {
    if (seen.has(chunk.key)) {
      return
    }
    seen.add(chunk.key)
    chunks.push(chunk)
  }

  const itemsByChunkKey = new Map(
    vocabItems.filter((item) => item.chunk_key).map((item) => [item.chunk_key as string, item]),
  )

  for (const frame of core.frames) {
    const key = chunkKeyForFrame(frame)
    push({
      key,
      kind: 'frame',
      lang,
      display: frameDisplay(frame),
      hintJa: frameHintJa(frame),
      anchor: frameAnchor(frame, lang),
      variants: [],
      frameId: frame.id,
      vocabItemId: itemsByChunkKey.get(key)?.id,
    })
  }

  for (const word of core.phrasal) {
    const key = chunkKeyForPhrasal(word.text, lang)
    push({
      key,
      kind: 'phrasal',
      lang,
      display: word.text,
      hintJa: word.hint_ja,
      anchor: normalizeForMatch(word.text, lang),
      variants: phrasalVariants(word.text, lang),
      vocabItemId: itemsByChunkKey.get(key)?.id,
    })
  }

  for (const item of vocabItems) {
    if (!isExpressionItem(item, lang)) {
      continue
    }
    push({
      key: chunkKeyForExpression(item.text, lang),
      kind: 'expression',
      lang,
      display: item.text,
      hintJa: item.hint_ja ?? '',
      anchor: normalizeForMatch(item.text, lang),
      variants: [],
      vocabItemId: item.id,
    })
  }

  return chunks
}

/** 文の中にそのチャンクが使われているか。固定部分(と別形)の含有で判定する。 */
export function matchChunk(text: string, chunk: Chunk, lang: 'en' | 'ko'): boolean {
  if (chunk.anchor.length === 0) {
    return false
  }
  const normalized = normalizeForMatch(text, lang)
  const candidates = [chunk.anchor, ...chunk.variants]
  if (lang === 'ko') {
    return candidates.some((anchor) => normalized.includes(anchor))
  }
  const padded = ` ${normalized} `
  return candidates.some((anchor) => padded.includes(` ${anchor} `))
}

/** 文に含まれるチャンクをすべて返す。 */
export function chunksIn(text: string, registry: Chunk[], lang: 'en' | 'ko'): Chunk[] {
  return registry.filter((chunk) => matchChunk(text, chunk, lang))
}
