import { describe, expect, it } from 'vitest'
import type { CoreFrame, CoreWord } from '../../content/coreSchema'
import { attachParticle, hasBatchim, renderHint, renderPattern } from './particles'

function word(text: string, hintJa = text): CoreWord {
  return { text, emoji: '💬', hint_ja: hintJa }
}

describe('hasBatchim / attachParticle', () => {
  it.each([
    ['물', '을/를', '물을'],
    ['커피', '을/를', '커피를'],
    ['밥', '이/가', '밥이'],
    ['표', '이/가', '표가'],
    ['돈', '은/는', '돈은'],
    ['카페', '은/는', '카페는'],
  ] as const)('%s に %s を正しく付ける', (source, pair, expected) => {
    expect(attachParticle(source, pair)).toBe(expected)
  })

  it('ハングル以外は받침なしとし、助詞を付けずそのまま返す', () => {
    expect(hasBatchim('coffee')).toBe(false)
    expect(attachParticle('coffee', '을/를')).toBe('coffee')
  })
})

describe('renderPattern', () => {
  it('韓国語のスロットを埋めて直後の助詞を解決する', () => {
    const frame: CoreFrame = {
      id: 'ko-test',
      level: 1,
      pattern: '{noun:thing}을/를 {verb:thing}.',
      slots: ['noun:thing', 'verb:thing'],
      hint_ja: '{1}を{2}',
      note_ja: 'テスト用の解説',
      examples: [{ text: 'a', ja: 'あ' }, { text: 'b', ja: 'い' }],
    }

    expect(renderPattern(frame, [word('물'), word('마셔요')])).toBe('물을 마셔요.')
  })

  it('英語のスロットを順番に置換する', () => {
    const frame: CoreFrame = {
      id: 'en-test',
      level: 1,
      pattern: 'I {verb:thing} {noun:thing}.',
      slots: ['verb:thing', 'noun:thing'],
      hint_ja: '私は{2}を{1}',
      note_ja: 'テスト用の解説',
      examples: [{ text: 'a', ja: 'あ' }, { text: 'b', ja: 'い' }],
    }

    expect(renderPattern(frame, [word('eat'), word('food')])).toBe('I eat food.')
  })
})

describe('renderHint', () => {
  it('番号をスロット順の日本語ヒントに置換する', () => {
    const frame: CoreFrame = {
      id: 'hint-test',
      level: 1,
      pattern: 'I {verb:thing} {noun:thing}.',
      slots: ['verb:thing', 'noun:thing'],
      hint_ja: '私は{2}を{1}',
      note_ja: 'テスト用の解説',
      examples: [{ text: 'a', ja: 'あ' }, { text: 'b', ja: 'い' }],
    }

    expect(renderHint(frame, [word('eat', '食べる'), word('food', '食べ物')]))
      .toBe('私は食べ物を食べる')
  })
})
