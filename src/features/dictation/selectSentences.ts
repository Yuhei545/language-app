import type { DictationSentence } from '../../content/dictationSchema'
import type { DictationFeatureId } from '../../content/dictationFeatures'
import { isDue } from './schedule'

export type DictationSelectionProgress = {
  best_ratio: number
  attempts: number
  next_review_at?: string | null
}

export type FeatureAccuracy = {
  featureId: DictationFeatureId
  attempts: number
  correct: number
}

/** 苦手さ。まだ試していない現象は「やや苦手」として真ん中に置く。 */
function weakness(stats: Map<string, FeatureAccuracy>, featureId: DictationFeatureId): number {
  const stat = stats.get(featureId)
  if (!stat || stat.attempts === 0) {
    return 0.5
  }
  return 1 - stat.correct / stat.attempts
}

/** 文の苦手さ。含まれる現象のうち、いちばん苦手なもので測る。 */
function sentenceWeakness(
  sentence: DictationSentence,
  stats: Map<string, FeatureAccuracy>,
): number {
  if (sentence.features.length === 0) {
    return 0
  }
  return Math.max(...sentence.features.map((feature) => weakness(stats, feature.id)))
}

/**
 * 今日の文を選ぶ。
 * 1. 予定日が来た文(忘却曲線)を古い順に
 * 2. 足りなければ、まだ出していない文を「苦手な現象を含む順」に
 * 3. それでも足りなければ、正答率の低い順に
 */
export function selectSentences(
  all: DictationSentence[],
  progress: Map<string, DictationSelectionProgress>,
  count = 5,
  rng: () => number = Math.random,
  featureStats: FeatureAccuracy[] = [],
  now: Date = new Date(),
): DictationSentence[] {
  if (count <= 0) {
    return []
  }

  const seen = new Set<string>()
  const unique = all.filter((sentence) => {
    if (seen.has(sentence.id)) {
      return false
    }
    seen.add(sentence.id)
    return true
  })
  const stats = new Map(featureStats.map((stat) => [stat.featureId as string, stat]))

  const due: DictationSentence[] = []
  const fresh: DictationSentence[] = []
  const rest: DictationSentence[] = []

  for (const sentence of unique) {
    const row = progress.get(sentence.id)
    if (row === undefined) {
      fresh.push(sentence)
    } else if (isDue({ nextReviewAt: row.next_review_at ?? null }, now)) {
      due.push(sentence)
    } else {
      rest.push(sentence)
    }
  }

  const dueTime = (sentence: DictationSentence): number => {
    const at = progress.get(sentence.id)?.next_review_at
    if (!at) {
      return 0
    }
    const time = new Date(at).getTime()
    return Number.isNaN(time) ? 0 : time
  }

  due.sort((left, right) => dueTime(left) - dueTime(right) || rng() - 0.5)
  fresh.sort((left, right) => (
    sentenceWeakness(right, stats) - sentenceWeakness(left, stats) || rng() - 0.5
  ))
  rest.sort((left, right) => (
    (progress.get(left.id)?.best_ratio ?? 0) - (progress.get(right.id)?.best_ratio ?? 0)
    || rng() - 0.5
  ))

  return [...due, ...fresh, ...rest].slice(0, count)
}
