import { describe, expect, it } from 'vitest'
import { GeminiError, toGeminiError } from './errors'

/** SDK が投げる ApiError に近い形(status と、本文 JSON をそのまま入れた message)。 */
function apiError(status: number, body: object): Error & { status: number } {
  const error = new Error(JSON.stringify(body)) as Error & { status: number }
  error.name = 'ApiError'
  error.status = status
  return error
}

describe('toGeminiError', () => {
  it('504 DEADLINE_EXCEEDED は生 JSON ではなく日本語の説明にし、通信系として扱う', () => {
    const error = toGeminiError(apiError(504, {
      error: { code: 504, message: 'Deadline expired before operation could complete.', status: 'DEADLINE_EXCEEDED' },
    }))
    expect(error.kind).toBe('network')
    expect(error.message).toContain('時間内に終わりませんでした')
    expect(error.message).not.toContain('{')
  })

  it('status が無くても本文の DEADLINE_EXCEEDED で判定する', () => {
    const error = toGeminiError(new Error('{"error":{"status":"DEADLINE_EXCEEDED"}}'))
    expect(error.kind).toBe('network')
  })

  it('503 UNAVAILABLE は混雑として扱う', () => {
    const error = toGeminiError(apiError(503, { error: { code: 503, message: 'The model is overloaded.', status: 'UNAVAILABLE' } }))
    expect(error.kind).toBe('network')
    expect(error.message).toContain('混雑')
  })

  it('429 は無料枠、401/403 は APIキー、AbortError は中断として従来どおり', () => {
    expect(toGeminiError(apiError(429, { error: { status: 'RESOURCE_EXHAUSTED' } })).kind).toBe('quota')
    expect(toGeminiError(apiError(403, { error: { message: 'API key not valid' } })).kind).toBe('auth')
    const abort = new Error('The operation was aborted')
    abort.name = 'AbortError'
    expect(toGeminiError(abort).kind).toBe('network')
  })

  it('GeminiError はそのまま種類を引き継ぐ', () => {
    const error = toGeminiError(new GeminiError('会話の応答を JSON として読めませんでした', undefined, 'parse'))
    expect(error.kind).toBe('parse')
  })
})
