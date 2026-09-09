import { bestRank } from '../../content/frequencySchema'
import {
  questionsOfLevel,
  type TwoWordKind,
  type TwoWordLevel,
  type TwoWordQuestion,
  type TwoWordSet,
} from '../../content/twoWordSchema'
import type { TwoWordOrder } from '../../services/settings'

/**
 * 2 語で言う。日本語のお題を見て、25 動詞から選んで 2 語で言う。
 * 教材(英語 2 語トレ)の作法: 4 問を 45 秒で。冠詞と三単現は気にしない。解答は 1 つではない。
 * 3 語(主語を足す)、4 語(時や場所を足す)へ、同じ型のまま伸ばす。
 */
export const SET_SIZE = 4
export const SETS_PER_SESSION = 3
export const TARGET_SECONDS_PER_SET = 45
/** 直近この数の問題は避ける(12 問 × 2 回分)。 */
export const RECENT_TO_AVOID = 24
export const HISTORY_LIMIT = 30

export type TwoWordRound = { kind: TwoWordKind; questions: TwoWordQuestion[] }
export type TwoWordSession = { level: TwoWordLevel; order: TwoWordOrder; rounds: TwoWordRound[] }

/** その問題の順位。使う動詞のうち、いちばんよく使うものの順位。 */
export function questionRank(question: TwoWordQuestion): number {
  return bestRank(question.verbs)
}

function shuffle<T>(items: readonly T[], random: () => number): T[] {
  const copy = [...items]
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1))
    ;[copy[index], copy[swap]] = [copy[swap], copy[index]]
  }
  return copy
}

/**
 * 最近出した問題を避けて選ぶ。足りなければ、古く出したものから戻す。
 * 頻度順のときは混ぜずに、よく使う動詞の問題から順に出す。
 */
function pick(
  pool: readonly TwoWordQuestion[],
  count: number,
  recent: readonly string[],
  random: () => number,
  order: TwoWordOrder,
): TwoWordQuestion[] {
  const recentSet = new Set(recent)
  const notRecent = pool.filter((question) => !recentSet.has(question.id))
  const fresh = order === 'frequency'
    ? [...notRecent].sort((a, b) => questionRank(a) - questionRank(b) || a.id.localeCompare(b.id))
    : shuffle(notRecent, random)
  if (fresh.length >= count) {
    return fresh.slice(0, count)
  }
  const stale = pool
    .filter((question) => recentSet.has(question.id))
    .sort((a, b) => recent.indexOf(a.id) - recent.indexOf(b.id))
  return [...fresh, ...stale].slice(0, count)
}

export function buildTwoWordSession(params: {
  content: TwoWordSet
  level: TwoWordLevel
  /** 問題を出す順。既定は教材の順(混ぜて出す)。 */
  order?: TwoWordOrder
  recent?: readonly string[]
  random?: () => number
}): TwoWordSession {
  const random = params.random ?? Math.random
  const recent = params.recent ?? []
  const order = params.order ?? 'book'
  const questions = questionsOfLevel(params.content, params.level)
  const basic = questions.filter((question) => question.kind === 'basic')
  const scene = questions.filter((question) => question.kind === 'scene')

  // 場面設定(相手の発話に 2 語で返す)があれば、最後の 1 セットをそれにする
  const sceneRounds = scene.length >= SET_SIZE ? 1 : 0
  const basicRounds = SETS_PER_SESSION - sceneRounds
  const basicPicked = pick(basic, basicRounds * SET_SIZE, recent, random, order)
  if (basicPicked.length < basicRounds * SET_SIZE) {
    throw new Error(`${params.level} 語の問題が足りません(${basicPicked.length} 問)`)
  }

  const rounds: TwoWordRound[] = []
  for (let index = 0; index < basicRounds; index += 1) {
    rounds.push({ kind: 'basic', questions: basicPicked.slice(index * SET_SIZE, (index + 1) * SET_SIZE) })
  }
  if (sceneRounds === 1) {
    rounds.push({ kind: 'scene', questions: pick(scene, SET_SIZE, recent, random, order) })
  }
  return { level: params.level, order, rounds }
}

export type TwoWordResult = {
  at: string
  level: TwoWordLevel
  said: number
  total: number
  /** セットごとの秒数(ミリ秒)。 */
  roundMs: number[]
}

export type TwoWordStats = {
  version: 1
  /** 出した順(古い順)の問題 id。 */
  recent: string[]
  history: TwoWordResult[]
}

export function statsKey(lang: string): string {
  return `lla.twoword.${lang}`
}

function emptyStats(): TwoWordStats {
  return { version: 1, recent: [], history: [] }
}

function isResult(value: unknown): value is TwoWordResult {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const record = value as Record<string, unknown>
  return typeof record.at === 'string'
    && (record.level === 2 || record.level === 3 || record.level === 4)
    && typeof record.said === 'number'
    && typeof record.total === 'number'
    && Array.isArray(record.roundMs)
    && record.roundMs.every((ms) => typeof ms === 'number')
}

/** この端末に残した成績。読めなければ空(壊れた保存は console に出して捨てる)。 */
export function readTwoWordStats(lang: string): TwoWordStats {
  try {
    const raw = localStorage.getItem(statsKey(lang))
    if (!raw) {
      return emptyStats()
    }
    const parsed = JSON.parse(raw) as unknown
    if (
      typeof parsed !== 'object' || parsed === null
      || (parsed as TwoWordStats).version !== 1
      || !Array.isArray((parsed as TwoWordStats).recent)
      || !Array.isArray((parsed as TwoWordStats).history)
    ) {
      console.error('2 語で言うの成績の形が違うので捨てます', parsed)
      return emptyStats()
    }
    const stats = parsed as TwoWordStats
    return {
      version: 1,
      recent: stats.recent.filter((id): id is string => typeof id === 'string'),
      history: stats.history.filter(isResult),
    }
  } catch (error) {
    console.error('2 語で言うの成績を読めませんでした', error)
    return emptyStats()
  }
}

export function writeTwoWordStats(lang: string, stats: TwoWordStats): void {
  localStorage.setItem(statsKey(lang), JSON.stringify(stats))
}

export function appendResult(stats: TwoWordStats, result: TwoWordResult, questionIds: readonly string[]): TwoWordStats {
  return {
    version: 1,
    recent: [...stats.recent.filter((id) => !questionIds.includes(id)), ...questionIds].slice(-RECENT_TO_AVOID),
    history: [...stats.history, result].slice(-HISTORY_LIMIT),
  }
}

/** 1 回の結果が目標に届いたか: 言えた 8 割以上、どのセットも 45 秒以内。 */
export function reachedTarget(result: TwoWordResult): boolean {
  return result.total > 0
    && result.said / result.total >= 0.8
    && result.roundMs.length > 0
    && result.roundMs.every((ms) => ms <= TARGET_SECONDS_PER_SET * 1000)
}

/** 同じ語数で直近 2 回続けて目標に届いたら、次の語数をすすめる。 */
export function suggestNextLevel(history: readonly TwoWordResult[], level: TwoWordLevel): TwoWordLevel | null {
  if (level === 4) {
    return null
  }
  const recent = history.filter((result) => result.level === level).slice(-2)
  if (recent.length < 2 || !recent.every(reachedTarget)) {
    return null
  }
  return (level + 1) as TwoWordLevel
}

/** その語数での、セットの最短時間。 */
export function bestRoundMs(history: readonly TwoWordResult[], level: TwoWordLevel): number | null {
  const samples = history
    .filter((result) => result.level === level)
    .flatMap((result) => result.roundMs)
  return samples.length === 0 ? null : Math.min(...samples)
}
