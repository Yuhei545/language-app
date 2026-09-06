import { describe, expect, it } from 'vitest'
import { NEW_SHARE, QUOTAS, selectDailyTargets, targetProgress } from './dailyTargets'
import { summarizeEncounters, type EncounterRecord } from './ledger'
import type { Chunk } from './registry'

const NOW = new Date('2026-09-06T12:00:00.000Z').getTime()
const rng = () => 0.5

function chunk(key: string, kind: Chunk['kind']): Chunk {
  return { key, kind, lang: 'en', display: key, hintJa: '', anchor: key, variants: [] }
}

function encounters(key: string, count: number, kind: 'seen' | 'said' = 'seen', at = '2026-09-01T00:00:00.000Z'): EncounterRecord[] {
  return Array.from({ length: count }, (_, index) => ({ chunk_key: key, kind, mode: 'dictation', context: `c${index}`, at }))
}

const registry: Chunk[] = [
  ...['f1', 'f2', 'f3', 'f4', 'f5'].map((key) => chunk(key, 'frame')),
  ...['p1', 'p2', 'p3'].map((key) => chunk(key, 'phrasal')),
  ...['e1', 'e2', 'e3', 'e4'].map((key) => chunk(key, 'expression')),
]

describe('selectDailyTargets', () => {
  it('英語は 8 個で、型 3・句動詞 2・表現 2 の枠を満たす', () => {
    // 全部に少し出会っておく(新規の上限に引っかからないように)
    const rows = registry.flatMap((item) => encounters(item.key, 2))
    const targets = selectDailyTargets({ registry, summaries: summarizeEncounters(rows), lang: 'en', now: NOW, rng })

    expect(targets).toHaveLength(QUOTAS.en.total)
    expect(targets.filter((item) => item.kind === 'frame').length).toBeGreaterThanOrEqual(3)
    expect(targets.filter((item) => item.kind === 'phrasal').length).toBeGreaterThanOrEqual(2)
    expect(targets.filter((item) => item.kind === 'expression').length).toBeGreaterThanOrEqual(2)
  })

  it('出会いの少ないものを先に、身についたものは外す', () => {
    const rows = [
      ...encounters('f1', 1),
      ...encounters('f2', 5),
      ...encounters('f3', 8), ...encounters('f3', 3, 'said'),
      ...encounters('p1', 2), ...encounters('p2', 2), ...encounters('p3', 2),
      ...encounters('e1', 2), ...encounters('e2', 2), ...encounters('e3', 2), ...encounters('e4', 2),
      ...encounters('f4', 3), ...encounters('f5', 3),
    ]
    const targets = selectDailyTargets({ registry, summaries: summarizeEncounters(rows), lang: 'en', now: NOW, rng })
    const keys = targets.map((item) => item.key)

    expect(keys).not.toContain('f3')
    expect(keys).toContain('f1')
    expect(keys.indexOf('f1')).toBeLessThan(keys.indexOf('f4'))
    // 出会い 5 回の f2 は、3 回の f4/f5 より後回し(型の枠 3 に入らない)
    expect(keys).not.toContain('f2')
  })

  it('一度も出ていないものは全体の 1/4 まで', () => {
    // f1..f5 が新規、他は既出
    const rows = ['p1', 'p2', 'p3', 'e1', 'e2', 'e3', 'e4'].flatMap((key) => encounters(key, 2))
    const targets = selectDailyTargets({ registry, summaries: summarizeEncounters(rows), lang: 'en', now: NOW, rng })
    const fresh = targets.filter((item) => item.key.startsWith('f'))

    expect(fresh.length).toBe(Math.max(1, Math.floor(QUOTAS.en.total * NEW_SHARE)))
    expect(targets).toHaveLength(QUOTAS.en.total)
  })

  it('候補が少ない韓国語でも、あるだけで埋める', () => {
    const small = [chunk('kf1', 'frame'), chunk('ke1', 'expression')].map((item) => ({ ...item, lang: 'ko' as const }))
    const targets = selectDailyTargets({ registry: small, summaries: new Map(), lang: 'ko', now: NOW, rng })

    expect(targets.map((item) => item.key)).toEqual(['kf1', 'ke1'])
  })

  it('同じ見せ方の型は同じ日に 1 つだけ', () => {
    const twins: Chunk[] = [
      { ...chunk('f-thing-was', 'frame'), display: '___ was ___.' },
      { ...chunk('f-media-was', 'frame'), display: '___ was ___.' },
      chunk('f-other', 'frame'),
    ]
    const targets = selectDailyTargets({ registry: twins, summaries: new Map(), lang: 'en', now: NOW, rng })

    expect(targets.filter((item) => item.display === '___ was ___.')).toHaveLength(1)
    expect(targets.map((item) => item.key)).toContain('f-other')
  })

  it('同じ入力なら同じ狙いになる', () => {
    const rows = registry.flatMap((item) => encounters(item.key, 1))
    const first = selectDailyTargets({ registry, summaries: summarizeEncounters(rows), lang: 'en', now: NOW, rng })
    const second = selectDailyTargets({ registry, summaries: summarizeEncounters(rows), lang: 'en', now: NOW, rng })

    expect(first.map((item) => item.key)).toEqual(second.map((item) => item.key))
  })
})

describe('targetProgress', () => {
  it('出会い n/8 を返す', () => {
    const summaries = summarizeEncounters([...encounters('f1', 3), ...encounters('f1', 1, 'said')])
    expect(targetProgress(summaries.get('f1'))).toEqual({ seen: 4, said: 1, goal: 8 })
    expect(targetProgress(undefined)).toEqual({ seen: 0, said: 0, goal: 8 })
  })
})
