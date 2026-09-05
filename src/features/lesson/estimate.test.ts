import { describe, expect, it } from 'vitest'
import { estimateActionMs, estimateActionsMs, MS_PER_CHAR, SPEAK_OVERHEAD_MS } from './estimate'

describe('estimateActionMs', () => {
  it('読み上げは文字数 × 言語ごとの目安 + 立ち上がり、ゆっくりだと長くなる', () => {
    const text = 'Could I get a coffee, please?'
    const normal = estimateActionMs({ type: 'speak', text, lang: 'en' })
    expect(normal).toBe(SPEAK_OVERHEAD_MS + text.length * MS_PER_CHAR.en)
    expect(estimateActionMs({ type: 'speak', text, lang: 'en', rate: 0.9 })).toBeGreaterThan(normal)
  })

  it('間と空白はそのミリ秒をそのまま使い、合計は足し合わせ', () => {
    expect(estimateActionMs({ type: 'pause', ms: 4000, recordable: true })).toBe(4000)
    expect(estimateActionMs({ type: 'gap', ms: 300 })).toBe(300)
    expect(estimateActionsMs([
      { type: 'pause', ms: 4000, recordable: true },
      { type: 'gap', ms: 300 },
    ])).toBe(4300)
  })
})
