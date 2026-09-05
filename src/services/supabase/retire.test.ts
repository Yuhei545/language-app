import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getVocabProgress, listVocabItems, upsertVocabProgressBulk } from './db'
import { retireVocab } from './retire'
import type { VocabItemRow, VocabProgressRow } from './types'

vi.mock('./db', () => ({
  listVocabItems: vi.fn(),
  getVocabProgress: vi.fn(),
  upsertVocabProgressBulk: vi.fn(async (rows: unknown[]) => rows),
}))

const mockedList = vi.mocked(listVocabItems)
const mockedProgress = vi.mocked(getVocabProgress)
const mockedBulk = vi.mocked(upsertVocabProgressBulk)

function item(id: string, text: string): VocabItemRow {
  return {
    id,
    user_id: 'u1',
    lang: 'en',
    week: 2,
    text,
    emoji: '💧',
    hint_ja: '水',
    example: `${text}, please.`,
    category: 'baby',
    source: 'bundled',
    prep_event_id: null,
    created_at: '2026-09-04T00:00:00.000Z',
  }
}

function known(vocabItemId: string): VocabProgressRow {
  return {
    user_id: 'u1',
    vocab_item_id: vocabItemId,
    status: 'known',
    correct_count: 5,
    hint_used_count: 0,
    last_reviewed_at: '2026-09-04T00:00:00.000Z',
    next_review_at: '2027-09-04T00:00:00.000Z',
    created_at: '2026-09-04T00:00:00.000Z',
  }
}

describe('retireVocab', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('引退リストに載っていて、まだ known でない語だけを known にする', async () => {
    mockedList.mockResolvedValue([item('a', 'water'), item('b', 'food'), item('c', 'Could I get a table for two?')])
    mockedProgress.mockResolvedValue([known('b')])

    const retired = await retireVocab('u1', 'en', ['water', 'food'])

    expect(retired).toBe(1)
    expect(mockedBulk).toHaveBeenCalledOnce()
    const rows = mockedBulk.mock.calls[0][0]
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ user_id: 'u1', vocab_item_id: 'a', status: 'known' })
    expect(rows[0].correct_count).toBeGreaterThanOrEqual(5)
    expect(new Date(rows[0].next_review_at ?? 0).getTime()).toBeGreaterThan(Date.now())
  })

  it('該当する語が無ければ何も書き込まない', async () => {
    mockedList.mockResolvedValue([item('c', 'Could I get a table for two?')])
    mockedProgress.mockResolvedValue([])

    const retired = await retireVocab('u1', 'en', ['water'])

    expect(retired).toBe(0)
    expect(mockedBulk).not.toHaveBeenCalled()
  })

  it('全部すでに known なら何も書き込まない(毎回のログインで冪等)', async () => {
    mockedList.mockResolvedValue([item('a', 'water'), item('b', 'food')])
    mockedProgress.mockResolvedValue([known('a'), known('b')])

    const retired = await retireVocab('u1', 'en', ['water', 'food'])

    expect(retired).toBe(0)
    expect(mockedBulk).not.toHaveBeenCalled()
  })

  it('引退リストが空なら DB に問い合わせない', async () => {
    const retired = await retireVocab('u1', 'en', [])

    expect(retired).toBe(0)
    expect(mockedList).not.toHaveBeenCalled()
    expect(mockedBulk).not.toHaveBeenCalled()
  })
})
