/**
 * エラーを人が読める文にする。
 * Supabase(PostgREST)のエラーは Error のインスタンスではなく { message, details, hint, code } の
 * 素のオブジェクトなので、String() すると "[object Object]" になる。message を優先して取り出す。
 */
export function describeError(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  if (typeof error === 'string') {
    return error
  }
  if (typeof error === 'object' && error !== null) {
    const record = error as { message?: unknown; details?: unknown; hint?: unknown; code?: unknown }
    const parts = [record.message, record.details, record.hint]
      .filter((part): part is string => typeof part === 'string' && part.trim().length > 0)
    if (parts.length > 0) {
      const code = typeof record.code === 'string' && record.code.length > 0 ? ` (${record.code})` : ''
      return `${parts.join(' / ')}${code}`
    }
    try {
      return JSON.stringify(error)
    } catch {
      return String(error)
    }
  }
  return String(error)
}

/** Error でなければ、読める文を持つ Error に包む(cause に元を残す)。 */
export function toError(error: unknown): Error {
  if (error instanceof Error) {
    return error
  }
  return new Error(describeError(error), { cause: error })
}
