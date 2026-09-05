import { normalizeText } from '../../services/speech/normalize'

export type DiffToken = {
  text: string
  kind: 'match' | 'missing' | 'extra'
}

function words(text: string, lang: 'en' | 'ko'): string[] {
  const normalized = normalizeText(text, lang)
  return normalized === '' ? [] : normalized.split(' ')
}

export function wordDiff(
  expected: string,
  typed: string,
  lang: 'en' | 'ko',
): { tokens: DiffToken[]; ratio: number } {
  const expectedWords = words(expected, lang)
  const typedWords = words(typed, lang)

  if (expectedWords.length === 0 && typedWords.length === 0) {
    return { tokens: [], ratio: 1 }
  }

  const lcs = Array.from(
    { length: expectedWords.length + 1 },
    () => new Array<number>(typedWords.length + 1).fill(0),
  )

  for (let expectedIndex = expectedWords.length - 1; expectedIndex >= 0; expectedIndex -= 1) {
    for (let typedIndex = typedWords.length - 1; typedIndex >= 0; typedIndex -= 1) {
      lcs[expectedIndex][typedIndex] = expectedWords[expectedIndex] === typedWords[typedIndex]
        ? lcs[expectedIndex + 1][typedIndex + 1] + 1
        : Math.max(lcs[expectedIndex + 1][typedIndex], lcs[expectedIndex][typedIndex + 1])
    }
  }

  const tokens: DiffToken[] = []
  let expectedIndex = 0
  let typedIndex = 0
  let matches = 0

  while (expectedIndex < expectedWords.length && typedIndex < typedWords.length) {
    if (expectedWords[expectedIndex] === typedWords[typedIndex]) {
      tokens.push({ text: expectedWords[expectedIndex], kind: 'match' })
      expectedIndex += 1
      typedIndex += 1
      matches += 1
    } else if (lcs[expectedIndex + 1][typedIndex] >= lcs[expectedIndex][typedIndex + 1]) {
      tokens.push({ text: expectedWords[expectedIndex], kind: 'missing' })
      expectedIndex += 1
    } else {
      tokens.push({ text: typedWords[typedIndex], kind: 'extra' })
      typedIndex += 1
    }
  }

  while (expectedIndex < expectedWords.length) {
    tokens.push({ text: expectedWords[expectedIndex], kind: 'missing' })
    expectedIndex += 1
  }
  while (typedIndex < typedWords.length) {
    tokens.push({ text: typedWords[typedIndex], kind: 'extra' })
    typedIndex += 1
  }

  return {
    tokens,
    ratio: expectedWords.length === 0 ? 0 : matches / expectedWords.length,
  }
}
