import { describe, expect, it } from 'vitest'
import { dayInWeek, daysUntil, updateStreak, weekNumberFor } from './progress'

function localDate(year: number, month: number, day: number): Date {
  return new Date(year, month - 1, day, 12)
}

describe('weekNumberFor', () => {
  it('開始日から7日ごとに週が進む', () => {
    expect(weekNumberFor('2026-01-01', localDate(2026, 1, 1))).toBe(1)
    expect(weekNumberFor('2026-01-01', localDate(2026, 1, 7))).toBe(1)
    expect(weekNumberFor('2026-01-01', localDate(2026, 1, 8))).toBe(2)
  })

  it('26週で頭打ちになる', () => {
    expect(weekNumberFor('2026-01-01', localDate(2026, 7, 20))).toBe(26)
  })

  it('月またぎとうるう日を正しく数える', () => {
    expect(weekNumberFor('2024-02-28', localDate(2024, 3, 6))).toBe(2)
  })
})

describe('dayInWeek', () => {
  it('開始日は1、7日後は次週の1日目になる', () => {
    expect(dayInWeek('2026-01-01', localDate(2026, 1, 1))).toBe(1)
    expect(dayInWeek('2026-01-01', localDate(2026, 1, 8))).toBe(1)
  })
})

describe('updateStreak', () => {
  it('同じ日はストリークを据え置く', () => {
    expect(updateStreak({ streak: 4, last_active_date: '2026-03-01' }, '2026-03-01')).toEqual({
      streak: 4,
      last_active_date: '2026-03-01',
    })
  })

  it('前日から続けると1増える', () => {
    expect(updateStreak({ streak: 4, last_active_date: '2026-02-28' }, '2026-03-01')).toEqual({
      streak: 5,
      last_active_date: '2026-03-01',
    })
  })

  it('2日空くと1に戻る', () => {
    expect(updateStreak({ streak: 4, last_active_date: '2026-02-27' }, '2026-03-01')).toEqual({
      streak: 1,
      last_active_date: '2026-03-01',
    })
  })

  it('うるう日の前日判定ができる', () => {
    expect(updateStreak({ streak: 2, last_active_date: '2024-02-29' }, '2024-03-01').streak).toBe(3)
  })
})

describe('daysUntil', () => {
  it('今日、明日、過去の日付を数える', () => {
    const now = localDate(2026, 3, 1)
    expect(daysUntil('2026-03-01', now)).toBe(0)
    expect(daysUntil('2026-03-02', now)).toBe(1)
    expect(daysUntil('2026-02-28', now)).toBe(-1)
  })

  it('月またぎとうるう日を正しく数える', () => {
    expect(daysUntil('2024-03-01', localDate(2024, 2, 28))).toBe(2)
    expect(daysUntil('2026-04-01', localDate(2026, 3, 31))).toBe(1)
  })
})
