import { describe, expect, it } from 'vitest'
import { buildChatGptPrompt } from './chatgptPrompt'

const base = {
  lang: 'en' as const,
  weekWords: ['could I get', 'anything else'],
  knownWords: ['coffee', 'station', 'coffee'],
  targetWords: ['express train'],
  personalWords: [
    { ja: '渋谷', en: 'Shibuya', ko: '시부야', kind: 'place' as const },
    { ja: 'ケーキ', en: '', ko: '케이크', kind: 'thing' as const },
  ],
  interests: ['travel' as const, 'content' as const],
  personaName: 'Sam',
}

describe('buildChatGptPrompt', () => {
  it('言語の親のルール(訂正しない・言い直し・質問で終える)と語彙を含む', () => {
    const prompt = buildChatGptPrompt(base)

    expect(prompt).toContain('英語の親')
    expect(prompt).toContain('間違いを直さない')
    expect(prompt).toContain('言い直して')
    expect(prompt).toContain('短い質問で終える')
    expect(prompt).toContain('今週の語: could I get, anything else')
    expect(prompt).toContain('知っている語: coffee, station')
    expect(prompt).toContain('express train')
  })

  it('自分の語は対象言語に訳があるものだけ、種類と日本語を添えて入れる', () => {
    const prompt = buildChatGptPrompt(base)

    expect(prompt).toContain('Shibuya(場所: 渋谷)')
    expect(prompt).not.toContain('ケーキ')
  })

  it('場面が無ければ相手に選ばせ、あれば書く', () => {
    expect(buildChatGptPrompt(base)).toContain('場面を 1 つ選び')
    expect(buildChatGptPrompt({ ...base, sceneJa: 'カフェで注文する' })).toContain('- カフェで注文する')
  })

  it('韓国語は初級のレベルと既定の名前で作る', () => {
    const prompt = buildChatGptPrompt({ ...base, lang: 'ko', personaName: '' })

    expect(prompt).toContain('韓国語の親')
    expect(prompt).toContain('지민')
    expect(prompt).toContain('-요 体')
  })
})

describe('buildChatGptPrompt: 今日の狙い', () => {
  it('狙いを渡すと、使う場面を作る指示と「使えた:」のまとめのルールを含む', () => {
    const prompt = buildChatGptPrompt({ ...base, targetExpressions: ['Could I get ___?', 'pick up'] })

    expect(prompt).toContain('今日の狙い(私が使う場面を作ってほしい表現。___ には合う語が入る): Could I get ___?, pick up')
    expect(prompt).toContain('「使えた: a, b」の 1 行で書く')
  })

  it('狙いが無ければその行とルールは出さない', () => {
    const prompt = buildChatGptPrompt(base)

    expect(prompt).not.toContain('今日の狙い')
    expect(prompt).not.toContain('使えた: a, b')
  })
})
