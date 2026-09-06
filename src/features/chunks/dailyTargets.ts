import { ACQUIRED, isAcquired, type ChunkSummary } from './ledger'
import type { Chunk, ChunkKind } from './registry'

export type TargetQuota = {
  total: number
  frame: number
  phrasal: number
  expression: number
}

/** 英語は 8 個(型 3・句動詞 2・表現 2 以上)。韓国語はチャンクが少ないので 4 個。 */
export const QUOTAS: Record<'en' | 'ko', TargetQuota> = {
  en: { total: 8, frame: 3, phrasal: 2, expression: 2 },
  ko: { total: 4, frame: 2, phrasal: 0, expression: 2 },
}

/** 一度も出ていない新しいチャンクは、全体のこの割合まで(新規を入れすぎない)。 */
export const NEW_SHARE = 0.25
const DAY_MS = 24 * 60 * 60 * 1000

type Scored = {
  chunk: Chunk
  seen: number
  saidRatio: number
  /** 最後の出会いから 1 日以上たっているか。 */
  rested: boolean
  tie: number
}

function score(chunk: Chunk, summary: ChunkSummary | undefined, now: number, rng: () => number): Scored {
  const seen = summary?.seen ?? 0
  const said = summary?.said ?? 0
  return {
    chunk,
    seen,
    saidRatio: seen === 0 ? 0 : said / seen,
    rested: summary?.lastAt === null || summary === undefined || now - summary.lastAt >= DAY_MS,
    tie: rng(),
  }
}

/** 優先: 出会いが少ない → 言えた率が低い → 1 日以上あいている → ランダム。 */
function compare(left: Scored, right: Scored): number {
  return left.seen - right.seen
    || left.saidRatio - right.saidRatio
    || Number(right.rested) - Number(left.rested)
    || left.tie - right.tie
}

/**
 * 今日の狙いを選ぶ。身についたものは外し、種類ごとの枠を満たしてから残りを埋める。
 * 出会い 0 のものは全体の 1/4 まで(他が足りないときはその限りでない)。
 */
export function selectDailyTargets(params: {
  registry: Chunk[]
  summaries: Map<string, ChunkSummary>
  lang: 'en' | 'ko'
  now?: number
  rng?: () => number
  quota?: TargetQuota
}): Chunk[] {
  const quota = params.quota ?? QUOTAS[params.lang]
  const now = params.now ?? Date.now()
  const rng = params.rng ?? Math.random

  const candidates = params.registry
    .filter((chunk) => !isAcquired(params.summaries.get(chunk.key)))
    .map((chunk) => score(chunk, params.summaries.get(chunk.key), now, rng))
    .sort(compare)

  const newCap = Math.max(1, Math.floor(quota.total * NEW_SHARE))
  const chosen: Scored[] = []
  const chosenKeys = new Set<string>()
  let newCount = 0

  const take = (candidate: Scored, allowExtraNew = false): boolean => {
    if (chosenKeys.has(candidate.chunk.key)) {
      return false
    }
    if (candidate.seen === 0 && newCount >= newCap && !allowExtraNew) {
      return false
    }
    chosen.push(candidate)
    chosenKeys.add(candidate.chunk.key)
    if (candidate.seen === 0) {
      newCount += 1
    }
    return true
  }

  // 1. 種類ごとの枠
  const kinds: ChunkKind[] = ['frame', 'phrasal', 'expression']
  for (const kind of kinds) {
    let taken = 0
    for (const candidate of candidates) {
      if (taken >= quota[kind]) {
        break
      }
      if (candidate.chunk.kind === kind && take(candidate)) {
        taken += 1
      }
    }
  }

  // 2. 残りは種類を問わず優先順に
  for (const candidate of candidates) {
    if (chosen.length >= quota.total) {
      break
    }
    take(candidate)
  }

  // 3. それでも足りなければ、新規の上限を外して埋める
  for (const candidate of candidates) {
    if (chosen.length >= quota.total) {
      break
    }
    take(candidate, true)
  }

  return chosen.slice(0, quota.total).map((item) => item.chunk)
}

/** 狙いの進み具合。出会い n/8 の表示に使う。 */
export function targetProgress(summary: ChunkSummary | undefined): { seen: number; said: number; goal: number } {
  return { seen: summary?.seen ?? 0, said: summary?.said ?? 0, goal: ACQUIRED.seen }
}
