import { describe, expect, it } from 'vitest'
import {
  buildBackChainActions,
  planStep,
  repeatPauseMs,
  stripTrailingPunctuation,
  REPEAT_PAUSE,
} from './plan'
import type { LessonStep } from './types'

const firstStep: LessonStep = {
  item: {
    id: 'card-1',
    kind: 'word',
    cueJa: '駅へ行くと伝えてください',
    answer: 'I want to go.',
  },
  stage: 0,
}

describe('stripTrailingPunctuation', () => {
  it('末尾の句読点だけを落とす', () => {
    expect(stripTrailingPunctuation('go.')).toBe('go')
    expect(stripTrailingPunctuation('to go?')).toBe('to go')
    expect(stripTrailingPunctuation('가요.')).toBe('가요')
    expect(stripTrailingPunctuation("Don't go")).toBe("Don't go")
  })
})

describe('repeatPauseMs', () => {
  it('チャンクが長いほど間が長く、上限で止まる', () => {
    expect(repeatPauseMs('go', 'en')).toBe(REPEAT_PAUSE.baseMs + REPEAT_PAUSE.perUnitMs)
    expect(repeatPauseMs('I want to go', 'en')).toBe(REPEAT_PAUSE.baseMs + REPEAT_PAUSE.perUnitMs * 4)
    expect(repeatPauseMs('one two three four five six seven eight nine ten', 'en')).toBe(REPEAT_PAUSE.maxMs)
    expect(repeatPauseMs('역에 가요', 'ko')).toBe(REPEAT_PAUSE.baseMs + REPEAT_PAUSE.perUnitMs * 4)
  })
})

describe('buildBackChainActions', () => {
  it('全体 → 末尾からのかけら(句読点なし)+繰り返す間 → 全体を 1 回', () => {
    const actions = buildBackChainActions('I want to go.', 'en', { voice: 'B' })
    const speaks = actions.filter((action) => action.type === 'speak')

    expect(speaks.map((action) => action.type === 'speak' && action.text)).toEqual([
      'I want to go.',
      'go',
      'to go',
      'want to go',
      'I want to go.',
    ])
    expect(actions[0]).toMatchObject({ type: 'speak', text: 'I want to go.', voice: 'B' })
    expect(actions[0]).not.toHaveProperty('rate')
    expect(speaks.slice(1, 4).every((action) => action.type === 'speak' && action.rate === 0.9 && action.voice === 'B')).toBe(true)
  })

  it('かけらの直後には必ず繰り返す間があり、録音の対象にはしない', () => {
    const actions = buildBackChainActions('I want to go.', 'en')
    actions.forEach((action, index) => {
      if (action.type === 'speak' && index < actions.length - 1) {
        expect(actions[index + 1]).toMatchObject({ type: 'pause', recordable: false })
      }
    })
    const pauses = actions.filter((action) => action.type === 'pause')
    expect(pauses).toHaveLength(4)
    expect(pauses.every((action) => action.type === 'pause' && action.ms >= REPEAT_PAUSE.baseMs)).toBe(true)
  })

  it('短い表現は 全体 → 間 → 全体 だけ', () => {
    const actions = buildBackChainActions('Thank you.', 'en')
    expect(actions.map((action) => action.type)).toEqual(['speak', 'pause', 'speak'])
  })

  it('韓国語は音節単位で組み立てる', () => {
    const speaks = buildBackChainActions('역에 가요.', 'ko').filter((action) => action.type === 'speak')
    expect(speaks.map((action) => action.type === 'speak' && action.text)).toEqual([
      '역에 가요.', '요', '가요', '에 가요', '역에 가요.',
    ])
  })

  it('核の表現に含まれるかけらは飛ばし、残りだけを組み立てる', () => {
    const speaks = buildBackChainActions('Hi, what can I get for you?', 'en', { skipContainedIn: 'what can I get for you' })
      .filter((action) => action.type === 'speak')
    expect(speaks.map((action) => action.type === 'speak' && action.text)).toEqual([
      'Hi, what can I get for you?',
      'Hi, what can I get for you?',
    ])

    const partly = buildBackChainActions('Could I get a coffee, please?', 'en', { skipContainedIn: 'could I get' })
      .filter((action) => action.type === 'speak')
    // 6 語なので末尾から 3 段(2 語・3 語・5 語)。核 'could I get' に含まれるかけらは無い
    expect(partly.map((action) => action.type === 'speak' && action.text)).toEqual([
      'Could I get a coffee, please?',
      'coffee, please',
      'a coffee, please',
      'I get a coffee, please',
      'Could I get a coffee, please?',
    ])
  })
})

describe('planStep', () => {
  it('初出では問い → 間 → 逆順組み立て → もう一度 → 間 → 模範', () => {
    const actions = planStep(firstStep, { lang: 'en', pauseSeconds: 4 })

    expect(actions[0]).toEqual({ type: 'speak', text: firstStep.item.cueJa, lang: 'ja' })
    expect(actions[1]).toEqual({ type: 'pause', ms: 4000, recordable: true })
    const texts = actions.filter((action) => action.type === 'speak').map((action) => action.type === 'speak' && action.text)
    expect(texts).toContain('go')
    expect(texts).toContain('want to go')
    expect(texts).toContain('もう一度')
    expect(actions[actions.length - 1]).toEqual({ type: 'speak', text: firstStep.item.answer, lang: 'en' })
    expect(actions.filter((action) => action.type === 'pause' && !action.recordable)).toHaveLength(4)
  })

  it('stage 2 は問い、間、模範の3行動になる', () => {
    const actions = planStep({ ...firstStep, stage: 2 }, { lang: 'en', pauseSeconds: 5 })

    expect(actions).toEqual([
      { type: 'speak', text: firstStep.item.cueJa, lang: 'ja' },
      { type: 'pause', ms: 5000, recordable: true },
      { type: 'speak', text: firstStep.item.answer, lang: 'en' },
    ])
  })

  it('pause のミリ秒と韓国語の lang を設定どおりにする', () => {
    const actions = planStep({
      ...firstStep,
      item: { ...firstStep.item, answer: '역에 가요.' },
      stage: 3,
    }, { lang: 'ko', pauseSeconds: 7 })

    expect(actions[1]).toEqual({ type: 'pause', ms: 7000, recordable: true })
    expect(actions[2]).toEqual({ type: 'speak', text: '역에 가요.', lang: 'ko' })
  })
})
