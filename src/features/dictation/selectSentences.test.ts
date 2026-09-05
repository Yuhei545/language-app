import { describe, expect, it } from 'vitest'
import type { DictationSentence } from '../../content/dictationSchema'
import { selectSentences } from './selectSentences'

const sentences: DictationSentence[] = ['001', '002', '003', '004'].map((number) => ({
  id: `en-${number}`,
  text: `sentence ${number}`,
  focus: ['point'],
}))

describe('selectSentences', () => {
  it('0.9 未満は ratio の低い順にする', () => {
    const progress = new Map([
      ['en-001', { best_ratio: 0.8, attempts: 1 }],
      ['en-002', { best_ratio: 0.2, attempts: 2 }],
      ['en-003', { best_ratio: 0.5, attempts: 1 }],
      ['en-004', { best_ratio: 1, attempts: 1 }],
    ])

    expect(selectSentences(sentences, progress, 4, () => 0.5).map(({ id }) => id))
      .toEqual(['en-002', 'en-003', 'en-001', 'en-004'])
  })

  it('未経験を 0.9 以上の文より先にする', () => {
    const progress = new Map([
      ['en-001', { best_ratio: 0.95, attempts: 1 }],
      ['en-002', { best_ratio: 1, attempts: 2 }],
      ['en-004', { best_ratio: 0.9, attempts: 1 }],
    ])

    expect(selectSentences(sentences, progress, 4, () => 0.5)[0].id).toBe('en-003')
  })

  it('count を超えず、重複しない', () => {
    const duplicated = [...sentences, sentences[0]]
    const selected = selectSentences(duplicated, new Map(), 3, () => 0.5)

    expect(selected).toHaveLength(3)
    expect(new Set(selected.map(({ id }) => id)).size).toBe(3)
  })

  it('すべて 0.9 以上でも count 件を返す', () => {
    const progress = new Map(sentences.map((sentence) => [
      sentence.id,
      { best_ratio: 0.9, attempts: 1 },
    ]))

    expect(selectSentences(sentences, progress, 3, () => 0.5)).toHaveLength(3)
  })
})
