export type Grade = 'again' | 'hard' | 'good'

export type SrsState = {
  status: 'new' | 'learning' | 'known'
  correct_count: number
  next_review_at: string | null
  /** 今日すでに見たカードを狙いとして出し直さないために使う(省略可)。 */
  last_reviewed_at?: string | null
}

export type SelectDueCardsOptions = {
  /** 今日の狙いのカード。期限前でも、期限切れの次に出す(今日すでに見たものは除く)。順番はこのまま。 */
  prioritizeIds?: readonly string[]
}

export const INTERVALS_DAYS = [1, 3, 7, 14, 30] as const

const DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1000

function reviewDate(now: Date, days: number): string {
  return new Date(now.getTime() + days * DAY_IN_MILLISECONDS).toISOString()
}

export function nextSrsState(current: SrsState, grade: Grade, now: Date): SrsState {
  if (grade === 'again') {
    return {
      status: 'learning',
      correct_count: 0,
      next_review_at: reviewDate(now, 1),
    }
  }

  if (grade === 'hard') {
    const currentInterval = INTERVALS_DAYS[
      Math.min(current.correct_count, INTERVALS_DAYS.length - 1)
    ]
    const nextInterval = Math.max(1, currentInterval / 2)

    return {
      status: 'learning',
      correct_count: current.correct_count,
      next_review_at: reviewDate(now, nextInterval),
    }
  }

  const nextCorrectCount = current.correct_count + 1
  const interval = INTERVALS_DAYS[Math.min(current.correct_count, INTERVALS_DAYS.length - 1)]

  return {
    status: nextCorrectCount >= 5 ? 'known' : 'learning',
    correct_count: nextCorrectCount,
    next_review_at: reviewDate(now, interval),
  }
}

function isSameLocalDay(iso: string, now: Date): boolean {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) {
    return false
  }
  return date.getFullYear() === now.getFullYear()
    && date.getMonth() === now.getMonth()
    && date.getDate() === now.getDate()
}

function compareIds(a: string, b: string): number {
  if (a === b) {
    return 0
  }

  return a < b ? -1 : 1
}

export function selectDueCards<T extends { id: string }>(
  items: T[],
  progress: Map<string, SrsState>,
  now: Date,
  limit: number,
  opts: SelectDueCardsOptions = {},
): T[] {
  if (limit <= 0) {
    return []
  }

  const overdue = items
    .flatMap((item) => {
      const state = progress.get(item.id)
      if (!state?.next_review_at) {
        return []
      }

      const reviewTime = Date.parse(state.next_review_at)
      if (!Number.isFinite(reviewTime) || reviewTime > now.getTime()) {
        return []
      }

      return [{ item, reviewTime }]
    })
    .sort((a, b) => a.reviewTime - b.reviewTime || compareIds(a.item.id, b.item.id))
    .map(({ item }) => item)

  const overdueIds = new Set(overdue.map((item) => item.id))
  const byId = new Map(items.map((item) => [item.id, item]))
  const prioritized = (opts.prioritizeIds ?? []).flatMap((id) => {
    const item = byId.get(id)
    if (!item || overdueIds.has(id)) {
      return []
    }
    const state = progress.get(id)
    if (state?.last_reviewed_at && isSameLocalDay(state.last_reviewed_at, now)) {
      return []
    }
    return [item]
  })
  const prioritizedIds = new Set(prioritized.map((item) => item.id))

  const newItems = items
    .filter((item) => !progress.has(item.id) && !prioritizedIds.has(item.id))
    .sort((a, b) => compareIds(a.id, b.id))

  return [...overdue, ...prioritized, ...newItems].slice(0, limit)
}
