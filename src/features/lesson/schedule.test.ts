import { describe, expect, it } from 'vitest'
import { buildSchedule } from './schedule'
import type { LessonItem } from './types'

const items: LessonItem[] = ['A', 'B', 'C'].map((id) => ({
  id,
  kind: 'word',
  cueJa: `${id}を伝える`,
  answer: id,
}))

describe('buildSchedule', () => {
  it('1項目を stage 0〜4 の順に5回出す', () => {
    expect(buildSchedule(items.slice(0, 1)).map(({ stage }) => stage))
      .toEqual([0, 1, 2, 3, 4])
  })

  it('3項目の各 stage を昇順にし、全15ステップを作る', () => {
    const schedule = buildSchedule(items)

    expect(schedule).toHaveLength(items.length * 5)
    items.forEach((item) => {
      expect(schedule.filter((step) => step.item.id === item.id).map(({ stage }) => stage))
        .toEqual([0, 1, 2, 3, 4])
    })
  })

  it('A の最初の再出題を B の初出より前に置く', () => {
    const schedule = buildSchedule(items)
    const firstARecall = schedule.findIndex((step) => step.item.id === 'A' && step.stage === 1)
    const firstB = schedule.findIndex((step) => step.item.id === 'B' && step.stage === 0)

    expect(firstARecall).toBeLessThan(firstB)
  })

  it('別項目の候補があれば同じ項目を3スロット連続させない', () => {
    const schedule = buildSchedule(items)

    for (let index = 2; index < schedule.length; index += 1) {
      expect([
        schedule[index - 2].item.id,
        schedule[index - 1].item.id,
        schedule[index].item.id,
      ]).not.toEqual([schedule[index].item.id, schedule[index].item.id, schedule[index].item.id])
    }
  })

  it('slotSeconds を大きくすると再出題が前に詰まり、各項目内の相対順を保つ', () => {
    const regular = buildSchedule(items)
    const packed = buildSchedule(items, { slotSeconds: 120 })

    items.forEach((item) => {
      expect(packed.filter((step) => step.item.id === item.id).map(({ stage }) => stage))
        .toEqual([0, 1, 2, 3, 4])
    })
    expect(packed.findIndex((step) => step.item.id === 'A' && step.stage === 3))
      .toBeLessThan(regular.findIndex((step) => step.item.id === 'A' && step.stage === 3))
  })
})
