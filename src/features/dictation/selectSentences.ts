import type { DictationSentence } from '../../content/dictationSchema'

export type DictationSelectionProgress = {
  best_ratio: number
  attempts: number
}

export function selectSentences(
  all: DictationSentence[],
  progress: Map<string, DictationSelectionProgress>,
  count = 5,
  rng: () => number = Math.random,
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

  return unique
    .map((sentence, index) => {
      const row = progress.get(sentence.id)
      const group = row === undefined ? 1 : row.best_ratio < 0.9 ? 0 : 2
      return {
        sentence,
        index,
        group,
        ratio: row?.best_ratio ?? 0,
        tieBreaker: rng(),
      }
    })
    .sort((left, right) => (
      left.group - right.group
      || (left.group === 0 || left.group === 2 ? left.ratio - right.ratio : 0)
      || left.tieBreaker - right.tieBreaker
      || left.index - right.index
    ))
    .slice(0, count)
    .map(({ sentence }) => sentence)
}
