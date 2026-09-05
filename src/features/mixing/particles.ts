import type { CoreFrame, CoreWord } from '../../content/coreSchema'

export type ParticlePair = '을/를' | '이/가' | '은/는'

const PARTICLES: Record<ParticlePair, readonly [string, string]> = {
  '을/를': ['을', '를'],
  '이/가': ['이', '가'],
  '은/는': ['은', '는'],
}

const PARTICLE_PAIRS = Object.keys(PARTICLES) as ParticlePair[]

function isHangulSyllable(text: string): boolean {
  if (text.length === 0) {
    return false
  }

  const code = text.charCodeAt(text.length - 1)
  return code >= 0xAC00 && code <= 0xD7A3
}

export function hasBatchim(text: string): boolean {
  if (!isHangulSyllable(text)) {
    return false
  }

  return (text.charCodeAt(text.length - 1) - 0xAC00) % 28 !== 0
}

export function attachParticle(word: string, pair: ParticlePair): string {
  if (!isHangulSyllable(word)) {
    return word
  }

  const [withBatchim, withoutBatchim] = PARTICLES[pair]
  return `${word}${hasBatchim(word) ? withBatchim : withoutBatchim}`
}

export function renderPattern(frame: CoreFrame, words: CoreWord[]): string {
  if (words.length !== frame.slots.length) {
    throw new Error(`フレーム ${frame.id} のスロット数と単語数が一致しません`)
  }

  let rendered = frame.pattern
  frame.slots.forEach((slot, index) => {
    const token = `{${slot}}`
    const tokenIndex = rendered.indexOf(token)
    if (tokenIndex < 0) {
      throw new Error(`フレーム ${frame.id} にトークン ${token} がありません`)
    }

    const afterToken = tokenIndex + token.length
    const particle = PARTICLE_PAIRS.find((pair) => rendered.startsWith(pair, afterToken))
    const replacement = particle
      ? attachParticle(words[index].text, particle)
      : words[index].text
    const replacedLength = token.length + (particle?.length ?? 0)
    rendered = rendered.slice(0, tokenIndex)
      + replacement
      + rendered.slice(tokenIndex + replacedLength)
  })

  return rendered
}

export function renderHint(frame: CoreFrame, words: CoreWord[]): string {
  return frame.hint_ja.replace(/\{(\d+)\}/g, (_match, value: string) => {
    const index = Number(value) - 1
    const word = words[index]
    if (!word) {
      throw new Error(`フレーム ${frame.id} のヒント番号 {${value}} に対応する単語がありません`)
    }
    return word.hint_ja
  })
}
