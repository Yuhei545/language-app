import { describe, expect, it } from 'vitest'
import type { CoreFrame } from '../../content/coreSchema'
import { frameMastery, MASTERY, suggestLevel } from './mastery'
import type { FrameStats } from './patternSession'

const frames: CoreFrame[] = [
  { id: 'level-1', level: 1, pattern: '', slots: [], hint_ja: '', note_ja: 'テスト用の解説', examples: [{ text: 'a', ja: 'あ' }, { text: 'b', ja: 'い' }] },
  { id: 'level-2', level: 2, pattern: '', slots: [], hint_ja: '', note_ja: 'テスト用の解説', examples: [{ text: 'a', ja: 'あ' }, { text: 'b', ja: 'い' }] },
  { id: 'level-3', level: 3, pattern: '', slots: [], hint_ja: '', note_ja: 'テスト用の解説', examples: [{ text: 'a', ja: 'あ' }, { text: 'b', ja: 'い' }] },
]

function masteredStats(frameId: string): FrameStats {
  return {
    frameId,
    attempts: MASTERY.minAttempts,
    firstTry: 7,
    latencyMsTotal: 20_000,
    latencySamples: 8,
  }
}

describe('frameMastery', () => {
  it('未記録なら accuracy 0、平均時間 null、未習熟になる', () => {
    expect(frameMastery(undefined)).toEqual({
      accuracy: 0,
      avgLatencyMs: null,
      mastered: false,
    })
  })

  it('試行数・初回一致率・平均応答時間が全条件を満たすと習熟になる', () => {
    expect(frameMastery(masteredStats('frame'))).toEqual({
      accuracy: 0.875,
      avgLatencyMs: 2500,
      mastered: true,
    })
  })

  it.each([
    [{ ...masteredStats('few'), attempts: 7 }, '試行数'],
    [{ ...masteredStats('inaccurate'), firstTry: 6 }, '初回一致率'],
    [{ ...masteredStats('slow'), latencyMsTotal: 20_008 }, '応答時間'],
    [{ ...masteredStats('no-latency'), latencyMsTotal: 0, latencySamples: 0 }, '応答時間の記録'],
  ])('%sが条件外なら未習熟になる', (stats) => {
    expect(frameMastery(stats as FrameStats).mastered).toBe(false)
  })
})

describe('suggestLevel', () => {
  it('現在レベル以下の全型が習熟していれば次のレベルを返す', () => {
    expect(suggestLevel(2, frames, [masteredStats('level-1'), masteredStats('level-2')]))
      .toBe(3)
  })

  it('未習熟の型があれば現在レベルを維持する', () => {
    expect(suggestLevel(2, frames, [masteredStats('level-1')])).toBe(2)
  })

  it('レベル3より上には進めない', () => {
    expect(suggestLevel(3, frames, frames.map((frame) => masteredStats(frame.id))))
      .toBe(3)
  })
})
