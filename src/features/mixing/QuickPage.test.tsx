import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { QuickPage } from './QuickPage'

const useQuickSession = vi.hoisted(() => vi.fn())

vi.mock('./useQuickSession', () => ({ useQuickSession, QUICK_ROUNDS: 3 }))

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
    answered: vi.fn(),
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

  it('質問のあとは「答えた」ボタンを出す(録音はしない)', () => {
    useQuickSession.mockReturnValue(session({ phase: 'answering' }))

    render(<QuickPage lang="en" />)

    expect(screen.queryByRole('button', { name: '答えた' })).not.toBeNull()
    expect(screen.queryByText(/録音/)).toBeNull()
  })

  it('まとめは周ごとの応答時間を出す', () => {
    useQuickSession.mockReturnValue(session({
      phase: 'finished',
      current: null,
      summary: { roundLatencyMs: [2400, 1800, 1300], answers: [] },
    }))

    render(<QuickPage lang="en" />)

    expect(screen.queryByText('2.4秒 → 1.8秒 → 1.3秒')).not.toBeNull()
    expect(screen.queryByText(/口が慣れてきた印/)).not.toBeNull()
  })
})
