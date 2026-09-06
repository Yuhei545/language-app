import { describe, expect, it } from 'vitest'
import { loadCore, validateCore } from './coreSchema'

function validCore(): unknown {
  return {
    version: 1,
    verbs: [{ text: 'eat', emoji: '🍽️', hint_ja: '食べる', takes: 'thing' }],
    nouns: [{ text: 'food', emoji: '🍚', hint_ja: '食べ物', kind: 'thing' }],
    adjectives: [{ text: 'good', emoji: '👍', hint_ja: '良い' }],
    phrasal: [{ text: 'get up', emoji: '🛏️', hint_ja: '起きる', takes: 'none' }],
    frames: [{
      id: 'verb-thing',
      level: 1,
      pattern: 'I {verb:thing} {noun:thing}.',
      slots: ['verb:thing', 'noun:thing'],
      hint_ja: '私は{2}を{1}',
    }],
  }
}

describe('loadCore', () => {
  it('英語と韓国語の実ファイルが検証を通る', () => {
    expect(loadCore('en').version).toBe(1)
    expect(loadCore('ko').version).toBe(1)
  })
})

describe('validateCore', () => {
  it('配列でないフィールドをラベルと理由付きで拒否する', () => {
    expect(() => validateCore({ ...validCore() as object, verbs: {} }, 'broken-arrays'))
      .toThrow(/broken-arrays: verbs は配列ではありません/)
  })

  it('必須フィールドの欠落をラベルと理由付きで拒否する', () => {
    const core = validCore() as { nouns: unknown[] }
    core.nouns = [{ text: 'food', hint_ja: '食べ物', kind: 'thing' }]

    expect(() => validateCore(core, 'missing-field'))
      .toThrow(/missing-field: nouns\[0\]\.emoji は必須/)
  })

  it.each([
    ['takes', { verbs: [{ text: 'eat', emoji: '🍽️', hint_ja: '食べる', takes: 'invalid' }] }],
    ['kind', { nouns: [{ text: 'food', emoji: '🍚', hint_ja: '食べ物', kind: 'invalid' }] }],
    ['level', { frames: [{ id: 'bad', level: 4, pattern: '', slots: [], hint_ja: '' }] }],
  ])('不正な%sをラベルと理由付きで拒否する', (field, replacement) => {
    expect(() => validateCore({ ...validCore() as object, ...replacement }, `bad-${field}`))
      .toThrow(new RegExp(`bad-${field}: .*${field}`))
  })

  it('slotsとpatternのトークン不一致を拒否する', () => {
    const core = validCore() as { frames: Array<Record<string, unknown>> }
    core.frames[0] = { ...core.frames[0], slots: ['noun:thing', 'verb:thing'] }

    expect(() => validateCore(core, 'slot-mismatch'))
      .toThrow(/slot-mismatch: .*slotsとpattern内のトークンが一致しません/)
  })

  it('スロット数を超えるhint_jaの番号を拒否する', () => {
    const core = validCore() as { frames: Array<Record<string, unknown>> }
    core.frames[0] = { ...core.frames[0], hint_ja: '{3}を使う' }

    expect(() => validateCore(core, 'bad-hint'))
      .toThrow(/bad-hint: .*\{3\}がスロット数を超えています/)
  })
})

describe('型の解説と例文', () => {
  it('実際の core.json は、すべての型に解説と 2 つ以上の例文を持つ', () => {
    for (const lang of ['en', 'ko'] as const) {
      const core = loadCore(lang)
      for (const frame of core.frames) {
        expect(frame.note_ja.length, `${lang} ${frame.id}`).toBeGreaterThan(5)
        expect(frame.examples.length, `${lang} ${frame.id}`).toBeGreaterThanOrEqual(2)
        for (const example of frame.examples) {
          expect(example.text.trim(), `${lang} ${frame.id}`).not.toBe('')
          expect(example.ja.trim(), `${lang} ${frame.id}`).not.toBe('')
        }
      }
    }
  })
})
