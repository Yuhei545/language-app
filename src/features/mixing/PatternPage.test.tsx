import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PatternPage } from './PatternPage'

const usePatternSession = vi.hoisted(() => vi.fn())

vi.mock('./usePatternSession', () => ({ usePatternSession }))

const item = {
  id: 'frame|coffee',
  frame: { id: 'frame', level: 1 as const, pattern: 'Coffee, please.', slots: [], hint_ja: '' },
  words: [],
  promptJa: 'コーヒーをください',
  answer: 'Coffee, please.',
}

function session(overrides: Record<string, unknown> = {}) {
  return {
    phase: 'cue',
    level: 1,
    session: { frames: [], items: [item], rounds: [[item], [item]] },
    currentItem: item,
    roundIndex: 0,
    roundCount: 2,
    itemIndex: 0,
    itemCount: 4,
    hint: null,
    heardText: null,
    summary: null,
    error: null,
    start: vi.fn(),
    stopRecording: vi.fn(),
    retry: vi.fn(),
    next: vi.fn(),
    stop: vi.fn(),
    setLevel: vi.fn(),
    clearError: vi.fn(),
    ...overrides,
  }
}

beforeEach(() => {
  usePatternSession.mockReturnValue(session())
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('PatternPage', () => {
  it('日本語の合図と、何周目の何問目かを表示する', () => {
    render(<PatternPage lang="en" />)

    expect(screen.queryByText('こう伝えてください')).not.toBeNull()
    expect(screen.queryByText('コーヒーをください')).not.toBeNull()
    expect(screen.queryByText('1周目 ・ 1/4')).not.toBeNull()
  })

  it('外れたときはヒントを見せ、言い直せる', () => {
    usePatternSession.mockReturnValue(session({
      phase: 'hint',
      hint: { kind: 'missing', token: 'please', textJa: '「please」が抜けています。もう一度言ってみましょう' },
    }))

    render(<PatternPage lang="en" />)

    expect(screen.queryByText(/please.*もう一度言ってみましょう/)).not.toBeNull()
    expect(screen.queryByRole('button', { name: 'もう一度言う' })).not.toBeNull()
    expect(screen.queryByText(/間違|不正解/)).toBeNull()
  })

  it('2 回外れたら、聞こえた文と模範を文字で見せる', () => {
    usePatternSession.mockReturnValue(session({ phase: 'model', heardText: 'coffee' }))

    render(<PatternPage lang="en" />)

    expect(screen.queryByText('こう聞こえました')).not.toBeNull()
    expect(screen.queryByText('coffee')).not.toBeNull()
    expect(screen.queryByText('ひとつの言い方')).not.toBeNull()
    expect(screen.queryByText('Coffee, please.')).not.toBeNull()
    expect(screen.queryByRole('button', { name: '次へ' })).not.toBeNull()
  })

  it('録音中は止めるボタンを出す', () => {
    usePatternSession.mockReturnValue(session({ phase: 'recording' }))

    render(<PatternPage lang="en" />)

    expect(screen.queryByRole('button', { name: '■ 言い終わった' })).not.toBeNull()
  })

  it('まとめに一度で言えた数と、周ごとの応答時間を出す', () => {
    usePatternSession.mockReturnValue(session({
      phase: 'finished',
      currentItem: null,
      summary: {
        total: 8,
        firstTry: 7,
        withHint: 1,
        roundLatencyMs: [2200, 1400],
        nextLevel: 2,
      },
    }))

    render(<PatternPage lang="en" />)

    expect(screen.queryByText('2 周終わりました')).not.toBeNull()
    expect(screen.queryByText('7/8')).not.toBeNull()
    expect(screen.queryByText('2.2秒 → 1.4秒')).not.toBeNull()
    expect(screen.queryByText(/レベル 2 に上げてみましょう/)).not.toBeNull()
  })
})
