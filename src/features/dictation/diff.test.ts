import { describe, expect, it } from 'vitest'
import { wordDiff } from './diff'

describe('wordDiff', () => {
  it('完全一致は ratio 1 ですべて match になる', () => {
    expect(wordDiff('I like coffee', 'I like coffee', 'en')).toEqual({
      tokens: [
        { text: 'i', kind: 'match' },
        { text: 'like', kind: 'match' },
        { text: 'coffee', kind: 'match' },
      ],
      ratio: 1,
    })
  })

  it('1語抜けを missing として数える', () => {
    const result = wordDiff('I like hot coffee', 'I like coffee', 'en')

    expect(result.tokens.filter((token) => token.kind === 'missing')).toEqual([
      { text: 'hot', kind: 'missing' },
    ])
    expect(result.ratio).toBe(0.75)
  })

  it('入力にだけある1語を extra として置く', () => {
    const result = wordDiff('I like coffee', 'I really like coffee', 'en')

    expect(result.tokens).toContainEqual({ text: 'really', kind: 'extra' })
    expect(result.ratio).toBe(1)
  })

  it('大文字と句読点の差を無視する', () => {
    expect(wordDiff('Hello, WORLD!', 'hello world', 'en').ratio).toBe(1)
  })

  it('韓国語も空白単位で対応付ける', () => {
    const result = wordDiff('밥을 먹어요', '밥 먹어요', 'ko')

    expect(result.tokens).toContainEqual({ text: '밥을', kind: 'missing' })
    expect(result.tokens).toContainEqual({ text: '밥', kind: 'extra' })
    expect(result.ratio).toBe(0.5)
  })

  it('入力が空なら期待文をすべて missing にする', () => {
    expect(wordDiff('please sit down', '', 'en')).toEqual({
      tokens: [
        { text: 'please', kind: 'missing' },
        { text: 'sit', kind: 'missing' },
        { text: 'down', kind: 'missing' },
      ],
      ratio: 0,
    })
  })

  it('両方空なら ratio 1 にする', () => {
    expect(wordDiff('', '', 'en')).toEqual({ tokens: [], ratio: 1 })
  })
})
