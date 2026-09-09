import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LEDGER_MIGRATION_HINT, ledgerError, recordEncounters, reportLedgerFailure } from './record'

vi.mock('../../services/supabase/db', () => ({
  insertChunkEncounters: vi.fn(),
}))

const db = await import('../../services/supabase/db')
const insertChunkEncounters = vi.mocked(db.insertChunkEncounters)

describe('recordEncounters', () => {
  beforeEach(() => {
    insertChunkEncounters.mockReset()
    insertChunkEncounters.mockResolvedValue()
  })

  it('まとめて 1 回 insert する。文脈が無ければ空文字', async () => {
    await recordEncounters('u', 'en', [
      { chunkKey: 'frame:a', mode: 'pattern', kind: 'said', context: 'coffee' },
      { chunkKey: 'phrasal:pick up', mode: 'pattern', kind: 'seen' },
    ])

    expect(insertChunkEncounters).toHaveBeenCalledTimes(1)
    expect(insertChunkEncounters.mock.calls[0][0]).toEqual([
      { user_id: 'u', lang: 'en', chunk_key: 'frame:a', mode: 'pattern', kind: 'said', context: 'coffee' },
      { user_id: 'u', lang: 'en', chunk_key: 'phrasal:pick up', mode: 'pattern', kind: 'seen', context: '' },
    ])
  })

  it('空なら何もしない', async () => {
    await recordEncounters('u', 'en', [])
    expect(insertChunkEncounters).not.toHaveBeenCalled()
  })
})

describe('ledgerError / reportLedgerFailure', () => {
  it('006 未適用のエラーは実行の案内に変える(Supabase の素のオブジェクトでも)', () => {
    expect(ledgerError(new Error('relation "public.chunk_encounters" does not exist')).message).toBe(LEDGER_MIGRATION_HINT)
    expect(ledgerError({
      message: "Could not find the 'chunk_key' column of 'vocab_items' in the schema cache",
      details: null,
      hint: null,
      code: 'PGRST204',
    }).message).toBe(LEDGER_MIGRATION_HINT)
    expect(ledgerError(new Error('network down')).message).toBe('network down')
    expect(ledgerError({ message: 'permission denied', code: '42501' }).message).toBe('permission denied (42501)')
  })

  it('同じセッションでは 1 回だけ知らせ、console には毎回出す', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const onError = vi.fn()
    const warned = { current: false }

    reportLedgerFailure(new Error('x'), warned, onError)
    reportLedgerFailure(new Error('y'), warned, onError)

    expect(onError).toHaveBeenCalledTimes(1)
    expect(consoleError).toHaveBeenCalledTimes(2)
    consoleError.mockRestore()
  })
})
