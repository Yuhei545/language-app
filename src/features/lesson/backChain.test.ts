import { describe, expect, it } from 'vitest'
import { backChainSteps } from './backChain'

describe('backChainSteps', () => {
  it('英語を末尾の語から組み立てる', () => {
    expect(backChainSteps('I want to go.', 'en')).toEqual([
      'go.',
      'to go.',
      'want to go.',
      'I want to go.',
    ])
  })

  it('韓国語を末尾の音節から組み立てる', () => {
    expect(backChainSteps('역에 가요.', 'ko')).toEqual([
      '요.',
      '가요.',
      '에 가요.',
      '역에 가요.',
    ])
  })

  it('韓国語の空白を単位に数えない', () => {
    expect(backChainSteps('물 주세요.', 'ko')).toEqual([
      '요.',
      '세요.',
      '주세요.',
      '물 주세요.',
    ])
  })

  it('3語未満の英語はそのまま返す', () => {
    expect(backChainSteps('Thank you.', 'en')).toEqual(['Thank you.'])
  })

  it('長い英語は末尾からの部分を 3 段に間引く', () => {
    expect(backChainSteps('What can I get for you?', 'en')).toEqual([
      'for you?',
      'get for you?',
      'can I get for you?',
      'What can I get for you?',
    ])
  })

  it('長い韓国語も末尾からの部分を 3 段に間引く', () => {
    expect(backChainSteps('공항에 어떻게 가요?', 'ko')).toEqual([
      '가요?',
      '떻게 가요?',
      '에 어떻게 가요?',
      '공항에 어떻게 가요?',
    ])
  })
})
