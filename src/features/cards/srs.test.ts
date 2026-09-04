import { describe, expect, it } from 'vitest'
import { INTERVALS_DAYS, nextSrsState, selectDueCards, type SrsState } from './srs'

const DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1000

describe('nextSrsState', () => {
  it('goodを繰り返すと間隔が進み、5回目でknownになる', () => {
    const now = new Date('2026-01-10T00:00:00.000Z')
    let state: SrsState = {
      status: 'new',
      correct_count: 0,
      next_review_at: null,
    }

    INTERVALS_DAYS.forEach((days, index) => {
      state = nextSrsState(state, 'good', now)
      expect(state.correct_count).toBe(index + 1)
      expect(state.next_review_at).toBe(
        new Date(now.getTime() + days * DAY_IN_MILLISECONDS).toISOString(),
      )
      expect(state.status).toBe(index === 4 ? 'known' : 'learning')
    })
  })

  it('againで段階を戻し、翌日に設定する', () => {
    const now = new Date('2026-01-10T00:00:00.000Z')
    const next = nextSrsState({
      status: 'known',
      correct_count: 5,
      next_review_at: null,
    }, 'again', now)

    expect(next).toEqual({
      status: 'learning',
      correct_count: 0,
      next_review_at: '2026-01-11T00:00:00.000Z',
    })
  })

  it('hardで現在の段の間隔を半分にし、回数は維持する', () => {
    const now = new Date('2026-01-10T00:00:00.000Z')
    const next = nextSrsState({
      status: 'learning',
      correct_count: 3,
      next_review_at: null,
    }, 'hard', now)

    expect(next.correct_count).toBe(3)
    expect(next.status).toBe('learning')
    expect(next.next_review_at).toBe('2026-01-17T00:00:00.000Z')
  })

  it('hardの間隔は最低1日になる', () => {
    const now = new Date('2026-01-10T00:00:00.000Z')
    const next = nextSrsState({
      status: 'new',
      correct_count: 0,
      next_review_at: null,
    }, 'hard', now)

    expect(next.next_review_at).toBe('2026-01-11T00:00:00.000Z')
  })
})

describe('selectDueCards', () => {
  const now = new Date('2026-01-10T00:00:00.000Z')
  const items = [
    { id: 'new-b' },
    { id: 'due-b' },
    { id: 'future' },
    { id: 'due-a' },
    { id: 'new-a' },
  ]
  const progress = new Map<string, SrsState>([
    ['due-b', { status: 'learning', correct_count: 1, next_review_at: '2026-01-09T00:00:00.000Z' }],
    ['due-a', { status: 'learning', correct_count: 1, next_review_at: '2026-01-09T00:00:00.000Z' }],
    ['future', { status: 'learning', correct_count: 1, next_review_at: '2026-01-11T00:00:00.000Z' }],
  ])

  it('期限切れをnewより先にし、同点はid順にする', () => {
    expect(selectDueCards(items, progress, now, 10).map(({ id }) => id)).toEqual([
      'due-a',
      'due-b',
      'new-a',
      'new-b',
    ])
  })

  it('limitを超えず、未来日の語を返さない', () => {
    const selected = selectDueCards(items, progress, now, 3)

    expect(selected).toHaveLength(3)
    expect(selected.some(({ id }) => id === 'future')).toBe(false)
  })
})
