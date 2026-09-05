import type { CoreVocab } from '../../content/coreSchema'
import type { VocabItemRow } from '../../services/supabase/types'
import { deal } from '../mixing/deal'
import { renderHint, renderPattern } from '../mixing/particles'
import type { LessonItem } from './types'

type MixingHistoryEntry = {
  attempt_count: number
  understood_count: number
}

export function buildCue(item: { category: string; hint_ja: string }): string {
  return item.category === 'toolbox'
    ? `「${item.hint_ja}」と言いたいとき`
    : `「${item.hint_ja}」を伝える`
}

function uniqueVocabRows(rows: VocabItemRow[], limit: number): VocabItemRow[] {
  const ids = new Set<string>()
  const unique: VocabItemRow[] = []
  for (const row of rows) {
    if (!ids.has(row.id)) {
      ids.add(row.id)
      unique.push(row)
    }
    if (unique.length >= limit) {
      break
    }
  }
  return unique
}

function vocabItemToLessonItem(row: VocabItemRow, kind: 'word' | 'prep'): LessonItem {
  return {
    id: `${kind === 'word' ? 'card' : 'prep'}:${row.id}`,
    kind,
    cueJa: buildCue({
      category: row.category ?? '',
      hint_ja: row.hint_ja ?? row.text,
    }),
    answer: row.text,
    vocabItemId: row.id,
  }
}

export function buildLessonItems(params: {
  dueCards: VocabItemRow[]
  core: CoreVocab
  mixingHistory: Map<string, MixingHistoryEntry>
  prepWords: VocabItemRow[]
  rng?: () => number
  maxItems?: number
}): LessonItem[] {
  const maxItems = params.maxItems ?? 12
  if (maxItems <= 0) {
    return []
  }

  const cardItems = uniqueVocabRows(params.dueCards, 8).map(
    (row) => vocabItemToLessonItem(row, 'word'),
  )

  const workingHistory = new Map(params.mixingHistory)
  const coreItems: LessonItem[] = []
  const coreKeys = new Set<string>()
  let avoidKey: string | undefined

  for (let index = 0; index < 3; index += 1) {
    const selected = deal({
      core: params.core,
      level: 2,
      history: workingHistory,
      rng: params.rng,
      avoidKey,
    })
    if (coreKeys.has(selected.key)) {
      break
    }

    coreKeys.add(selected.key)
    coreItems.push({
      id: `frame:${selected.key}`,
      kind: 'frame',
      cueJa: `「${renderHint(selected.frame, selected.words)}」と伝える`,
      answer: renderPattern(selected.frame, selected.words),
    })

    const current = workingHistory.get(selected.key)
    const highestUnderstood = Math.max(
      0,
      ...Array.from(workingHistory.values(), ({ understood_count }) => understood_count),
    )
    workingHistory.set(selected.key, {
      attempt_count: Math.max(1, current?.attempt_count ?? 0),
      understood_count: highestUnderstood + 1,
    })
    avoidKey = selected.key
  }

  const prepItems = uniqueVocabRows(params.prepWords, 2).map(
    (row) => vocabItemToLessonItem(row, 'prep'),
  )

  const ids = new Set<string>()
  return [...cardItems, ...coreItems, ...prepItems]
    .filter((item) => {
      if (ids.has(item.id)) {
        return false
      }
      ids.add(item.id)
      return true
    })
    .slice(0, maxItems)
}
