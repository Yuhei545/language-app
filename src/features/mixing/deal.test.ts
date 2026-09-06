import { describe, expect, it } from 'vitest'
import type {
  CoreFrame,
  CoreNoun,
  CoreVerb,
  CoreVocab,
  CoreWord,
} from '../../content/coreSchema'
import { slotPool } from './combinations'
import { comboKey, deal } from './deal'

const eat: CoreVerb = { text: 'eat', emoji: '🍽️', hint_ja: '食べる', takes: 'thing' }
const drink: CoreVerb = { text: 'drink', emoji: '🥤', hint_ja: '飲む', takes: 'thing' }
const food: CoreNoun = { text: 'food', emoji: '🍚', hint_ja: '食べ物', kind: 'thing' }
const water: CoreNoun = { text: 'water', emoji: '💧', hint_ja: '水', kind: 'thing' }

const levelOneFrame: CoreFrame = {
  id: 'level-one',
  level: 1,
  pattern: 'I want {noun:thing}.',
  slots: ['noun:thing'],
  hint_ja: '{1}が欲しい', note_ja: 'テスト用の解説', examples: [{ text: 'a', ja: 'あ' }, { text: 'b', ja: 'い' }], }

const levelTwoFrame: CoreFrame = {
  id: 'level-two',
  level: 2,
  pattern: 'I {verb:thing} {noun:thing}.',
  slots: ['verb:thing', 'noun:thing'],
  hint_ja: '私は{2}を{1}', note_ja: 'テスト用の解説', examples: [{ text: 'a', ja: 'あ' }, { text: 'b', ja: 'い' }], }

const core: CoreVocab = {
  version: 1,
  verbs: [eat, drink],
  nouns: [food, water],
  adjectives: [],
  phrasal: [],
  frames: [levelOneFrame, levelTwoFrame],
}

function key(frame: CoreFrame, words: CoreWord[]): string {
  return comboKey(frame.id, words)
}

describe('deal', () => {
  it('frame idと全単語から安定したキーを作る', () => {
    expect(comboKey('frame-1', [eat, food])).toBe('frame-1|eat|food')
  })

  it('level 1ではlevel 1のフレームだけを配る', () => {
    const result = deal({ core, level: 1, history: new Map(), rng: () => 0 })
    expect(result.frame.level).toBe(1)
  })

  it('一度試した組み合わせより未経験の組み合わせを優先する', () => {
    const history = new Map([
      [key(levelOneFrame, [food]), { attempt_count: 1, understood_count: 0 }],
    ])
    const result = deal({ core, level: 1, history, rng: () => 0 })

    expect(result.key).toBe(key(levelOneFrame, [water]))
  })

  it('全候補が経験済みなら理解回数が少ない組み合わせを優先する', () => {
    const history = new Map([
      [key(levelOneFrame, [food]), { attempt_count: 2, understood_count: 2 }],
      [key(levelOneFrame, [water]), { attempt_count: 3, understood_count: 0 }],
    ])
    const result = deal({ core, level: 1, history, rng: () => 0 })

    expect(result.key).toBe(key(levelOneFrame, [water]))
  })

  it('直前と同じ組み合わせを避ける', () => {
    const avoidKey = key(levelOneFrame, [food])
    const result = deal({
      core,
      level: 1,
      history: new Map(),
      rng: () => 0,
      avoidKey,
    })

    expect(result.key).not.toBe(avoidKey)
  })

  it('各スロットの条件に合う語を返す', () => {
    const result = deal({ core, level: 2, history: new Map(), rng: () => 0.99 })

    result.frame.slots.forEach((slot, index) => {
      expect(slotPool(core, slot)).toContain(result.words[index])
    })
  })
})
