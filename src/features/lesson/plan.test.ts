import { describe, expect, it } from 'vitest'
import { planStep } from './plan'
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

describe('planStep', () => {
  it('初出では back-chaining を末尾から順に含める', () => {
    const actions = planStep(firstStep, { lang: 'en', pauseSeconds: 4 })
    const targetSpeech = actions.filter(
      (action) => action.type === 'speak' && action.lang === 'en' && action.rate === 0.9,
    )

    expect(targetSpeech).toEqual([
      { type: 'speak', text: 'go.', lang: 'en', rate: 0.9 },
      { type: 'speak', text: 'to go.', lang: 'en', rate: 0.9 },
      { type: 'speak', text: 'want to go.', lang: 'en', rate: 0.9 },
      { type: 'speak', text: 'I want to go.', lang: 'en', rate: 0.9 },
    ])
    expect(actions.filter((action) => action.type === 'gap')).toHaveLength(3)
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
