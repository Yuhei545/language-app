import { describe, expect, it } from 'vitest'
import { loadTopics, validateTopics } from './topicsSchema'

const validTopic = {
  id: 'topic-1',
  level: 1,
  ja: '{place}で{thing}について話してください',
  uses: ['place', 'thing'],
}

describe('loadTopics', () => {
  it('英語と韓国語の実ファイルが検証を通る', () => {
    expect(loadTopics('en')).toHaveLength(16)
    expect(loadTopics('ko')).toHaveLength(12)
  })
})

describe('validateTopics', () => {
  it('version 1 以外を理由付きで拒否する', () => {
    expect(() => validateTopics({ version: 2, topics: [] }, 'bad-version'))
      .toThrow(/bad-version: version は1/)
  })

  it('重複した id を理由付きで拒否する', () => {
    expect(() => validateTopics({ version: 1, topics: [validTopic, validTopic] }, 'duplicate'))
      .toThrow(/duplicate: topics\[1\]\.id.*重複/)
  })

  it('不正な uses を理由付きで拒否する', () => {
    const topic = { ...validTopic, ja: '{time}について話してください', uses: ['time'] }
    expect(() => validateTopics({ version: 1, topics: [topic] }, 'bad-use'))
      .toThrow(/bad-use: topics\[0\]\.uses\[0\].*不正/)
  })

  it('ja のプレースホルダと uses の不一致を理由付きで拒否する', () => {
    const topic = { ...validTopic, uses: ['thing', 'place'] }
    expect(() => validateTopics({ version: 1, topics: [topic] }, 'mismatch'))
      .toThrow(/mismatch: topics\[0\].*プレースホルダが一致しません/)
  })
})
