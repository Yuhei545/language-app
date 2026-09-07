import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getSupabaseClient } from './client'
import { getOrCreateProfile, mergeCompletion } from './db'
import type { ProfileRow } from './types'

vi.mock('./client', () => ({
  getSupabaseClient: vi.fn(),
}))

const mockedGetSupabaseClient = vi.mocked(getSupabaseClient)

/**
 * profiles テーブルだけを模した最小のフェイク。
 * 「SELECT してから INSERT」は2つの呼び出しが交差すると重複キーになる、という
 * 実際の Postgres と同じ振る舞いをする。upsert は原子的に扱う。
 */
function createFakeProfilesClient(initialRows: ProfileRow[] = []) {
  const rows = new Map(initialRows.map((row) => [row.user_id, row]))
  const insertCalls: unknown[] = []
  const upsertCalls: Array<{ row: unknown; options: unknown }> = []

  const makeRow = (userId: string): ProfileRow => ({
    user_id: userId,
    interests: [],
    created_at: '2026-09-04T00:00:00.000Z',
  })

  const from = (table: string) => {
    if (table !== 'profiles') {
      throw new Error(`このフェイクは profiles 専用です: ${table}`)
    }

    return {
      select: () => ({
        eq: (_column: string, userId: string) => ({
          maybeSingle: async () => ({ data: rows.get(userId) ?? null, error: null }),
        }),
      }),
      insert: (row: { user_id: string }) => {
        insertCalls.push(row)
        return {
          select: () => ({
            single: async () => {
              if (rows.has(row.user_id)) {
                return {
                  data: null,
                  error: {
                    code: '23505',
                    message: 'duplicate key value violates unique constraint "profiles_pkey"',
                  },
                }
              }
              const created = makeRow(row.user_id)
              rows.set(row.user_id, created)
              return { data: created, error: null }
            },
          }),
        }
      },
      upsert: (row: { user_id: string }, options: unknown) => {
        upsertCalls.push({ row, options })
        return {
          select: () => ({
            single: async () => {
              if (!rows.has(row.user_id)) {
                rows.set(row.user_id, makeRow(row.user_id))
              }
              return { data: rows.get(row.user_id), error: null }
            },
          }),
        }
      },
    }
  }

  return { client: { from }, rows, insertCalls, upsertCalls }
}

describe('getOrCreateProfile', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('同じユーザーで同時に2回呼んでも重複キーで失敗せず、同じ行を返す', async () => {
    const fake = createFakeProfilesClient()
    mockedGetSupabaseClient.mockReturnValue(fake.client as never)

    // React StrictMode の二重 effect や、PC とスマホの同時ログインで実際に起きる状況
    const [first, second] = await Promise.all([
      getOrCreateProfile('user-1'),
      getOrCreateProfile('user-1'),
    ])

    expect(first.user_id).toBe('user-1')
    expect(second.user_id).toBe('user-1')
    expect(fake.rows.size).toBe(1)
  })

  it('既存のプロファイルの interests を上書きしない', async () => {
    const existing: ProfileRow = {
      user_id: 'user-2',
      interests: ['travel', 'friends'],
      created_at: '2026-09-01T00:00:00.000Z',
    }
    const fake = createFakeProfilesClient([existing])
    mockedGetSupabaseClient.mockReturnValue(fake.client as never)

    const result = await getOrCreateProfile('user-2')

    expect(result.interests).toEqual(['travel', 'friends'])
    expect(result.created_at).toBe('2026-09-01T00:00:00.000Z')
  })

  it('存在しないユーザーなら1行だけ作る', async () => {
    const fake = createFakeProfilesClient()
    mockedGetSupabaseClient.mockReturnValue(fake.client as never)

    const result = await getOrCreateProfile('user-3')

    expect(result.user_id).toBe('user-3')
    expect(fake.rows.size).toBe(1)
  })
})

describe('mergeCompletion', () => {
  const now = new Date('2026-09-07T10:00:00.000Z')

  it('回数と完了時刻を進める。正答率が無ければ列を触らない', () => {
    expect(mergeCompletion({ times_completed: 1 }, undefined, now)).toEqual({
      times_completed: 2,
      last_completed_at: '2026-09-07T10:00:00.000Z',
    })
  })

  it('正答率は今回の値と最高値を残す', () => {
    expect(mergeCompletion({ times_completed: 0, best_prompt_accuracy: null }, { promptAccuracy: 0.5 }, now)).toMatchObject({
      last_prompt_accuracy: 0.5,
      best_prompt_accuracy: 0.5,
    })
    expect(mergeCompletion({ times_completed: 2, best_prompt_accuracy: 0.8 }, { promptAccuracy: 0.5 }, now)).toMatchObject({
      last_prompt_accuracy: 0.5,
      best_prompt_accuracy: 0.8,
    })
    expect(mergeCompletion({ times_completed: 2, best_prompt_accuracy: 0.8 }, { promptAccuracy: null }, now)).not.toHaveProperty('best_prompt_accuracy')
  })
})
