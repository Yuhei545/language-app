import { describe, expect, it } from 'vitest'
import { buildScenarios } from './scenarios'

describe('buildScenarios', () => {
  it('目的タグが空なら自由に話す1件だけを返す', () => {
    const scenarios = buildScenarios('en', [], [])

    expect(scenarios).toHaveLength(1)
    expect(scenarios[0].labelJa).toBe('自由に話す')
  })

  it('travelだけならtravel系だけを返す', () => {
    const scenarios = buildScenarios('en', ['travel'], [])

    expect(scenarios.map((scenario) => scenario.id)).toEqual([
      'travel-cafe',
      'travel-directions',
      'travel-shopping',
    ])
  })

  it('複数タグなら両方のシナリオを含む', () => {
    const scenarios = buildScenarios('ko', ['travel', 'friends'], [])
    const ids = scenarios.map((scenario) => scenario.id)

    expect(ids).toContain('travel-cafe')
    expect(ids).toContain('friends-catch-up')
  })

  it('予定のシナリオを先頭に追加してprepEventIdを持たせる', () => {
    const scenarios = buildScenarios('en', ['content'], [{ id: 'event-1', title: '空港で迎える' }])

    expect(scenarios[0]).toMatchObject({
      id: 'prep-event-1',
      prepEventId: 'event-1',
    })
  })

  it('全シナリオのpromptが空でない', () => {
    const scenarios = buildScenarios(
      'ko',
      ['travel', 'friends', 'content'],
      [{ id: 'event-1', title: '친구와 점심' }],
    )

    expect(scenarios.every((scenario) => scenario.prompt.trim().length > 0)).toBe(true)
  })
})
