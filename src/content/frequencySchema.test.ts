import { describe, expect, it } from 'vitest'
import { loadTwoWord } from './twoWordSchema'
import { bestRank, byFrequency, countOf, loadFrequency, rankOf, rankValue, UNRANKED } from './frequencySchema'

const set = loadFrequency()

describe('動詞の頻度ランキング', () => {
  it('1 位から 60 位まで、順位が連続していて重複しない', () => {
    expect(set.verbs).toHaveLength(60)
    expect(set.verbs.map((verb) => verb.rank)).toEqual(Array.from({ length: 60 }, (_, index) => index + 1))
    expect(new Set(set.verbs.map((verb) => verb.text)).size).toBe(60)
  })

  it('回数は上位ほど多い', () => {
    for (let index = 1; index < set.verbs.length; index += 1) {
      expect(
        set.verbs[index].count,
        `${set.verbs[index].text} が ${set.verbs[index - 1].text} より多い`,
      ).toBeLessThanOrEqual(set.verbs[index - 1].count)
    }
  })

  it('教材の順位どおり(1 位 have、6 位 think、7 位 want、8 位 say)', () => {
    expect(rankOf('have')).toBe(1)
    expect(countOf('have')).toBe(16404)
    expect(rankOf('think')).toBe(6)
    expect(rankOf('want')).toBe(7)
    expect(rankOf('say')).toBe(8)
  })

  it('ランキングに無い語は null、並べ替えでは最後', () => {
    expect(rankOf('bring')).toBeNull()
    expect(countOf('clean')).toBeNull()
    expect(rankValue('open')).toBe(UNRANKED)
  })
})

describe('並べ替え', () => {
  it('よく使う順に並べ、圏外は元の順のまま最後に置く', () => {
    expect(byFrequency(['try', 'have', 'open', 'go', 'bring'], (text) => text))
      .toEqual(['have', 'go', 'try', 'open', 'bring'])
  })

  it('bestRank は一番よく使う動詞の順位', () => {
    expect(bestRank(['try', 'have'])).toBe(1)
    expect(bestRank(['bring', 'clean'])).toBe(UNRANKED)
  })

  it('2 語で言うの 25 動詞のうち 22 語に順位がある', () => {
    const core = loadTwoWord().verbs.map((verb) => verb.text)
    const ranked = core.filter((text) => rankOf(text) !== null)
    expect(ranked).toHaveLength(22)
    expect(core.filter((text) => rankOf(text) === null)).toEqual(['bring', 'open', 'clean'])
  })
})
