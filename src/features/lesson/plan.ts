import { backChainSteps } from './backChain'
import type { LessonStep } from './types'

export type LessonAction =
  | { type: 'speak'; text: string; lang: 'en' | 'ko' | 'ja'; rate?: number }
  | { type: 'pause'; ms: number; recordable: boolean }
  | { type: 'gap'; ms: number }

export function planStep(
  step: LessonStep,
  opts: { lang: 'en' | 'ko'; pauseSeconds: number },
): LessonAction[] {
  const pause: LessonAction = {
    type: 'pause',
    ms: opts.pauseSeconds * 1000,
    recordable: true,
  }
  const cue: LessonAction = { type: 'speak', text: step.item.cueJa, lang: 'ja' }
  const answer: LessonAction = { type: 'speak', text: step.item.answer, lang: opts.lang }

  if (step.stage !== 0) {
    return [cue, pause, answer]
  }

  const chain = backChainSteps(step.item.answer, opts.lang)
  const chainActions = chain.flatMap<LessonAction>((text, index) => [
    { type: 'speak', text, lang: opts.lang, rate: 0.9 },
    ...(index < chain.length - 1 ? [{ type: 'gap', ms: 400 } as LessonAction] : []),
  ])

  return [
    cue,
    pause,
    ...chainActions,
    { type: 'speak', text: 'もう一度', lang: 'ja' },
    { ...pause },
    answer,
  ]
}
