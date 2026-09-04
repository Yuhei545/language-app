export type GeminiErrorKind = 'quota' | 'auth' | 'network' | 'parse' | 'unknown'

export class GeminiError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown,
    readonly kind?: GeminiErrorKind,
  ) {
    super(message)
    this.name = 'GeminiError'
  }
}

function getStatus(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) {
    return undefined
  }

  const candidate = error as { status?: unknown; statusCode?: unknown; code?: unknown }
  const status = candidate.status ?? candidate.statusCode ?? candidate.code

  if (typeof status === 'number') {
    return status
  }

  if (typeof status === 'string' && /^\d+$/.test(status)) {
    return Number(status)
  }

  return undefined
}

function getMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }

  if (typeof error === 'object' && error !== null && 'message' in error) {
    return String((error as { message: unknown }).message)
  }

  return String(error)
}

export function toGeminiError(error: unknown): GeminiError {
  if (error instanceof GeminiError) {
    return new GeminiError(error.message, error, error.kind)
  }

  const status = getStatus(error)
  const message = getMessage(error)

  if (status === 429 || /RESOURCE_EXHAUSTED|quota/i.test(message)) {
    return new GeminiError(
      '無料枠の上限に達しました。しばらく待ってから試してください',
      error,
      'quota',
    )
  }

  if (status === 401 || status === 403 || /API[_ ]?KEY/i.test(message)) {
    return new GeminiError(
      'APIキーが正しくありません。設定画面で確認してください',
      error,
      'auth',
    )
  }

  return new GeminiError(message, error, 'unknown')
}
