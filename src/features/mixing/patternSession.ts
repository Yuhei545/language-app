import type { CoreFrame, CoreVocab, CoreWord } from '../../content/coreSchema'
import { slotPool } from './combinations'
import { comboKey } from './deal'
import { frameMastery } from './mastery'
import { renderHint, renderPattern } from './particles'

export type PatternItem = {
  id: string
  frame: CoreFrame
  words: CoreWord[]
  promptJa: string
  answer: string
}

export type PatternSession = {
  frames: CoreFrame[]
  items: PatternItem[]
  rounds: PatternItem[][]
}

export type FrameStats = {
  frameId: string
  attempts: number
  firstTry: number
  latencyMsTotal: number
  latencySamples: number
}

function randomIndex(length: number, rng: () => number): number {
  const value = Math.min(Math.max(rng(), 0), 1 - Number.EPSILON)
  return Math.floor(value * length)
}

function expandWords(pools: CoreWord[][]): CoreWord[][] {
  return pools.reduce<CoreWord[][]>(
    (combinations, pool) => combinations.flatMap(
      (combination) => pool.map((word) => [...combination, word]),
    ),
    [[]],
  )
}

function buildFrameItems(
  frame: CoreFrame,
  core: CoreVocab,
  history: Map<string, { attempt_count: number }>,
  count: number,
  rng: () => number,
): PatternItem[] {
  const pools = frame.slots.map((slot) => slotPool(core, slot))
  if (pools.some((pool) => pool.length === 0)) {
    throw new Error(`フレーム ${frame.id} に使える単語がありません`)
  }

  const remaining = expandWords(pools)
  // 語が少ない型(韓国語の人称など)は組み合わせが count に満たない。落とさず、ある分だけ出す。
  const target = Math.min(count, remaining.length)

  const items: PatternItem[] = []
  while (items.length < target) {
    const untried = remaining.filter(
      (words) => (history.get(comboKey(frame.id, words))?.attempt_count ?? 0) === 0,
    )
    const candidates = untried.length > 0 ? untried : remaining
    const selected = candidates[randomIndex(candidates.length, rng)]
    remaining.splice(remaining.indexOf(selected), 1)

    items.push({
      id: comboKey(frame.id, selected),
      frame,
      words: selected,
      promptJa: renderHint(frame, selected),
      answer: renderPattern(frame, selected),
    })
  }

  return items
}

function shuffled<T>(values: T[], rng: () => number): T[] {
  const result = [...values]
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = randomIndex(index + 1, rng)
    ;[result[index], result[swapIndex]] = [result[swapIndex], result[index]]
  }
  return result
}

export function buildPatternSession(params: {
  core: CoreVocab
  level: 1 | 2 | 3
  stats: FrameStats[]
  history: Map<string, { attempt_count: number }>
  rng?: () => number
  framesPerSession?: number
  itemsPerFrame?: number
}): PatternSession {
  const rng = params.rng ?? Math.random
  const framesPerSession = params.framesPerSession ?? 3
  const itemsPerFrame = params.itemsPerFrame ?? 4
  const statsByFrame = new Map(params.stats.map((stats) => [stats.frameId, stats]))
  const frames = params.core.frames
    .filter((frame) => frame.level <= params.level)
    .sort((left, right) => {
      const leftStats = statsByFrame.get(left.id)
      const rightStats = statsByFrame.get(right.id)
      return frameMastery(leftStats).accuracy - frameMastery(rightStats).accuracy
        || (leftStats?.attempts ?? 0) - (rightStats?.attempts ?? 0)
        || left.id.localeCompare(right.id)
    })
    .slice(0, framesPerSession)

  const itemsByFrame = frames.map((frame) => (
    buildFrameItems(frame, params.core, params.history, itemsPerFrame, rng)
  ))
  const items: PatternItem[] = []
  for (let itemIndex = 0; itemIndex < itemsPerFrame; itemIndex += 1) {
    itemsByFrame.forEach((frameItems) => {
      const item = frameItems[itemIndex]
      if (item) {
        items.push(item)
      }
    })
  }

  const secondRound = shuffled(items, rng)
  if (
    items.length > 1
    && secondRound[0].id === items[items.length - 1].id
  ) {
    const swapIndex = secondRound.findIndex((item) => item.id !== secondRound[0].id)
    ;[secondRound[0], secondRound[swapIndex]] = [secondRound[swapIndex], secondRound[0]]
  }

  return {
    frames,
    items,
    rounds: [items, secondRound],
  }
}
