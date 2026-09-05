import { describe, expect, it } from 'vitest'
import { loadCore } from '../../content/coreSchema'
import { countCombinations, slotPool, wordCount } from './combinations'

describe('core vocabulary combinations', () => {
  it('英語の組み合わせ数は540', () => {
    const core = loadCore('en')
    expect(countCombinations(core)).toBe(540)
    expect(wordCount(core)).toBe(43)
  })

  it('韓国語の組み合わせ数は371', () => {
    const core = loadCore('ko')
    expect(countCombinations(core)).toBe(371)
    expect(wordCount(core)).toBe(33)
  })

  it('スロット条件に合う語だけを返す', () => {
    const core = loadCore('en')
    expect(slotPool(core, 'verb:place').map((word) => word.text)).toEqual(
      core.verbs.filter((word) => word.takes === 'place').map((word) => word.text),
    )
    expect(slotPool(core, 'noun:person').map((word) => word.text)).toEqual(
      core.nouns.filter((word) => word.kind === 'person').map((word) => word.text),
    )
  })
})
