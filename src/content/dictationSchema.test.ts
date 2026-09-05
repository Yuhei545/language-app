import { describe, expect, it } from 'vitest'
import { loadDictation, validateDictation } from './dictationSchema'

const validSentence = {
  id: 'en-001',
  text: 'I want some coffee.',
  focus: ['want some の音のつながり'],
}

describe('loadDictation', () => {
  it('英語と韓国語の実ファイルが検証を通る', () => {
    expect(loadDictation('en')).toHaveLength(60)
    expect(loadDictation('ko')).toHaveLength(60)
  })
})

describe('validateDictation', () => {
  it('配列でない入力をラベルと理由付きで拒否する', () => {
    expect(() => validateDictation({}, 'broken-root'))
      .toThrow(/broken-root: root は配列/)
  })

  it.each([
    ['id', { ...validSentence, id: 'english-1' }, /bad-id: \[0\]\.id.*形式/],
    ['text', { ...validSentence, text: '   ' }, /bad-text: \[0\]\.text.*空でない/],
    ['focus-empty', { ...validSentence, focus: [] }, /bad-focus-empty: \[0\]\.focus.*1件以上/],
    ['focus-item', { ...validSentence, focus: [''] }, /bad-focus-item: \[0\]\.focus\[0\].*空でない/],
  ])('%s が壊れた入力を理由付きで拒否する', (label, sentence, expected) => {
    expect(() => validateDictation([sentence], `bad-${label}`)).toThrow(expected)
  })

  it('重複した id を拒否する', () => {
    expect(() => validateDictation([validSentence, validSentence], 'duplicate'))
      .toThrow(/duplicate: \[1\]\.id.*重複/)
  })
})
