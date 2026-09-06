import { describe, expect, it } from 'vitest'
import type { DictationSentence } from '../../content/dictationSchema'
import type { DictationFeatureId } from '../../content/dictationFeatures'
import { selectSentences, type DictationSelectionProgress, type FeatureAccuracy } from './selectSentences'

const NOW = new Date('2026-09-06T12:00:00.000Z')

function sentence(id: string, features: DictationFeatureId[] = []): DictationSentence {
  return {
    id,
    text: `${id} text`,
    focus: ['ポイント'],
    features: features.map((feature) => ({ id: feature, span: 'text' })),
  }
}

/** 常に同じ値を返す rng。並び順を決定的にする。 */
const rng = () => 0.5

function progress(entries: Array<[string, Partial<DictationSelectionProgress>]>) {
  return new Map<string, DictationSelectionProgress>(
    entries.map(([id, row]) => [id, { best_ratio: 0, attempts: 1, ...row }]),
  )
}

describe('selectSentences', () => {
  it('予定日が来た文を、期限の古い順に先に出す', () => {
    const all = [sentence('en-001'), sentence('en-002'), sentence('en-003')]
    const rows = progress([
      ['en-001', { next_review_at: '2026-09-06T00:00:00.000Z' }],
      ['en-002', { next_review_at: '2026-09-01T00:00:00.000Z' }],
      ['en-003', { next_review_at: '2026-09-30T00:00:00.000Z' }],
    ])

    const selected = selectSentences(all, rows, 3, rng, [], NOW)

    expect(selected.map((item) => item.id)).toEqual(['en-002', 'en-001', 'en-003'])
  })

  it('まだ出していない文は、苦手な現象を含むものを先に出す', () => {
    const all = [sentence('en-001', ['linking']), sentence('en-002', ['flap']), sentence('en-003', ['weak-form'])]
    const stats: FeatureAccuracy[] = [
      { featureId: 'linking', attempts: 10, correct: 9 },
      { featureId: 'flap', attempts: 10, correct: 2 },
      { featureId: 'weak-form', attempts: 10, correct: 6 },
    ]

    const selected = selectSentences(all, new Map(), 3, rng, stats, NOW)

    expect(selected.map((item) => item.id)).toEqual(['en-002', 'en-003', 'en-001'])
  })

  it('予定日が来ていない文は最後に回し、正答率の低い順に出す', () => {
    const all = [sentence('en-001'), sentence('en-002')]
    const rows = progress([
      ['en-001', { next_review_at: '2026-09-30T00:00:00.000Z', best_ratio: 0.95 }],
      ['en-002', { next_review_at: '2026-09-30T00:00:00.000Z', best_ratio: 0.4 }],
    ])

    const selected = selectSentences(all, rows, 2, rng, [], NOW)

    expect(selected.map((item) => item.id)).toEqual(['en-002', 'en-001'])
  })

  it('予定日の来た文を、まだ出していない文より先に出す', () => {
    const all = [sentence('en-001'), sentence('en-002', ['flap'])]
    const rows = progress([['en-001', { next_review_at: '2026-09-01T00:00:00.000Z' }]])

    const selected = selectSentences(all, rows, 1, rng, [{ featureId: 'flap', attempts: 5, correct: 0 }], NOW)

    expect(selected.map((item) => item.id)).toEqual(['en-001'])
  })

  it('件数を守り、重複する id は 1 つにする', () => {
    const all = [sentence('en-001'), sentence('en-001'), sentence('en-002')]

    expect(selectSentences(all, new Map(), 5, rng, [], NOW)).toHaveLength(2)
    expect(selectSentences(all, new Map(), 0, rng, [], NOW)).toHaveLength(0)
  })
})
