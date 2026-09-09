import type { ChunkEncounterSummaryRow } from '../../services/supabase/types'

/**
 * チャンクの台帳。出会い(seen)と、自分で言えた(said)を数え、
 * 「身についた」= 出会い 8 回以上・言えた 3 回以上・文脈 2 種以上 で判定する。
 * 根拠: 語彙は 6〜10 回の出会いが必要で、違う文脈での出会いが意味の想起を助ける。
 *
 * 生の行は日に 100 行ほど増えるので、集計は DB のビュー(chunk_encounter_summary)で行い、
 * クライアントは summaryFromView で受け取る。summarizeEncounters はテストと、
 * 直近だけを取ったときの集計に使う。
 */
export type EncounterKind = 'seen' | 'said'
export type EncounterMode =
  | 'cards'
  | 'pattern'
  | 'dictation'
  | 'lesson'
  | 'quick'
  | 'topic'
  | 'chatgpt'
  | 'replay'
  /** ピースをつなぐ(ピースにかたまりをはめる・ピースに文をつなぐ)。 */
  | 'pieces'

export type EncounterEntry = {
  chunkKey: string
  mode: EncounterMode
  kind: EncounterKind
  /** 型なら部品の組、レッスンなら台詞など。文脈の違いを数えるのに使う。 */
  context?: string
}

export type EncounterRecord = {
  chunk_key: string
  mode: string
  kind: string
  context: string
  at: string
}

export type ChunkCounts = {
  /** 出会いの総数(言えた回も含む)。 */
  seen: number
  /** 自分で言えた回数。 */
  said: number
  /** 文脈の種類(モード + 文脈)。 */
  contexts: number
}

export type ChunkSummary = ChunkCounts & {
  lastAt: number | null
  /** 1 週間前の時点での数。「今週身についた」の判定に使う。 */
  before: ChunkCounts
}

export const ACQUIRED = { seen: 8, said: 3, contexts: 2 } as const
export const WEEK_MS = 7 * 24 * 60 * 60 * 1000

function contextKey(row: Pick<EncounterRecord, 'mode' | 'context'>): string {
  return `${row.mode}|${row.context}`
}

/**
 * 生の行から集計する。cutoff(ミリ秒)を渡すと、それより前の出会いを before に数える。
 * 省略時は before は 0(すべてが最近の出会い)。
 */
export function summarizeEncounters(rows: EncounterRecord[], cutoff?: number): Map<string, ChunkSummary> {
  const working = new Map<string, {
    summary: ChunkSummary
    contexts: Set<string>
    contextsBefore: Set<string>
  }>()

  for (const row of rows) {
    const entry = working.get(row.chunk_key) ?? {
      summary: { seen: 0, said: 0, contexts: 0, lastAt: null, before: { seen: 0, said: 0, contexts: 0 } },
      contexts: new Set<string>(),
      contextsBefore: new Set<string>(),
    }
    const at = new Date(row.at).getTime()
    const isSaid = row.kind === 'said'

    entry.summary.seen += 1
    if (isSaid) {
      entry.summary.said += 1
    }
    entry.contexts.add(contextKey(row))
    if (Number.isFinite(at)) {
      if (entry.summary.lastAt === null || at > entry.summary.lastAt) {
        entry.summary.lastAt = at
      }
      if (cutoff !== undefined && at < cutoff) {
        entry.summary.before.seen += 1
        if (isSaid) {
          entry.summary.before.said += 1
        }
        entry.contextsBefore.add(contextKey(row))
      }
    }
    working.set(row.chunk_key, entry)
  }

  const summaries = new Map<string, ChunkSummary>()
  working.forEach((entry, key) => {
    entry.summary.contexts = entry.contexts.size
    entry.summary.before.contexts = entry.contextsBefore.size
    summaries.set(key, entry.summary)
  })
  return summaries
}

/** DB のビュー(全期間の集計)から作る。 */
export function summaryFromView(rows: ChunkEncounterSummaryRow[]): Map<string, ChunkSummary> {
  const summaries = new Map<string, ChunkSummary>()
  for (const row of rows) {
    const lastAt = new Date(row.last_at).getTime()
    summaries.set(row.chunk_key, {
      seen: row.seen,
      said: row.said,
      contexts: row.contexts,
      lastAt: Number.isFinite(lastAt) ? lastAt : null,
      before: { seen: row.seen_before, said: row.said_before, contexts: row.contexts_before },
    })
  }
  return summaries
}

export function meetsAcquired(counts: ChunkCounts): boolean {
  return counts.seen >= ACQUIRED.seen
    && counts.said >= ACQUIRED.said
    && counts.contexts >= ACQUIRED.contexts
}

export function isAcquired(summary: ChunkSummary | undefined): boolean {
  return summary !== undefined && meetsAcquired(summary)
}

/** 今は身についていて、1 週間前の時点ではまだだった。 */
export function isNewlyAcquired(summary: ChunkSummary | undefined): boolean {
  return summary !== undefined && meetsAcquired(summary) && !meetsAcquired(summary.before)
}

/** 身についたチャンクの数と、この 1 週間で身についた数。 */
export function countAcquired(summaries: Map<string, ChunkSummary>): { total: number; recent: number } {
  let total = 0
  let recent = 0
  summaries.forEach((summary) => {
    if (!meetsAcquired(summary)) {
      return
    }
    total += 1
    if (!meetsAcquired(summary.before)) {
      recent += 1
    }
  })
  return { total, recent }
}

/** そのチャンクを最近どの文脈で練習したか(新しい順)。型を回すで同じ組を避けるのに使う。 */
export function recentContexts(
  rows: EncounterRecord[],
  chunkKey: string,
  mode: EncounterMode,
  limit = 3,
): string[] {
  return rows
    .filter((row) => row.chunk_key === chunkKey && row.mode === mode && row.context.length > 0)
    .sort((left, right) => new Date(right.at).getTime() - new Date(left.at).getTime())
    .map((row) => row.context)
    .filter((context, index, all) => all.indexOf(context) === index)
    .slice(0, limit)
}
