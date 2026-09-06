import { describe, expect, it } from 'vitest'
import { loadCore } from '../../content/coreSchema'
import type { MixingProgressRow } from '../../services/supabase/types'
import { comboKey } from './deal'
import { buildComboHistory, buildFrameStats, progressIdentity } from './progress'

function row(overrides: Partial<MixingProgressRow>): MixingProgressRow {
  return {
    user_id: 'user-1',
    lang: 'en',
    frame_id: 'en-could-i-get',
    verb_text: '',
    noun_text: 'the check',
    understood_count: 0,
    attempt_count: 0,
    first_try_count: 0,
    hint_count: 0,
    latency_ms_total: 0,
    latency_samples: 0,
    last_at: null,
    created_at: '2026-09-06T00:00:00.000Z',
    ...overrides,
  }
}

describe('progressIdentity', () => {
  it('型の中の動詞と名詞のスロットから識別子を作る', () => {
    const core = loadCore('en')
    const frame = core.frames.find((candidate) => candidate.id === 'en-going-verb-place-time')!
    const words = [
      core.verbs.find((word) => word.takes === 'place')!,
      core.nouns.find((word) => word.kind === 'place')!,
      core.nouns.find((word) => word.kind === 'time')!,
    ]

    expect(progressIdentity(frame, words)).toEqual({
      frameId: 'en-going-verb-place-time',
      verbText: words[0].text,
      nounText: words[1].text,
    })
  })

  it('動詞のスロットが無い型では動詞が空文字になる', () => {
    const core = loadCore('en')
    const frame = core.frames.find((candidate) => candidate.id === 'en-could-i-get')!
    const noun = core.nouns.find((word) => word.kind === 'thing')!

    expect(progressIdentity(frame, [noun])).toEqual({
      frameId: 'en-could-i-get',
      verbText: '',
      nounText: noun.text,
    })
  })
})

describe('buildComboHistory', () => {
  it('保存済みの行を、その型と語の組み合わせに結び付ける', () => {
    const core = loadCore('en')
    const noun = core.nouns.find((word) => word.kind === 'thing')!
    const history = buildComboHistory(core, [
      row({ frame_id: 'en-could-i-get', noun_text: noun.text, attempt_count: 3 }),
    ])

    expect(history.get(comboKey('en-could-i-get', [noun]))).toEqual({ attempt_count: 3 })
    expect(history.size).toBe(1)
  })
})

describe('buildFrameStats', () => {
  it('同じ型の行を足し合わせる', () => {
    const stats = buildFrameStats([
      row({ frame_id: 'f1', attempt_count: 4, first_try_count: 3, latency_ms_total: 8000, latency_samples: 4 }),
      row({ frame_id: 'f1', attempt_count: 2, first_try_count: 1, latency_ms_total: 5000, latency_samples: 2 }),
      row({ frame_id: 'f2', attempt_count: 1, first_try_count: 1, latency_ms_total: 1200, latency_samples: 1 }),
    ])

    expect(stats).toEqual([
      { frameId: 'f1', attempts: 6, firstTry: 4, latencyMsTotal: 13000, latencySamples: 6 },
      { frameId: 'f2', attempts: 1, firstTry: 1, latencyMsTotal: 1200, latencySamples: 1 },
    ])
  })
})
