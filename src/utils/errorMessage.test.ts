import { describe, expect, it } from 'vitest'
import { describeError, toError } from './errorMessage'

describe('describeError', () => {
  it('Error は message、文字列はそのまま', () => {
    expect(describeError(new Error('boom'))).toBe('boom')
    expect(describeError('plain')).toBe('plain')
  })

  it('Supabase のエラー(素のオブジェクト)は message・details・hint・code をつなぐ', () => {
    expect(describeError({
      message: "Could not find the 'chunk_key' column of 'vocab_items' in the schema cache",
      details: null,
      hint: null,
      code: 'PGRST204',
    })).toBe("Could not find the 'chunk_key' column of 'vocab_items' in the schema cache (PGRST204)")
    expect(describeError({ message: 'a', details: 'b', hint: 'c' })).toBe('a / b / c')
  })

  it('message の無いオブジェクトは JSON に、それ以外は String に', () => {
    expect(describeError({ status: 500 })).toBe('{"status":500}')
    expect(describeError(42)).toBe('42')
  })

  it('toError は Error でないものを読める Error に包む', () => {
    const wrapped = toError({ message: 'x', code: 'P1' })
    expect(wrapped).toBeInstanceOf(Error)
    expect(wrapped.message).toBe('x (P1)')
    expect(toError(new Error('keep')).message).toBe('keep')
  })
})
