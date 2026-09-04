export type SpeechLanguage = 'en' | 'ko'

function toHalfWidthAscii(text: string): string {
  return text
    .replace(/[！-～]/g, (character) => String.fromCharCode(character.charCodeAt(0) - 0xfee0))
    .replace(/　/g, ' ')
}

export function normalizeText(text: string, _lang: SpeechLanguage): string {
  return toHalfWidthAscii(text.normalize('NFC').toLowerCase())
    .replace(/[\p{P}\p{S}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function levenshtein(a: string, b: string): number {
  const left = Array.from(a)
  const right = Array.from(b)

  if (left.length === 0) {
    return right.length
  }

  if (right.length === 0) {
    return left.length
  }

  let previous = Array.from({ length: right.length + 1 }, (_, index) => index)

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex]

    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const substitutionCost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1
      current[rightIndex] = Math.min(
        current[rightIndex - 1] + 1,
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + substitutionCost,
      )
    }

    previous = current
  }

  return previous[right.length]
}

export function similarity(a: string, b: string, lang: SpeechLanguage): number {
  const normalizedA = normalizeText(a, lang)
  const normalizedB = normalizeText(b, lang)
  const length = Math.max(Array.from(normalizedA).length, Array.from(normalizedB).length)

  if (length === 0) {
    return 1
  }

  if (normalizedA.length === 0 || normalizedB.length === 0) {
    return 0
  }

  return Math.max(0, Math.min(1, 1 - levenshtein(normalizedA, normalizedB) / length))
}

export function isMatch(
  spoken: string,
  expected: string,
  lang: SpeechLanguage,
  threshold = 0.8,
): boolean {
  return similarity(spoken, expected, lang) >= threshold
}
