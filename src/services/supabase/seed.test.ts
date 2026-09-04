import { beforeEach, describe, expect, it, vi } from 'vitest'
import { loadBundledWeeks } from '../../content'
import { upsertVocabItems } from './db'
import { seedBundledVocab } from './seed'

vi.mock('../../content', () => ({
  loadBundledWeeks: vi.fn(),
}))

vi.mock('./db', () => ({
  upsertVocabItems: vi.fn(),
}))

const mockedLoadBundledWeeks = vi.mocked(loadBundledWeeks)
const mockedUpsertVocabItems = vi.mocked(upsertVocabItems)

describe('seedBundledVocab', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedLoadBundledWeeks.mockReturnValue([
      {
        week: 2,
        items: [{
          text: 'passport',
          emoji: '🛂',
          category: 'toolbox',
          hint_ja: 'パスポート',
          example: 'Here is my passport.',
        }],
      },
    ])
    mockedUpsertVocabItems.mockResolvedValue([])
  })

  it('source、lang、weekを付けて一括投入する', async () => {
    await seedBundledVocab('user-1', 'en')

    expect(mockedLoadBundledWeeks).toHaveBeenCalledWith('en')
    expect(mockedUpsertVocabItems).toHaveBeenCalledWith([{
      user_id: 'user-1',
      lang: 'en',
      week: 2,
      text: 'passport',
      emoji: '🛂',
      category: 'toolbox',
      hint_ja: 'パスポート',
      example: 'Here is my passport.',
      source: 'bundled',
    }])
  })

  it('2回呼んでも同じ引数で一括投入する', async () => {
    await seedBundledVocab('user-1', 'ko')
    await seedBundledVocab('user-1', 'ko')

    expect(mockedUpsertVocabItems).toHaveBeenCalledTimes(2)
    expect(mockedUpsertVocabItems.mock.calls[0]).toEqual(mockedUpsertVocabItems.mock.calls[1])
  })
})
