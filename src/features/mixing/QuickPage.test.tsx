import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { QuickPage } from './QuickPage'

const useQuickSession = vi.hoisted(() => vi.fn())

vi.mock('./useQuickSession', () => ({
  useQuickSession,
  QUICK_ROUNDS: 3,
  QUICK_TARGET_SECONDS: [3, 2, 1.5],
}))

const questions = [
  { q: 'Where are you going this weekend?', ja: '今週末はどこへ行きますか?' },
  { q: 'What do you usually eat for breakfast?', ja: '朝はたいてい何を食べますか?' },
]

function session(overrides: Record<string, unknown> = {}) {
  return {
    phase: 'cue',
    questions,
    current: questions[0],
    roundIndex: 0,
    index: 0,
    targetSeconds: 3,
    summary: null,
    error: null,
    start: vi.fn(),
    stopRecording: vi.fn(),
    stop: vi.fn(),
    clearError: vi.fn(),
    ...overrides,
  }
}

beforeEach(() => {
  useQuickSession.mockReturnValue(session())
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('QuickPage', () => {
  it('質問と日本語訳、目標の秒数を表示する', () => {
    render(<QuickPage lang="en" />)

    expect(screen.queryByText('Where are you going this weekend?')).not.toBeNull()
    expect(screen.queryByText('今週末はどこへ行きますか?')).not.toBeNull()
    expect(screen.queryByText(/目標 3秒/)).not.toBeNull()
  })

  it('録音中は答え終わったボタンを出す', () => {
    useQuickSession.mockReturnValue(session({ phase: 'recording' }))

    render(<QuickPage lang="en" />)

    expect(screen.queryByRole('button', { name: '■ 答え終わった' })).not.toBeNull()
  })

  it('まとめに周ごとの応答時間と、より自然な言い方を出す', () => {
    useQuickSession.mockReturnValue(session({
      phase: 'finished',
      current: null,
      summary: {
        roundLatencyMs: [2400, 1800, 1300],
        understood: 5,
        total: 6,
        judgments: [
          { understood: true, better: 'I am going to the station.' },
          { understood: true, better: '' },
        ],
        answers: [
          { round: 0, index: 0, heardText: 'I go station', latencyMs: 2400 },
          { round: 0, index: 1, heardText: 'Bread and coffee', latencyMs: 1800 },
        ],
      },
    }))

    render(<QuickPage lang="en" />)

    expect(screen.queryByText('3 周終わりました')).not.toBeNull()
    expect(screen.queryByText('2.4秒 → 1.8秒 → 1.3秒')).not.toBeNull()
    expect(screen.queryByText('伝わった 5/6')).not.toBeNull()
    expect(screen.queryByText(/I am going to the station/)).not.toBeNull()
    expect(screen.queryByText(/間違|不正解/)).toBeNull()
  })
})
