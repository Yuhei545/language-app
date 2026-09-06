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

function getName(error: unknown): string {
  if (typeof error !== 'object' || error === null || !('name' in error)) {
    return ''
  }
  return String((error as { name: unknown }).name)
}

/** 429 の本文から、待ち時間と「1 分あたり」か「1 日あたり」かを読み取って伝える。 */
function quotaMessage(body: string): string {
  const retrySeconds = /"?retryDelay"?[":\s]+"?(\d+(?:\.\d+)?)s/i.exec(body)?.[1]
  const perDay = /PerDay|per day|daily/i.test(body)
  const perMinute = /PerMinute|per minute/i.test(body)

  if (retrySeconds) {
    return `Gemini の利用上限に達しました。${Math.ceil(Number(retrySeconds))} 秒ほど待つと再開できます`
  }
  if (perMinute) {
    return 'Gemini の 1 分あたりの上限に達しました。1 分ほど待ってから続けてください'
  }
  if (perDay) {
    return 'Gemini の 1 日あたりの上限に達しました。明日また使えます。設定で音声入力を Web Speech にすると節約できます'
  }
  return '無料枠の上限に達しました。設定で今日の呼び出し回数を確認できます'
}

export function toGeminiError(error: unknown): GeminiError {
  if (error instanceof GeminiError) {
    return new GeminiError(error.message, error, error.kind)
  }

  const status = getStatus(error)
  const message = getMessage(error)
  const name = getName(error)

  if (name === 'AbortError' || /abort|timeout|timed out/i.test(`${name} ${message}`)) {
    return new GeminiError(
      '通信が遅いか途切れたため中断しました。もう一度試してください',
      error,
      'network',
    )
  }

  if (status === 504 || /DEADLINE_EXCEEDED|deadline expired/i.test(message)) {
    return new GeminiError(
      'Gemini の応答が時間内に終わりませんでした。混雑しているか、生成に時間がかかっています。もう一度試してください',
      error,
      'network',
    )
  }

  if (status === 503 || /UNAVAILABLE|overloaded/i.test(message)) {
    return new GeminiError(
      'Gemini が混雑しています。少し待ってからもう一度試してください',
      error,
      'network',
    )
  }

  if (status === 429 || /RESOURCE_EXHAUSTED|quota/i.test(message)) {
    return new GeminiError(quotaMessage(message), error, 'quota')
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
