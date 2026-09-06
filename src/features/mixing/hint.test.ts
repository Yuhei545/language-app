import { describe, expect, it } from 'vitest'
import { buildHint } from './hint'

describe('buildHint', () => {
  it('聞こえた英単語数が半分未満なら先頭2トークンを促す', () => {
    expect(buildHint('coffee', 'How do I get coffee?', 'en')).toEqual({
      kind: 'start',
      token: 'how do',
      textJa: '「how do」から言ってみましょう',
    })
  })

  it('半分以上なら聞こえなかった最初のトークンを示す', () => {
    expect(buildHint('How I get coffee', 'How do I get coffee?', 'en')).toEqual({
      kind: 'missing',
      token: 'do',
      textJa: '「do」が抜けています。もう一度言ってみましょう',
    })
  })

  it('韓国語は正規化後に空白区切りの文節で比べる', () => {
    expect(buildHint('물 주세요', '찬 물 주세요!', 'ko')).toEqual({
      kind: 'missing',
      token: '찬',
      textJa: '「찬」が抜けています。もう一度言ってみましょう',
    })
  })

  it('模範の全トークンが含まれていれば null を返す', () => {
    expect(buildHint('Please, how do I get coffee?', 'How do I get coffee?', 'en'))
      .toBeNull()
  })

  it('ヒントに否定的な判定語を使わない', () => {
    const hint = buildHint('', 'How do I go?', 'en')
    expect(hint?.textJa).not.toMatch(/間違い|不正解/)
  })
})
