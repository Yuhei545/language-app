import { normalizeText } from '../../services/speech/normalize'

export type Hint = {
  kind: 'missing' | 'start'
  textJa: string
  token: string
}

function tokenize(text: string, lang: 'en' | 'ko'): string[] {
  const normalized = normalizeText(text, lang)
  return normalized === '' ? [] : normalized.split(' ')
}

export function buildHint(
  learnerText: string,
  modelText: string,
  lang: 'en' | 'ko',
): Hint | null {
  const learnerTokens = tokenize(learnerText, lang)
  const modelTokens = tokenize(modelText, lang)

  if (learnerTokens.length < modelTokens.length / 2) {
    const token = modelTokens.slice(0, 2).join(' ')
    return {
      kind: 'start',
      token,
      textJa: `「${token}」から言ってみましょう`,
    }
  }

  const missing = modelTokens.find((token) => !learnerTokens.includes(token))
  if (missing === undefined) {
    return null
  }

  return {
    kind: 'missing',
    token: missing,
    textJa: `「${missing}」が抜けています。もう一度言ってみましょう`,
  }
}
