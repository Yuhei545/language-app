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

/**
 * 今日の狙い。狙いの型を先に、狙いの句動詞を載せられる型をその次に出す。
 * recentContexts は「その型で最近使った部品の組」(台帳の context)。同じ組を続けて出さないために使う。
 */
export type PatternTargets = {
  frameIds: readonly string[]
  phrasal: readonly string[]
  recentContexts: ReadonlyMap<string, readonly string[]>
}

/** 台帳に書く文脈。部品の組(型 id は含めない)。 */
export function comboContext(words: CoreWord[]): string {
  return words.map((word) => word.text).join('|')
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

function normalizePhrasal(text: string): string {
  return text.trim().toLowerCase()
}

function hasTargetPhrasal(frame: CoreFrame, core: CoreVocab, targetPhrasal: Set<string>): boolean {
  if (targetPhrasal.size === 0) {
    return false
  }
  return frame.slots.some((slot) => (
    slot.startsWith('phrasal:')
    && slotPool(core, slot).some((word) => targetPhrasal.has(normalizePhrasal(word.text)))
  ))
}

function buildFrameItems(
  frame: CoreFrame,
  core: CoreVocab,
  history: Map<string, { attempt_count: number }>,
  count: number,
  rng: () => number,
  targets?: PatternTargets,
): PatternItem[] {
  const pools = frame.slots.map((slot) => slotPool(core, slot))
  if (pools.some((pool) => pool.length === 0)) {
    throw new Error(`フレーム ${frame.id} に使える単語がありません`)
  }

  const remaining = expandWords(pools)
  // 語が少ない型(韓国語の人称など)は組み合わせが count に満たない。落とさず、ある分だけ出す。
  const target = Math.min(count, remaining.length)
  const targetPhrasal = new Set((targets?.phrasal ?? []).map(normalizePhrasal))
  const recent = new Set(targets?.recentContexts.get(`frame:${frame.id}`) ?? [])
  // 狙いの句動詞は、その型の半分まで(同じ句動詞ばかりにしない)
  const phrasalQuota = Math.ceil(target / 2)
  let phrasalUsed = 0

  const items: PatternItem[] = []
  while (items.length < target) {
    const containsTargetPhrasal = (words: CoreWord[]) => (
      words.some((word) => targetPhrasal.has(normalizePhrasal(word.text)))
    )
    const tiers: Array<(words: CoreWord[]) => boolean> = [
      // 上限までは狙いの句動詞を含む組、超えたら含まない組(他の句動詞にも触れる)
      (words) => (phrasalUsed < phrasalQuota ? containsTargetPhrasal(words) : !containsTargetPhrasal(words)),
      (words) => !recent.has(comboContext(words)),
      (words) => (history.get(comboKey(frame.id, words))?.attempt_count ?? 0) === 0,
    ]
    let candidates = remaining
    for (const tier of tiers) {
      const narrowed = candidates.filter(tier)
      if (narrowed.length > 0) {
        candidates = narrowed
      }
    }
    const selected = candidates[randomIndex(candidates.length, rng)]
    remaining.splice(remaining.indexOf(selected), 1)
    if (containsTargetPhrasal(selected)) {
      phrasalUsed += 1
    }

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
  targets?: PatternTargets
}): PatternSession {
  const rng = params.rng ?? Math.random
  const framesPerSession = params.framesPerSession ?? 3
  const itemsPerFrame = params.itemsPerFrame ?? 4
  const statsByFrame = new Map(params.stats.map((stats) => [stats.frameId, stats]))
  const targetFrameRank = new Map((params.targets?.frameIds ?? []).map((id, index) => [id, index]))
  const targetPhrasal = new Set((params.targets?.phrasal ?? []).map(normalizePhrasal))

  // 狙いの型 → 狙いの句動詞を載せられる型 → 苦手な型(従来どおり)
  const priority = (frame: CoreFrame): number => {
    if (targetFrameRank.has(frame.id)) {
      return 0
    }
    return hasTargetPhrasal(frame, params.core, targetPhrasal) ? 1 : 2
  }

  const frames = params.core.frames
    .filter((frame) => frame.level <= params.level)
    .sort((left, right) => {
      const leftPriority = priority(left)
      const rightPriority = priority(right)
      if (leftPriority !== rightPriority) {
        return leftPriority - rightPriority
      }
      if (leftPriority === 0) {
        return (targetFrameRank.get(left.id) ?? 0) - (targetFrameRank.get(right.id) ?? 0)
      }
      const leftStats = statsByFrame.get(left.id)
      const rightStats = statsByFrame.get(right.id)
      return frameMastery(leftStats).accuracy - frameMastery(rightStats).accuracy
        || (leftStats?.attempts ?? 0) - (rightStats?.attempts ?? 0)
        || left.id.localeCompare(right.id)
    })
    .slice(0, framesPerSession)

  const itemsByFrame = frames.map((frame) => (
    buildFrameItems(frame, params.core, params.history, itemsPerFrame, rng, params.targets)
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
