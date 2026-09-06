import { describe, expect, it } from 'vitest'
import type { CoreVocab } from '../../content/coreSchema'
import type { VocabItemRow } from '../../services/supabase/types'
import { buildCue, buildLessonItems } from './material'

const core: CoreVocab = {
  version: 1,
  verbs: [],
  nouns: [
    { text: 'coffee', emoji: '☕', hint_ja: 'コーヒー', kind: 'thing' },
    { text: 'water', emoji: '💧', hint_ja: '水', kind: 'thing' },
    { text: 'tea', emoji: '🍵', hint_ja: 'お茶', kind: 'thing' },
  ],
  adjectives: [],
  phrasal: [],
  frames: [{
    id: 'want-thing',
    level: 1,
    pattern: 'I want {noun:thing}.',
    slots: ['noun:thing'],
    note_ja: 'テスト用の解説',
    examples: [{ text: 'a', ja: 'あ' }, { text: 'b', ja: 'い' }],
    hint_ja: '{1}が欲しい',
  }],
}

function vocab(id: string, category: VocabItemRow['category'] = 'baby'): VocabItemRow {
  return {
    id,
    user_id: 'user-1',
    lang: 'en',
    week: 1,
    text: `word-${id}`,
    emoji: '💬',
    hint_ja: `意味-${id}`,
    example: `Example ${id}`,
    category,
    source: 'bundled',
    prep_event_id: null,
    chunk_key: null,
    created_at: '2026-01-01T00:00:00.000Z',
  }
}

describe('buildCue', () => {
  it('toolbox は「言いたいとき」、それ以外は「伝える」にする', () => {
    expect(buildCue({ category: 'toolbox', hint_ja: 'もう一度' }))
      .toBe('「もう一度」と言いたいとき')
    expect(buildCue({ category: 'baby', hint_ja: '水' }))
      .toBe('「水」を伝える')
  })
})

describe('buildLessonItems', () => {
  it('カード、core、準備語の順を保って上限で切る', () => {
    const result = buildLessonItems({
      dueCards: [vocab('card-1'), vocab('card-2')],
      core,
      mixingHistory: new Map(),
      prepWords: [vocab('prep-1', 'prep')],
      rng: () => 0,
      maxItems: 4,
    })

    expect(result).toHaveLength(4)
    expect(result.map(({ kind }) => kind)).toEqual(['word', 'word', 'frame', 'frame'])
  })

  it('重複入力があっても id を一意にする', () => {
    const card = vocab('same')
    const prep = vocab('prep', 'prep')
    const result = buildLessonItems({
      dueCards: [card, card],
      core,
      mixingHistory: new Map(),
      prepWords: [prep, prep],
      rng: () => 0,
    })

    expect(new Set(result.map(({ id }) => id)).size).toBe(result.length)
  })

  it('復習カードが空でも core だけから作れる', () => {
    const result = buildLessonItems({
      dueCards: [],
      core,
      mixingHistory: new Map(),
      prepWords: [],
      rng: () => 0,
    })

    expect(result).toHaveLength(3)
    expect(result.every(({ kind }) => kind === 'frame')).toBe(true)
  })

  it('固定 rng なら同じ教材になる', () => {
    const params = {
      dueCards: [vocab('card-1')],
      core,
      mixingHistory: new Map<string, { attempt_count: number; understood_count: number }>(),
      prepWords: [vocab('prep-1', 'prep')],
      rng: () => 0.25,
    }

    expect(buildLessonItems(params)).toEqual(buildLessonItems(params))
  })
})
