import { describe, expect, it } from 'vitest'
import type { CoreVocab } from '../../content/coreSchema'
import type { VocabItemRow } from '../../services/supabase/types'
import {
  buildChunkRegistry,
  chunksIn,
  frameAnchor,
  frameDisplay,
  frameHintJa,
  isExpressionItem,
  matchChunk,
  verbForms,
} from './registry'

const frame = (id: string, pattern: string, hintJa: string) => ({
  id,
  level: 1 as const,
  pattern,
  slots: Array.from(pattern.matchAll(/\{([^{}]+)\}/g), (match) => match[1]),
  hint_ja: hintJa,
  note_ja: '説明',
  examples: [{ text: 'a', ja: 'あ' }, { text: 'b', ja: 'い' }],
})

const enCore: CoreVocab = {
  version: 1,
  verbs: [],
  nouns: [{ text: 'the check', emoji: '🧾', hint_ja: 'お会計', kind: 'thing' }],
  adjectives: [],
  phrasal: [{ text: 'pick up', emoji: '📦', hint_ja: '受け取る', takes: 'thing' }],
  frames: [
    frame('en-could-i-get', 'Could I get {noun:thing}?', '{1}をもらえますか'),
    frame('en-is-far', 'Is {noun:place} far from here?', '{1}はここから遠いですか'),
  ],
}

function item(overrides: Partial<VocabItemRow>): VocabItemRow {
  return {
    id: 'item',
    user_id: 'u',
    lang: 'en',
    week: 1,
    text: 'x',
    emoji: '',
    hint_ja: '',
    example: '',
    category: 'baby',
    source: 'bundled',
    prep_event_id: null,
    created_at: '2026-09-06T00:00:00.000Z',
    chunk_key: null,
    ...overrides,
  }
}

describe('型の見せ方と固定部分', () => {
  it('スロットを ___ にし、番号を〜にする', () => {
    expect(frameDisplay(enCore.frames[0])).toBe('Could I get ___?')
    expect(frameHintJa(enCore.frames[0])).toBe('〜をもらえますか')
  })

  it('固定部分は最も長い区間(英語は語数)', () => {
    expect(frameAnchor(enCore.frames[0], 'en')).toBe('could i get')
    expect(frameAnchor(enCore.frames[1], 'en')).toBe('far from here')
  })

  it('英語 1 語・韓国語 1 文字の固定部分は使わない(the / was / 에)', () => {
    expect(frameAnchor(frame('en-thing-was-adj', '{noun:thing} was {adj}.', ''), 'en')).toBe('')
    expect(frameAnchor(frame('en-at-place', 'The {noun:thing} at {noun:place} was {adj}.', ''), 'en')).toBe('')
    expect(frameAnchor(frame('ko-place-verb', '{noun:place}에 {verb:place}.', ''), 'ko')).toBe('')
    expect(frameAnchor(frame('ko-place-gayo', '{noun:place}에 가요.', ''), 'ko')).toBe('에가요')
  })

  it('韓国語はスロット直後の助詞を固定部分に含めず、空白を除く', () => {
    expect(frameAnchor(frame('ko-juseyo', '{noun:thing} 주세요.', '{1}をください'), 'ko')).toBe('주세요')
    expect(frameAnchor(frame('ko-thing-verb', '{noun:thing}을/를 {verb:thing}.', '{1}を{2}'), 'ko')).toBe('')
    expect(frameDisplay(frame('ko-thing-verb', '{noun:thing}을/를 {verb:thing}.', ''))).toBe('___을/를 ___.')
  })
})

describe('表現として狙いにするカード', () => {
  it('2 語以上、または道具箱・つなぎ・会話の表現は狙いにする', () => {
    expect(isExpressionItem(item({ text: 'to be honest', category: 'glue' }), 'en')).toBe(true)
    expect(isExpressionItem(item({ text: 'coffee', category: 'baby' }), 'en')).toBe(false)
    expect(isExpressionItem(item({ text: 'Could I get a table for two?', category: 'baby' }), 'en')).toBe(true)
    expect(isExpressionItem(item({ text: '그런데', category: 'glue' }), 'ko')).toBe(true)
    expect(isExpressionItem(item({ text: '커피', category: 'baby' }), 'ko')).toBe(false)
  })

  it('型・句動詞として種まきしたカードは二重に数えない', () => {
    expect(isExpressionItem(item({ text: 'Could I get ___?', category: 'core', chunk_key: 'frame:en-could-i-get' }), 'en')).toBe(false)
  })
})

describe('buildChunkRegistry', () => {
  it('型・句動詞・表現を集め、種まき済みのカードと結びつける', () => {
    const registry = buildChunkRegistry(enCore, [
      item({ id: 'card-frame', text: 'Could I get ___?', category: 'core', chunk_key: 'frame:en-could-i-get' }),
      item({ id: 'card-glue', text: 'to be honest', category: 'glue', hint_ja: '正直に言うと' }),
      item({ id: 'card-word', text: 'coffee', category: 'baby' }),
    ], 'en')

    expect(registry.map((chunk) => chunk.key)).toEqual([
      'frame:en-could-i-get',
      'frame:en-is-far',
      'phrasal:pick up',
      'expr:to be honest',
    ])
    expect(registry[0]).toMatchObject({ kind: 'frame', display: 'Could I get ___?', vocabItemId: 'card-frame' })
    expect(registry[3]).toMatchObject({ kind: 'expression', hintJa: '正直に言うと', vocabItemId: 'card-glue' })
  })
})

describe('文との照合', () => {
  const registry = buildChunkRegistry(enCore, [item({ id: 'g', text: 'to be honest', category: 'glue' })], 'en')

  it('固定部分を語単位で含めば一致(大文字・句読点は無視)', () => {
    const frameChunk = registry[0]
    expect(matchChunk('Could I get the check, please?', frameChunk, 'en')).toBe(true)
    expect(matchChunk('I could get it.', frameChunk, 'en')).toBe(false)
    expect(matchChunk('Pick up the ticket.', registry[2], 'en')).toBe(true)
  })

  it('句動詞は先頭の動詞の活用も一致とみなす', () => {
    const pickUp = registry[2]
    expect(pickUp.variants).toEqual(expect.arrayContaining(['picked up', 'picking up', 'picks up']))
    expect(matchChunk('She picked up the ticket.', pickUp, 'en')).toBe(true)
    expect(matchChunk('I am picking it up.', pickUp, 'en')).toBe(false)
    expect(verbForms('catch')).toEqual(expect.arrayContaining(['catches', 'caught', 'catching']))
    expect(verbForms('hang')).toContain('hung')
    expect(verbForms('chill')).toContain('chilled')
  })

  it('文に含まれるチャンクをまとめて返す', () => {
    const found = chunksIn('To be honest, could I get the menu?', registry, 'en')
    expect(found.map((chunk) => chunk.key)).toEqual(['frame:en-could-i-get', 'expr:to be honest'])
  })

  it('韓国語は空白のゆれを無視して含有を見る', () => {
    const koCore: CoreVocab = { ...enCore, phrasal: [], frames: [frame('ko-gayo', '{noun:place}에 가요.', '{1}に行きます')] }
    const [chunk] = buildChunkRegistry(koCore, [], 'ko')
    expect(matchChunk('내일 학교에 가요.', chunk, 'ko')).toBe(true)
    expect(matchChunk('학교 에 가요', chunk, 'ko')).toBe(true)
    expect(matchChunk('밥을 먹어요.', chunk, 'ko')).toBe(false)
  })
})
