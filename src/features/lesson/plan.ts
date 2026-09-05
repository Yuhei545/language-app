import { backChainSteps } from './backChain'
import type { LessonStep } from './types'

export type LessonVoice = 'A' | 'B' | 'narrator'

export type LessonAction =
  | { type: 'speak'; text: string; lang: 'en' | 'ko' | 'ja'; rate?: number; voice?: LessonVoice }
  | { type: 'pause'; ms: number; recordable: boolean }
  | { type: 'gap'; ms: number }

/**
 * 逆順組み立てで、聞いたチャンクを学習者が繰り返すための間。
 * Pimsleur ではネイティブ話者が末尾のかけらを言い、学習者が繰り返し、
 * 次のかけらを足す、を繰り返す。チャンクが長いほど間も長くする。
 */
export const REPEAT_PAUSE = { baseMs: 800, perUnitMs: 350, maxMs: 3000 } as const

/** 部分チャンクの末尾の句読点を落とす。「go.」を文末調で読まれると不自然になるため。 */
export function stripTrailingPunctuation(text: string): string {
  return text.replace(/[\s.!?,;:。、！？…]+$/u, '')
}

function unitCount(text: string, lang: 'en' | 'ko'): number {
  if (lang === 'en') {
    return text.split(/\s+/).filter((word) => word.length > 0).length
  }
  return Array.from(text).filter((character) => /[가-힣]/.test(character)).length
}

export function repeatPauseMs(chunk: string, lang: 'en' | 'ko'): number {
  const units = Math.max(1, unitCount(chunk, lang))
  return Math.min(REPEAT_PAUSE.maxMs, REPEAT_PAUSE.baseMs + REPEAT_PAUSE.perUnitMs * units)
}

/** 含有判定用に小文字化し、記号を落として空白を 1 つにそろえる。 */
function normalizeChunk(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
}

/**
 * 表現を Pimsleur 式に組み立てる行動列。
 * 1. まず全体を自然な速さで聞く
 * 2. 末尾のかけら(最大 3 段)から、言う → 繰り返す間、を重ねていく(部分は句読点なし、少しゆっくり)
 * 3. 最後に全体を自然な速さで 1 回
 * 単位が 3 未満の短い表現は、全体 → 間 → 全体 だけにする。
 * skipContainedIn に核の表現を渡すと、その中に含まれるかけら(すでに練習済み)は飛ばす。
 */
export function buildBackChainActions(
  text: string,
  lang: 'en' | 'ko',
  opts: { voice?: LessonVoice; skipContainedIn?: string } = {},
): LessonAction[] {
  const withVoice = (action: LessonAction): LessonAction => (
    action.type === 'speak' && opts.voice ? { ...action, voice: opts.voice } : action
  )
  const full = (rate?: number): LessonAction => withVoice({
    type: 'speak',
    text,
    lang,
    ...(rate !== undefined ? { rate } : {}),
  })
  const repeat = (chunk: string): LessonAction => ({
    type: 'pause',
    ms: repeatPauseMs(chunk, lang),
    recordable: false,
  })

  const chunks = backChainSteps(text, lang)
  let partials = chunks.slice(0, -1)
  if (opts.skipContainedIn) {
    const known = normalizeChunk(opts.skipContainedIn)
    partials = partials.filter((chunk) => !known.includes(normalizeChunk(chunk)))
  }

  if (partials.length === 0) {
    return [full(), repeat(text), full()]
  }

  const actions: LessonAction[] = [full(), repeat(text)]
  for (const chunk of partials) {
    const spoken = stripTrailingPunctuation(chunk)
    actions.push(withVoice({ type: 'speak', text: spoken, lang, rate: 0.9 }))
    actions.push(repeat(spoken))
  }
  actions.push(full())
  return actions
}

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

  return [
    cue,
    pause,
    ...buildBackChainActions(step.item.answer, opts.lang),
    { type: 'speak', text: 'もう一度', lang: 'ja' },
    { ...pause },
    answer,
  ]
}
