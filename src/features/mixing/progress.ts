import type { CoreFrame, CoreVocab, CoreWord } from '../../content/coreSchema'
import type { MixingProgressRow } from '../../services/supabase/types'
import { slotPool } from './combinations'
import { comboKey } from './deal'
import type { FrameStats } from './patternSession'

export type ProgressIdentity = {
  frameId: string
  verbText: string
  nounText: string
}

/**
 * mixing_progress の主キーに使う識別子。
 * 型と、その中の動詞(または句動詞)・名詞の組で 1 行にまとめる。
 * 該当するスロットが無い型では空文字になる(テーブルの既定値と同じ)。
 */
export function progressIdentity(frame: CoreFrame, words: CoreWord[]): ProgressIdentity {
  const verbIndex = frame.slots.findIndex(
    (slot) => slot.startsWith('verb:') || slot.startsWith('phrasal:'),
  )
  const nounIndex = frame.slots.findIndex((slot) => slot.startsWith('noun:'))

  return {
    frameId: frame.id,
    verbText: verbIndex >= 0 ? words[verbIndex]?.text ?? '' : '',
    nounText: nounIndex >= 0 ? words[nounIndex]?.text ?? '' : '',
  }
}

export function identityKey(identity: ProgressIdentity): string {
  return JSON.stringify([identity.frameId, identity.verbText, identity.nounText])
}

export function rowKey(row: MixingProgressRow): string {
  return identityKey({
    frameId: row.frame_id,
    verbText: row.verb_text,
    nounText: row.noun_text,
  })
}

function expandWords(pools: CoreWord[][]): CoreWord[][] {
  return pools.reduce<CoreWord[][]>(
    (combinations, pool) => combinations.flatMap(
      (combination) => pool.map((word) => [...combination, word]),
    ),
    [[]],
  )
}

/** 組み合わせごとの挑戦回数。buildPatternSession が未経験の組を優先するのに使う。 */
export function buildComboHistory(
  core: CoreVocab,
  rows: MixingProgressRow[],
): Map<string, { attempt_count: number }> {
  const rowsByIdentity = new Map(rows.map((row) => [rowKey(row), row]))
  const history = new Map<string, { attempt_count: number }>()

  core.frames.forEach((frame) => {
    const pools = frame.slots.map((slot) => slotPool(core, slot))
    if (pools.some((pool) => pool.length === 0)) {
      return
    }

    expandWords(pools).forEach((words) => {
      const row = rowsByIdentity.get(identityKey(progressIdentity(frame, words)))
      if (row) {
        history.set(comboKey(frame.id, words), { attempt_count: row.attempt_count })
      }
    })
  })

  return history
}

/** 型ごとの成績。習熟の判定と、次に回す型の選び方に使う。 */
export function buildFrameStats(rows: MixingProgressRow[]): FrameStats[] {
  const byFrame = new Map<string, FrameStats>()

  rows.forEach((row) => {
    const current = byFrame.get(row.frame_id) ?? {
      frameId: row.frame_id,
      attempts: 0,
      firstTry: 0,
      latencyMsTotal: 0,
      latencySamples: 0,
    }

    byFrame.set(row.frame_id, {
      frameId: row.frame_id,
      attempts: current.attempts + row.attempt_count,
      firstTry: current.firstTry + row.first_try_count,
      latencyMsTotal: current.latencyMsTotal + row.latency_ms_total,
      latencySamples: current.latencySamples + row.latency_samples,
    })
  })

  return [...byFrame.values()]
}
