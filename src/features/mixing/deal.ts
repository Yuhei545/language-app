import type { CoreFrame, CoreVocab, CoreWord } from '../../content/coreSchema'
import { slotPool } from './combinations'

export type Deal = {
  frame: CoreFrame
  words: CoreWord[]
  key: string
}

type HistoryEntry = {
  attempt_count: number
  understood_count: number
}

export function comboKey(frameId: string, words: CoreWord[]): string {
  return `${frameId}|${words.map((word) => word.text).join('|')}`
}

function expandWords(pools: CoreWord[][]): CoreWord[][] {
  return pools.reduce<CoreWord[][]>(
    (combinations, pool) => combinations.flatMap(
      (combination) => pool.map((word) => [...combination, word]),
    ),
    [[]],
  )
}

function buildCandidates(core: CoreVocab, level: 1 | 2 | 3): Deal[] {
  return core.frames
    .filter((frame) => frame.level <= level)
    .flatMap((frame) => {
      const pools = frame.slots.map((slot) => slotPool(core, slot))
      if (pools.some((pool) => pool.length === 0)) {
        return []
      }

      return expandWords(pools).map((words) => ({
        frame,
        words,
        key: comboKey(frame.id, words),
      }))
    })
}

function prioritizedCandidates(
  candidates: Deal[],
  history: Map<string, HistoryEntry>,
): Deal[] {
  const untried = candidates.filter(
    (candidate) => (history.get(candidate.key)?.attempt_count ?? 0) === 0,
  )
  if (untried.length > 0) {
    return untried
  }

  const lowestUnderstood = candidates.reduce(
    (lowest, candidate) => Math.min(
      lowest,
      history.get(candidate.key)?.understood_count ?? 0,
    ),
    Number.POSITIVE_INFINITY,
  )
  return candidates.filter(
    (candidate) => (history.get(candidate.key)?.understood_count ?? 0) === lowestUnderstood,
  )
}

function randomIndex(length: number, rng: () => number): number {
  const value = Math.min(Math.max(rng(), 0), 1 - Number.EPSILON)
  return Math.floor(value * length)
}

function drawCandidate(candidates: Deal[], rng: () => number): Deal {
  const byFrame = new Map<string, Deal[]>()
  candidates.forEach((candidate) => {
    const frameCandidates = byFrame.get(candidate.frame.id) ?? []
    frameCandidates.push(candidate)
    byFrame.set(candidate.frame.id, frameCandidates)
  })

  const frameGroups = [...byFrame.values()]
  const totalWeight = frameGroups.reduce(
    (total, group) => total + group[0].frame.level,
    0,
  )
  let frameDraw = Math.min(Math.max(rng(), 0), 1 - Number.EPSILON) * totalWeight
  let selectedGroup = frameGroups[frameGroups.length - 1]
  for (const group of frameGroups) {
    frameDraw -= group[0].frame.level
    if (frameDraw < 0) {
      selectedGroup = group
      break
    }
  }

  return selectedGroup[randomIndex(selectedGroup.length, rng)]
}

export function deal(params: {
  core: CoreVocab
  level: 1 | 2 | 3
  history: Map<string, HistoryEntry>
  rng?: () => number
  avoidKey?: string
}): Deal {
  const rng = params.rng ?? Math.random
  const allCandidates = buildCandidates(params.core, params.level)
  const candidates = prioritizedCandidates(allCandidates, params.history)
  if (candidates.length === 0) {
    throw new Error(`レベル${params.level}で配れる組み合わせがありません`)
  }

  let selected = drawCandidate(candidates, rng)
  for (let attempt = 0; attempt < 5 && selected.key === params.avoidKey; attempt += 1) {
    selected = drawCandidate(candidates, rng)
  }

  if (selected.key === params.avoidKey && allCandidates.length > 1) {
    const alternatives = prioritizedCandidates(
      allCandidates.filter((candidate) => candidate.key !== params.avoidKey),
      params.history,
    )
    if (alternatives.length > 0) {
      selected = drawCandidate(alternatives, rng)
    }
  }

  return selected
}
