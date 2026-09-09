import { beforeEach, describe, expect, it } from 'vitest'
import { loadTwoWord } from '../../content/twoWordSchema'
import {
  appendResult,
  bestRoundMs,
  buildTwoWordSession,
  questionRank,
  readTwoWordStats,
  reachedTarget,
  RECENT_TO_AVOID,
  SET_SIZE,
  SETS_PER_SESSION,
  suggestNextLevel,
  writeTwoWordStats,
  type TwoWordResult,
} from './twoWordSession'

const content = loadTwoWord()

function seeded(seed: number): () => number {
  let state = seed
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296
    return state / 4294967296
  }
}

describe('buildTwoWordSession', () => {
  it('4 問 × 3 セット。2 語は最後のセットが場面設定', () => {
    const session = buildTwoWordSession({ content, level: 2, random: seeded(1) })
    expect(session.rounds).toHaveLength(SETS_PER_SESSION)
    expect(session.rounds.every((round) => round.questions.length === SET_SIZE)).toBe(true)
    expect(session.rounds.map((round) => round.kind)).toEqual(['basic', 'basic', 'scene'])
    expect(session.rounds.flatMap((round) => round.questions).every((question) => question.level === 2)).toBe(true)
  })

  it('3 語・4 語は基礎だけ', () => {
    for (const level of [3, 4] as const) {
      const session = buildTwoWordSession({ content, level, random: seeded(2) })
      expect(session.rounds.map((round) => round.kind)).toEqual(['basic', 'basic', 'basic'])
      expect(session.rounds.flatMap((round) => round.questions).every((question) => question.level === level)).toBe(true)
    }
  })

  it('頻度順にすると、よく使う動詞の問題から順に出る', () => {
    const session = buildTwoWordSession({ content, level: 2, order: 'frequency', random: seeded(9) })
    expect(session.order).toBe('frequency')
    const basic = session.rounds.filter((round) => round.kind === 'basic').flatMap((round) => round.questions)
    const ranks = basic.map(questionRank)
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b))
    // 1 位 have、2 位 get あたりが先に来る
    expect(ranks[0]).toBeLessThanOrEqual(5)
  })

  it('教材の順では混ぜて出す(頻度順とは並びが違う)', () => {
    const byBook = buildTwoWordSession({ content, level: 2, random: seeded(9) })
    const byRank = buildTwoWordSession({ content, level: 2, order: 'frequency', random: seeded(9) })
    expect(byBook.order).toBe('book')
    const ids = (session: typeof byBook) => session.rounds.flatMap((round) => round.questions.map((q) => q.id))
    expect(ids(byBook)).not.toEqual(ids(byRank))
  })

  it('同じ問題は 1 回の中で重ならない', () => {
    const session = buildTwoWordSession({ content, level: 2, random: seeded(3) })
    const ids = session.rounds.flatMap((round) => round.questions.map((question) => question.id))
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('最近出した問題を避ける', () => {
    const first = buildTwoWordSession({ content, level: 2, random: seeded(4) })
    const recent = first.rounds.flatMap((round) => round.questions.map((question) => question.id))
    const second = buildTwoWordSession({ content, level: 2, recent, random: seeded(5) })
    const ids = second.rounds.flatMap((round) => round.questions.map((question) => question.id))
    expect(ids.some((id) => recent.includes(id))).toBe(false)
  })

  it('避けきれないときは、古く出したものから戻す', () => {
    const level4 = content.questions.filter((question) => question.level === 4).map((question) => question.id)
    const session = buildTwoWordSession({ content, level: 4, recent: level4, random: seeded(6) })
    expect(session.rounds.flatMap((round) => round.questions)).toHaveLength(SET_SIZE * SETS_PER_SESSION)
  })
})

describe('成績', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  const result = (overrides: Partial<TwoWordResult> = {}): TwoWordResult => ({
    at: '2026-09-09T00:00:00.000Z',
    level: 2,
    said: 11,
    total: 12,
    roundMs: [30000, 40000, 44000],
    ...overrides,
  })

  it('読み書きできて、壊れていれば空にする', () => {
    expect(readTwoWordStats('en')).toEqual({ version: 1, recent: [], history: [] })
    writeTwoWordStats('en', appendResult(readTwoWordStats('en'), result(), ['tw-001', 'tw-002']))
    expect(readTwoWordStats('en').recent).toEqual(['tw-001', 'tw-002'])
    expect(readTwoWordStats('en').history).toHaveLength(1)

    localStorage.setItem('lla.twoword.en', '{"broken')
    expect(readTwoWordStats('en').history).toEqual([])
  })

  it('最近の問題は上限まで、古いものから落とす', () => {
    let stats = readTwoWordStats('en')
    for (let index = 0; index < 5; index += 1) {
      stats = appendResult(stats, result(), Array.from({ length: 12 }, (_, i) => `tw-${index}-${i}`))
    }
    expect(stats.recent).toHaveLength(RECENT_TO_AVOID)
    expect(stats.recent[0]).toBe('tw-3-0')
  })

  it('目標: 言えた 8 割以上で、どのセットも 45 秒以内', () => {
    expect(reachedTarget(result())).toBe(true)
    expect(reachedTarget(result({ said: 9 }))).toBe(false)
    expect(reachedTarget(result({ roundMs: [30000, 46000, 40000] }))).toBe(false)
  })

  it('2 回続けて届いたら次の語数。4 語の先はない', () => {
    expect(suggestNextLevel([result()], 2)).toBeNull()
    expect(suggestNextLevel([result(), result()], 2)).toBe(3)
    expect(suggestNextLevel([result(), result({ said: 5 })], 2)).toBeNull()
    expect(suggestNextLevel([result({ level: 4 }), result({ level: 4 })], 4)).toBeNull()
    expect(suggestNextLevel([result({ level: 3 }), result({ level: 3 })], 2)).toBeNull()
  })

  it('その語数の最短のセット', () => {
    expect(bestRoundMs([], 2)).toBeNull()
    expect(bestRoundMs([result(), result({ roundMs: [25000] })], 2)).toBe(25000)
    expect(bestRoundMs([result()], 3)).toBeNull()
  })
})
