import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PatternPage } from './PatternPage'

const usePatternSession = vi.hoisted(() => vi.fn())

vi.mock('./usePatternSession', () => ({ usePatternSession }))

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
    phase: 'starting',
    level: 1,
    session: { frames: [], items: [item], rounds: [[item], [item]] },
    currentItem: item,
    roundIndex: 0,
    roundCount: 2,
    itemIndex: 0,
    itemCount: 4,
    hint: null,
    heardText: null,
    matched: false,
    summary: null,
    sttEngine: 'webspeech',
    error: null,
    start: vi.fn(),
    beginItems: vi.fn(),
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

  it('言えても言えなくても、答えと聞こえた文を毎回見せる', () => {
    usePatternSession.mockReturnValue(session({ phase: 'model', heardText: 'coffee', matched: true }))

    render(<PatternPage lang="en" />)

    expect(screen.queryByText('言えました')).not.toBeNull()
    expect(screen.queryByText('こう聞こえました')).not.toBeNull()
    expect(screen.queryByText('coffee')).not.toBeNull()
    expect(screen.queryByText('答え')).not.toBeNull()
    expect(screen.queryByText('Coffee, please.')).not.toBeNull()
    expect(screen.queryByRole('button', { name: '答えを聞く' })).not.toBeNull()
    expect(screen.queryByText('この型をもう一度見る')).not.toBeNull()
    expect(screen.queryByRole('button', { name: '次へ' })).not.toBeNull()
  })

  it('言えなかったときも同じ画面で答えを見せる', () => {
    usePatternSession.mockReturnValue(session({ phase: 'model', heardText: 'coffee', matched: false }))

    render(<PatternPage lang="en" />)

    expect(screen.queryByText('ひとつの言い方を見てみましょう')).not.toBeNull()
    expect(screen.queryByText('Coffee, please.')).not.toBeNull()
    expect(screen.queryByText(/間違|不正解/)).toBeNull()
  })

  it('録音中は止めるボタンと、使っている音声入力を出す', () => {
    usePatternSession.mockReturnValue(session({ phase: 'recording' }))

    render(<PatternPage lang="en" />)

    expect(screen.queryByRole('button', { name: '■ 言い終わった' })).not.toBeNull()
    expect(screen.queryByText(/音声入力：ブラウザ/)).not.toBeNull()
  })

  it('Gemini を使っているときは、そう表示する', () => {
    usePatternSession.mockReturnValue(session({ phase: 'recording', sttEngine: 'gemini' }))

    render(<PatternPage lang="en" />)

    expect(screen.queryByText(/音声入力：Gemini/)).not.toBeNull()
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
