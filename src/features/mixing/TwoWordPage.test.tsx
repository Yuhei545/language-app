import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TwoWordPage } from './TwoWordPage'

const useTwoWordSession = vi.hoisted(() => vi.fn())

vi.mock('./useTwoWordSession', () => ({ useTwoWordSession }))

const question = {
  id: 'tw-001',
  level: 2 as const,
  kind: 'basic' as const,
  verbs: ['keep'],
  ja: 'お釣りを取っておく',
  answers: ['keep (the) change'],
}

function session(overrides: Record<string, unknown> = {}) {
  return {
    supported: true,
    verbs: [{ text: 'keep', ja: '保つ', group: 'action' }],
    phase: 'idle',
    level: 2,
    session: null,
    round: { kind: 'basic', questions: [question] },
    roundIndex: 0,
    roundCount: 3,
    questionIndex: 0,
    current: question,
    elapsedMs: 12000,
    roundMs: [],
    marks: { 'tw-001': true },
    summary: null,
    error: null,
    start: vi.fn(),
    next: vi.fn(),
    toggleSaid: vi.fn(),
    nextRound: vi.fn(),
    say: vi.fn(),
    stop: vi.fn(),
    setLevel: vi.fn(),
    clearError: vi.fn(),
    ...overrides,
  }
}

afterEach(cleanup)

describe('TwoWordPage', () => {
  it('はじめる前に語数と動詞を見せる', () => {
    const current = session()
    useTwoWordSession.mockReturnValue(current)
    render(<TwoWordPage lang="en" />)

    expect(screen.queryByRole('heading', { name: '2 語で言う' })).not.toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '3 語' }))
    expect(current.setLevel).toHaveBeenCalledWith(3)
    fireEvent.click(screen.getByRole('button', { name: 'はじめる' }))
    expect(current.start).toHaveBeenCalled()
  })

  it('お題の間は答えを出さず、「言った」で次へ', () => {
    const current = session({ phase: 'asking' })
    useTwoWordSession.mockReturnValue(current)
    render(<TwoWordPage lang="en" />)

    expect(screen.queryByText('お釣りを取っておく')).not.toBeNull()
    expect(screen.queryByText(/keep/)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '言った' }))
    expect(current.next).toHaveBeenCalled()
  })

  it('答え合わせでは括弧を薄く見せ、言えたを直せる', () => {
    const current = session({ phase: 'checking' })
    useTwoWordSession.mockReturnValue(current)
    render(<TwoWordPage lang="en" />)

    expect(screen.queryByText('(the)')).not.toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '言えた' }))
    expect(current.toggleSaid).toHaveBeenCalledWith('tw-001')
    fireEvent.click(screen.getByRole('button', { name: '次のセットへ' }))
    expect(current.nextRound).toHaveBeenCalled()
  })

  it('結果で次の語数をすすめる', () => {
    useTwoWordSession.mockReturnValue(session({
      phase: 'finished',
      summary: { said: 11, total: 12, roundMs: [30000, 40000, 42000], reached: true, bestMs: 30000, nextLevel: 3 },
    }))
    render(<TwoWordPage lang="en" />)

    expect(screen.queryByText('11/12')).not.toBeNull()
    expect(screen.queryByText(/3 語に上げてみましょう/)).not.toBeNull()
  })

  it('韓国語ではまだ使えないことを伝える', () => {
    useTwoWordSession.mockReturnValue(session({ supported: false }))
    render(<TwoWordPage lang="ko" />)
    expect(screen.queryByText(/韓国語は後で足します/)).not.toBeNull()
  })
})
