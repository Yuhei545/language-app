import type { DictationFeatureSpan, DictationSentence } from '../../content/dictationSchema'

/** 穴埋めの 1 マス。span が空欄、before/after はそのまま見せる文字。 */
export type ClozeBlank = {
  /** 空欄に入る正解(本文そのまま)。 */
  answer: string
  /** この空欄が狙う音の現象。 */
  featureId: DictationFeatureSpan['id']
}

export type Cloze = {
  /** 空欄以外の部分。blanks より 1 つ多い。 */
  segments: string[]
  blanks: ClozeBlank[]
}

/**
 * 音の現象がある箇所を空欄にした穴埋めを作る。
 * 位置が重なるものは先に見つかった方だけを使い、本文に無い span は捨てる。
 * 空欄が 1 つも作れなければ null(呼び出し側は全文書き取りにする)。
 */
export function buildCloze(sentence: DictationSentence): Cloze | null {
  const found: Array<{ start: number; end: number; featureId: DictationFeatureSpan['id'] }> = []
  const lower = sentence.text.toLowerCase()

  for (const feature of sentence.features) {
    const start = lower.indexOf(feature.span.toLowerCase())
    if (start < 0) {
      continue
    }
    const end = start + feature.span.length
    const overlaps = found.some((item) => start < item.end && end > item.start)
    if (!overlaps) {
      found.push({ start, end, featureId: feature.id })
    }
  }

  if (found.length === 0) {
    return null
  }

  found.sort((left, right) => left.start - right.start)
  const segments: string[] = []
  const blanks: ClozeBlank[] = []
  let cursor = 0

  for (const item of found) {
    segments.push(sentence.text.slice(cursor, item.start))
    blanks.push({ answer: sentence.text.slice(item.start, item.end), featureId: item.featureId })
    cursor = item.end
  }
  segments.push(sentence.text.slice(cursor))

  return { segments, blanks }
}

/** 空欄の答え合わせ。大文字小文字と前後の空白、末尾の句読点は無視する。 */
export function checkBlank(typed: string, answer: string): boolean {
  const normalize = (value: string) => value
    .trim()
    .toLowerCase()
    .replace(/[.,!?;:。、！？]+$/u, '')
    .replace(/\s+/g, ' ')
  return normalize(typed) === normalize(answer)
}
