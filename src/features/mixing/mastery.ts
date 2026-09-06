import type { CoreFrame } from '../../content/coreSchema'
import type { FrameStats } from './patternSession'

export const MASTERY = {
  minAttempts: 8,
  accuracy: 0.85,
  latencyMs: 2500,
} as const

export function frameMastery(stats: FrameStats | undefined): {
  accuracy: number
  avgLatencyMs: number | null
  mastered: boolean
} {
  const attempts = stats?.attempts ?? 0
  const accuracy = attempts === 0 ? 0 : (stats?.firstTry ?? 0) / attempts
  const latencySamples = stats?.latencySamples ?? 0
  const avgLatencyMs = latencySamples === 0
    ? null
    : (stats?.latencyMsTotal ?? 0) / latencySamples

  return {
    accuracy,
    avgLatencyMs,
    mastered: attempts >= MASTERY.minAttempts
      && accuracy >= MASTERY.accuracy
      && avgLatencyMs !== null
      && avgLatencyMs <= MASTERY.latencyMs,
  }
}

export function suggestLevel(
  current: 1 | 2 | 3,
  frames: CoreFrame[],
  stats: FrameStats[],
): 1 | 2 | 3 {
  const statsByFrame = new Map(stats.map((item) => [item.frameId, item]))
  const allMastered = frames
    .filter((frame) => frame.level <= current)
    .every((frame) => frameMastery(statsByFrame.get(frame.id)).mastered)

  return allMastered && current < 3 ? (current + 1) as 2 | 3 : current
}
