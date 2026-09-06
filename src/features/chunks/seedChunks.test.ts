import { beforeEach, describe, expect, it, vi } from 'vitest'
import { loadCore } from '../../content/coreSchema'
import { CHUNK_SEED_WEEK, buildChunkSeedRows, phrasalExample, seedCoreChunks } from './seedChunks'

vi.mock('../../services/supabase/db', () => ({
  upsertVocabItems: vi.fn(),
}))

const db = await import('../../services/supabase/db')
const upsertVocabItems = vi.mocked(db.upsertVocabItems)

describe('buildChunkSeedRows', () => {
  it('英語の型と句動詞を週 0 の core カードにし、chunk_key で台帳と結ぶ', () => {
    const rows = buildChunkSeedRows(loadCore('en'), 'en', 'u')
    const frameRow = rows.find((row) => row.chunk_key === 'frame:en-could-i-get')!
    const phrasalRow = rows.find((row) => row.chunk_key === 'phrasal:pick up')!

    expect(frameRow).toMatchObject({
      user_id: 'u',
      lang: 'en',
      week: CHUNK_SEED_WEEK,
      text: 'Could I get ___?',
      hint_ja: '〜をもらえますか',
      category: 'core',
      source: 'bundled',
    })
    expect(frameRow.example).toMatch(/Could I get/)
    expect(phrasalRow).toMatchObject({ text: 'pick up', category: 'core' })
    expect(phrasalRow.example).toMatch(/pick up/)
  })

  it('同じ見せ方の型は 1 枚にまとめる(text が一意のため)', () => {
    const rows = buildChunkSeedRows(loadCore('en'), 'en', 'u')
    const texts = rows.map((row) => row.text)
    expect(new Set(texts).size).toBe(texts.length)
    expect(texts.filter((text) => text === '___ was ___.')).toHaveLength(1)
  })

  it('韓国語は型だけ(句動詞が無い)', () => {
    const rows = buildChunkSeedRows(loadCore('ko'), 'ko', 'u')
    expect(rows.length).toBeGreaterThan(0)
    expect(rows.every((row) => row.chunk_key?.startsWith('frame:'))).toBe(true)
    expect(rows.find((row) => row.chunk_key === 'frame:ko-noun-juseyo')?.text).toBe('___ 주세요.')
  })
})

describe('phrasalExample', () => {
  it('手書きの例文にあればそれを使い、無ければ型で組み立てる', () => {
    const core = loadCore('en')
    const pickUp = core.phrasal.find((word) => word.text === 'pick up')!
    const showUp = core.phrasal.find((word) => word.text === 'show up')!

    expect(phrasalExample(pickUp, core)).toBe('I need to pick up a ticket.')
    expect(phrasalExample(showUp, core)).toMatch(/show up/)
    expect(phrasalExample(showUp, core)).not.toBe('show up')
  })
})

describe('seedCoreChunks', () => {
  beforeEach(() => {
    upsertVocabItems.mockReset()
    upsertVocabItems.mockResolvedValue([])
  })

  it('1 回の upsert で投入する', async () => {
    await seedCoreChunks('u', 'en')
    expect(upsertVocabItems).toHaveBeenCalledTimes(1)
    expect(upsertVocabItems.mock.calls[0][0].every((row) => row.week === CHUNK_SEED_WEEK)).toBe(true)
  })

  it('失敗は投げる', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    upsertVocabItems.mockRejectedValue(new Error('down'))
    await expect(seedCoreChunks('u', 'en')).rejects.toThrow('down')
    consoleError.mockRestore()
  })
})
