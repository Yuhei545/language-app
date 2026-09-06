import { describe, expect, it } from 'vitest'
import { isDue, KEEP_RATIO, MAX_BOX, nextSchedule, REVIEW_DAYS } from './schedule'

const NOW = new Date('2026-09-06T12:00:00.000Z')

/** 予定日が「何日後の朝」になっているかを暦日で数える。 */
function daysBetween(from: Date, iso: string): number {
  const start = new Date(from)
  start.setHours(0, 0, 0, 0)
  const target = new Date(iso)
  target.setHours(0, 0, 0, 0)
  return Math.round((target.getTime() - start.getTime()) / 86_400_000)
}

const fresh = { stage: 'cloze' as const, box: 0, correctStreak: 0, nextReviewAt: null }

describe('nextSchedule', () => {
  it('よくできたら箱が上がり、次までの間隔が伸びる', () => {
    const first = nextSchedule({ ...fresh, box: 1 }, 1, NOW)
    expect(first.box).toBe(2)
    expect(daysBetween(NOW, first.nextReviewAt!)).toBe(REVIEW_DAYS[2])

    const second = nextSchedule({ ...fresh, box: 3, correctStreak: 5, stage: 'full' }, 0.95, NOW)
    expect(second.box).toBe(4)
    expect(daysBetween(NOW, second.nextReviewAt!)).toBe(REVIEW_DAYS[4])
  })

  it('箱は上限で止まる', () => {
    const result = nextSchedule({ ...fresh, box: MAX_BOX, stage: 'full', correctStreak: 9 }, 1, NOW)
    expect(result.box).toBe(MAX_BOX)
  })

  it('9 割を 2 回続けたら穴埋めから全文へ上がり、箱は最初に戻る', () => {
    const once = nextSchedule({ ...fresh, box: 2 }, 0.95, NOW)
    expect(once.stage).toBe('cloze')
    expect(once.correctStreak).toBe(1)

    const twice = nextSchedule(once, 0.92, NOW)
    expect(twice.stage).toBe('full')
    expect(twice.box).toBe(0)
    expect(twice.correctStreak).toBe(0)
  })

  it('ほどほど(7〜9 割)なら箱は据え置き、連続は途切れる', () => {
    const result = nextSchedule({ ...fresh, box: 2, correctStreak: 1 }, 0.8, NOW)
    expect(result.box).toBe(2)
    expect(result.correctStreak).toBe(0)
    expect(result.stage).toBe('cloze')
  })

  it('7 割未満なら箱を 0 に戻し、その日のうちにもう一度出す', () => {
    const result = nextSchedule({ ...fresh, box: 4, correctStreak: 3, stage: 'full' }, KEEP_RATIO - 0.01, NOW)
    expect(result.box).toBe(0)
    expect(result.correctStreak).toBe(0)
    expect(result.stage).toBe('full')
    expect(new Date(result.nextReviewAt!).getTime() - NOW.getTime()).toBeLessThan(60 * 60_000)
  })
})

describe('isDue', () => {
  it('予定が無ければ出す', () => {
    expect(isDue({ nextReviewAt: null }, NOW)).toBe(true)
  })

  it('予定日を過ぎていれば出し、未来なら出さない', () => {
    expect(isDue({ nextReviewAt: '2026-09-05T00:00:00.000Z' }, NOW)).toBe(true)
    expect(isDue({ nextReviewAt: '2026-09-08T00:00:00.000Z' }, NOW)).toBe(false)
  })

  it('壊れた日付は出す扱いにする', () => {
    expect(isDue({ nextReviewAt: 'いつか' }, NOW)).toBe(true)
  })
})
