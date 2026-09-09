import frequencyJson from './en/frequency.json'
import {
  fail,
  requireArray,
  requireInteger,
  requireNonEmptyString,
  requireRecord,
  type UnknownRecord,
} from './validation'

/**
 * 海外ドラマの分析による動詞の使用回数ランキング(1〜60 位)。
 * 根拠: 少数の基本動詞が会話の大半を占める。よく使うものから覚えると、言える範囲が早く広がる。
 * 2 語で言うの動詞 25 語のうち 22 語がこの中にある(bring / open / clean は 60 位までに無い)。
 */
export type FrequencyVerb = {
  rank: number
  text: string
  /** ドラマの中で使われた回数。 */
  count: number
}

export type FrequencySet = {
  version: 1
  source: string
  note_ja: string
  verbs: FrequencyVerb[]
}

/** ランキングに無い語。並べ替えでは最後に置く。 */
export const UNRANKED = Number.MAX_SAFE_INTEGER

export function validateFrequency(json: unknown, label: string): FrequencySet {
  const record: UnknownRecord = requireRecord(json, label, 'root')
  if (record.version !== 1) {
    fail(label, 'version', 'は1である必要があります')
  }
  const verbs = requireArray(record, 'verbs', label, 'root').map((value, index) => {
    const path = `verbs[${index}]`
    const item = requireRecord(value, label, path)
    const verb: FrequencyVerb = {
      rank: requireInteger(item, 'rank', label, path),
      text: requireNonEmptyString(item, 'text', label, path),
      count: requireInteger(item, 'count', label, path),
    }
    if (verb.rank !== index + 1) {
      fail(label, `${path}.rank`, `が順番と合いません(${verb.rank} / ${index + 1})`)
    }
    if (verb.count <= 0) {
      fail(label, `${path}.count`, 'は 1 以上である必要があります')
    }
    return verb
  })
  return {
    version: 1,
    source: requireNonEmptyString(record, 'source', label, 'root'),
    note_ja: requireNonEmptyString(record, 'note_ja', label, 'root'),
    verbs,
  }
}

let cache: FrequencySet | null = null
let index: Map<string, FrequencyVerb> | null = null

export function loadFrequency(): FrequencySet {
  if (!cache) {
    cache = validateFrequency(frequencyJson, 'en/frequency.json')
    index = new Map(cache.verbs.map((verb) => [verb.text, verb]))
  }
  return cache
}

function lookup(text: string): FrequencyVerb | undefined {
  loadFrequency()
  return index?.get(text.toLowerCase())
}

/** その動詞の順位。ランキングに無ければ null。 */
export function rankOf(text: string): number | null {
  return lookup(text)?.rank ?? null
}

/** その動詞がドラマで使われた回数。ランキングに無ければ null。 */
export function countOf(text: string): number | null {
  return lookup(text)?.count ?? null
}

/** 並べ替えに使う順位。ランキング外は最後。 */
export function rankValue(text: string): number {
  return rankOf(text) ?? UNRANKED
}

/** いくつかの動詞のうち、いちばんよく使うものの順位。 */
export function bestRank(texts: readonly string[]): number {
  return texts.reduce((best, text) => Math.min(best, rankValue(text)), UNRANKED)
}

/** よく使う順に並べ替える。順位が同じ(または圏外)なら元の順のまま。 */
export function byFrequency<T>(items: readonly T[], textOf: (item: T) => string): T[] {
  return items
    .map((item, order) => ({ item, order, rank: rankValue(textOf(item)) }))
    .sort((a, b) => a.rank - b.rank || a.order - b.order)
    .map((entry) => entry.item)
}
