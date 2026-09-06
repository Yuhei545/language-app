import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PatternPage } from './PatternPage'

const usePatternSession = vi.hoisted(() => vi.fn())

vi.mock('./usePatternSession', () => ({ usePatternSession }))
vi.mock('../../services/speech', () => ({ speak: vi.fn(async () => undefined) }))

const item = {
  id: 'frame|coffee',
  frame: {
    id: 'frame',
    level: 1 as const,
    pattern: 'Could I get {noun:thing}?',
    slots: ['noun:thing'],
    hint_ja: '{1}をもらえますか',
    note_ja: 'お店で何かを頼むときの言い方です。',
    examples: [
      { text: 'Could I get the check?', ja: 'お会計をお願いします' },
      { text: 'Could I get a table for two?', ja: '2人席をお願いします' },
    ],
  },
  words: [],
  promptJa: 'コーヒーをください',
  answer: 'Coffee, please.',
}

function session(overrides: Record<string, unknown> = {}) {
  return {
    phase: 'thinking',
    level: 1,
    session: null,
    currentItem: item,
    roundIndex: 0,
    roundCount: 2,
    itemIndex: 0,
    itemCount: 4,
    secondsLeft: 3,
    summary: null,
    targets: [],
    error: null,
    start: vi.fn(),
    beginItems: vi.fn(),
    reveal: vi.fn(),
    judgeSelf: vi.fn(),
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

  it('型に入る前に、型・解説・例文を見せる', () => {
    usePatternSession.mockReturnValue(session({ phase: 'intro' }))

    render(<PatternPage lang="en" />)

    expect(screen.queryByText('これから使う型')).not.toBeNull()
    expect(screen.queryByText('Could I get {noun:thing}?')).not.toBeNull()
    expect(screen.queryByText('お店で何かを頼むときの言い方です。')).not.toBeNull()
    expect(screen.queryByText('Could I get the check?')).not.toBeNull()
    expect(screen.queryByRole('button', { name: 'Could I get the check? を聞く' })).not.toBeNull()
    expect(screen.queryByRole('button', { name: 'この型で練習する' })).not.toBeNull()
  })

  it('声に出す残り秒数と「答えを見る」を出す(録音はしない)', () => {
    render(<PatternPage lang="en" />)

    expect(screen.queryByText('あと 3 秒')).not.toBeNull()
    expect(screen.queryByRole('button', { name: '答えを見る' })).not.toBeNull()
    expect(screen.queryByText(/録音/)).toBeNull()
  })

  it('答えのあとに言えた/言えなかったを押せる', () => {
    usePatternSession.mockReturnValue(session({ phase: 'model' }))

    render(<PatternPage lang="en" />)

    expect(screen.queryByText('声に出せましたか?')).not.toBeNull()
    expect(screen.queryByText('Coffee, please.')).not.toBeNull()
    expect(screen.queryByRole('button', { name: '答えを聞く' })).not.toBeNull()
    expect(screen.queryByRole('button', { name: '言えた' })).not.toBeNull()
    expect(screen.queryByRole('button', { name: '言えなかった' })).not.toBeNull()
    expect(screen.queryByText('この型をもう一度見る')).not.toBeNull()
    expect(screen.queryByText(/間違|不正解/)).toBeNull()
  })

  it('まとめに言えた数を出す', () => {
    usePatternSession.mockReturnValue(session({
      phase: 'finished',
      currentItem: null,
      summary: { total: 8, said: 7, nextLevel: 2 },
    }))

    render(<PatternPage lang="en" />)

    expect(screen.queryByText('7/8')).not.toBeNull()
    expect(screen.queryByText(/レベル 2 に上げて/)).not.toBeNull()
  })
})
