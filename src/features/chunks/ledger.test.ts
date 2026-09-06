import { describe, expect, it } from 'vitest'
import type { ChunkEncounterSummaryRow } from '../../services/supabase/types'
import {
  countAcquired,
  isAcquired,
  isNewlyAcquired,
  recentContexts,
  summarizeEncounters,
  summaryFromView,
  type EncounterRecord,
} from './ledger'

function row(chunkKey: string, kind: 'seen' | 'said', mode: string, context = '', at = '2026-09-06T10:00:00.000Z'): EncounterRecord {
  return { chunk_key: chunkKey, kind, mode, context, at }
}

const WEEK_AGO = new Date('2026-08-30T12:00:00.000Z').getTime()

describe('summarizeEncounters', () => {
  it('出会いの総数、言えた数、文脈の種類、最後の時刻を集計する', () => {
    const summaries = summarizeEncounters([
      row('frame:a', 'seen', 'dictation', 'en-001', '2026-09-01T00:00:00.000Z'),
      row('frame:a', 'said', 'pattern', 'coffee', '2026-09-03T00:00:00.000Z'),
      row('frame:a', 'said', 'pattern', 'coffee', '2026-09-02T00:00:00.000Z'),
      row('phrasal:pick up', 'seen', 'lesson', 'line-3'),
    ])

    const a = summaries.get('frame:a')!
    expect(a.seen).toBe(3)
    expect(a.said).toBe(2)
    expect(a.contexts).toBe(2)
    expect(new Date(a.lastAt!).toISOString()).toBe('2026-09-03T00:00:00.000Z')
    expect(a.before).toEqual({ seen: 0, said: 0, contexts: 0 })
    expect(summaries.get('phrasal:pick up')!.said).toBe(0)
  })

  it('cutoff を渡すと、それより前の出会いを before に数える', () => {
    const summaries = summarizeEncounters([
      row('x', 'seen', 'dictation', 'old-1', '2026-08-01T00:00:00.000Z'),
      row('x', 'said', 'pattern', 'old-2', '2026-08-02T00:00:00.000Z'),
      row('x', 'said', 'pattern', 'new-1', '2026-09-05T00:00:00.000Z'),
    ], WEEK_AGO)

    expect(summaries.get('x')).toMatchObject({
      seen: 3,
      said: 2,
      contexts: 3,
      before: { seen: 2, said: 1, contexts: 2 },
    })
  })
})

describe('summaryFromView', () => {
  it('ビューの行をそのまま集計にする', () => {
    const view: ChunkEncounterSummaryRow = {
      user_id: 'u',
      lang: 'en',
      chunk_key: 'frame:a',
      seen: 9,
      said: 4,
      contexts: 3,
      last_at: '2026-09-05T00:00:00.000Z',
      seen_before: 6,
      said_before: 2,
      contexts_before: 2,
    }
    const summary = summaryFromView([view]).get('frame:a')!
    expect(summary.seen).toBe(9)
    expect(summary.before).toEqual({ seen: 6, said: 2, contexts: 2 })
    expect(new Date(summary.lastAt!).toISOString()).toBe('2026-09-05T00:00:00.000Z')
  })
})

describe('isAcquired', () => {
  it('出会い 8 回以上・言えた 3 回以上・文脈 2 種以上で身についた', () => {
    const rows: EncounterRecord[] = []
    for (let index = 0; index < 5; index += 1) {
      rows.push(row('x', 'seen', 'dictation', `s${index}`))
    }
    rows.push(row('x', 'said', 'pattern', 'a'), row('x', 'said', 'pattern', 'b'), row('x', 'said', 'chatgpt'))
    expect(isAcquired(summarizeEncounters(rows).get('x'))).toBe(true)
  })

  it('言えた回数か文脈が足りなければ、まだ', () => {
    const many = Array.from({ length: 10 }, (_, index) => row('y', 'seen', 'dictation', `s${index}`))
    expect(isAcquired(summarizeEncounters(many).get('y'))).toBe(false)

    const sameContext = Array.from({ length: 10 }, () => row('z', 'said', 'pattern', 'same'))
    expect(isAcquired(summarizeEncounters(sameContext).get('z'))).toBe(false)
    expect(isAcquired(undefined)).toBe(false)
  })
})

describe('isNewlyAcquired / countAcquired', () => {
  function acquiredRows(key: string, at: string): EncounterRecord[] {
    const rows: EncounterRecord[] = []
    for (let index = 0; index < 6; index += 1) {
      rows.push(row(key, 'seen', 'dictation', `s${index}`, at))
    }
    rows.push(row(key, 'said', 'pattern', 'p1', at))
    rows.push(row(key, 'said', 'pattern', 'p2', at))
    rows.push(row(key, 'said', 'chatgpt', '', at))
    return rows
  }

  it('1 週間前の時点でまだだったものを「今週身についた」と数える', () => {
    const rows = [
      ...acquiredRows('old', '2026-08-01T00:00:00.000Z'),
      ...acquiredRows('new', '2026-09-05T00:00:00.000Z'),
    ]
    const summaries = summarizeEncounters(rows, WEEK_AGO)

    expect(isNewlyAcquired(summaries.get('old'))).toBe(false)
    expect(isNewlyAcquired(summaries.get('new'))).toBe(true)
    expect(countAcquired(summaries)).toEqual({ total: 2, recent: 1 })
  })
})

describe('recentContexts', () => {
  it('そのモードでの文脈を新しい順に、重複なく返す', () => {
    const rows = [
      row('frame:a', 'said', 'pattern', 'coffee', '2026-09-01T00:00:00.000Z'),
      row('frame:a', 'said', 'pattern', 'water', '2026-09-03T00:00:00.000Z'),
      row('frame:a', 'said', 'pattern', 'coffee', '2026-09-04T00:00:00.000Z'),
      row('frame:a', 'seen', 'dictation', 'en-001', '2026-09-05T00:00:00.000Z'),
      row('frame:b', 'said', 'pattern', 'tea', '2026-09-06T00:00:00.000Z'),
    ]
    expect(recentContexts(rows, 'frame:a', 'pattern')).toEqual(['coffee', 'water'])
    expect(recentContexts(rows, 'frame:a', 'pattern', 1)).toEqual(['coffee'])
  })
})
