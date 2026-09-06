import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DailyTargetsRow } from '../../services/supabase/types'
import { loadDailyTargets, localDay, targetsStorageKey } from './targetsStore'
import type { Chunk } from './registry'

vi.mock('../../services/supabase/db', () => ({
  getDailyTargets: vi.fn(),
  insertDailyTargets: vi.fn(),
  listChunkEncounterSummary: vi.fn(),
  listVocabItems: vi.fn(),
}))

const db = await import('../../services/supabase/db')
const getDailyTargets = vi.mocked(db.getDailyTargets)
const insertDailyTargets = vi.mocked(db.insertDailyTargets)

const NOW = new Date(2026, 8, 6, 12, 0, 0)
const DAY = '2026-09-06'

function chunk(key: string, kind: Chunk['kind']): Chunk {
  return { key, kind, lang: 'en', display: key, hintJa: '', anchor: key, variants: [] }
}

const registry: Chunk[] = [
  chunk('f1', 'frame'), chunk('f2', 'frame'), chunk('f3', 'frame'), chunk('f4', 'frame'),
  chunk('p1', 'phrasal'), chunk('p2', 'phrasal'),
  chunk('e1', 'expression'), chunk('e2', 'expression'),
]

function dbRow(keys: string[]): DailyTargetsRow {
  return { user_id: 'u', lang: 'en', day: DAY, chunk_keys: keys, created_at: '2026-09-06T00:00:00.000Z' }
}

describe('loadDailyTargets', () => {
  beforeEach(() => {
    localStorage.clear()
    getDailyTargets.mockReset()
    insertDailyTargets.mockReset()
  })

  it('控えがあれば DB を呼ばない', async () => {
    localStorage.setItem(targetsStorageKey('en', DAY), JSON.stringify(['f2', 'p1']))

    const result = await loadDailyTargets({ userId: 'u', lang: 'en', registry, summaries: new Map(), now: NOW })

    expect(result.targets.map((item) => item.key)).toEqual(['f2', 'p1'])
    expect(result.error).toBeNull()
    expect(getDailyTargets).not.toHaveBeenCalled()
  })

  it('DB に今日の行があればそれを使い、控えに書く', async () => {
    getDailyTargets.mockResolvedValue(dbRow(['f3', 'e1', 'gone']))

    const result = await loadDailyTargets({ userId: 'u', lang: 'en', registry, summaries: new Map(), now: NOW })

    expect(result.targets.map((item) => item.key)).toEqual(['f3', 'e1'])
    expect(insertDailyTargets).not.toHaveBeenCalled()
    expect(JSON.parse(localStorage.getItem(targetsStorageKey('en', DAY)) ?? '[]')).toEqual(['f3', 'e1'])
  })

  it('無ければ選んで保存し、保存後に取り直した行を採る', async () => {
    getDailyTargets
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(dbRow(['f4', 'p2']))
    insertDailyTargets.mockResolvedValue()

    const result = await loadDailyTargets({ userId: 'u', lang: 'en', registry, summaries: new Map(), now: NOW, rng: () => 0.5 })

    expect(insertDailyTargets).toHaveBeenCalledTimes(1)
    expect(insertDailyTargets.mock.calls[0][0]).toMatchObject({ user_id: 'u', lang: 'en', day: DAY })
    expect(insertDailyTargets.mock.calls[0][0].chunk_keys.length).toBeGreaterThan(0)
    expect(result.targets.map((item) => item.key)).toEqual(['f4', 'p2'])
    expect(result.error).toBeNull()
  })

  it('DB が使えなければ、この端末で決めて控えに書き、エラーを返す', async () => {
    getDailyTargets.mockRejectedValue(new Error('relation "public.daily_targets" does not exist'))

    const result = await loadDailyTargets({ userId: 'u', lang: 'en', registry, summaries: new Map(), now: NOW, rng: () => 0.5 })

    expect(result.targets.length).toBeGreaterThan(0)
    expect(result.error?.message).toContain('006_chunks.sql')
    expect(localStorage.getItem(targetsStorageKey('en', DAY))).not.toBeNull()
  })

  it('同じ言語の他の日の控えは消す', async () => {
    localStorage.setItem(targetsStorageKey('en', '2026-09-05'), JSON.stringify(['f1']))
    localStorage.setItem(targetsStorageKey('ko', '2026-09-05'), JSON.stringify(['k1']))
    getDailyTargets.mockResolvedValue(dbRow(['f1']))

    await loadDailyTargets({ userId: 'u', lang: 'en', registry, summaries: new Map(), now: NOW })

    expect(localStorage.getItem(targetsStorageKey('en', '2026-09-05'))).toBeNull()
    expect(localStorage.getItem(targetsStorageKey('ko', '2026-09-05'))).not.toBeNull()
  })
})

describe('localDay', () => {
  it('ローカルの日付を YYYY-MM-DD にする', () => {
    expect(localDay(new Date(2026, 0, 5, 23, 30))).toBe('2026-01-05')
  })
})
