import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TopicPage } from './TopicPage'

const useTopicSession = vi.hoisted(() => vi.fn())

vi.mock('./useTopicSession', () => ({ useTopicSession }))

const turn = {
  promptJa: '今週末の予定を 2 文で言ってください',
  prompt: '',
  heardText: 'I go Asakusa weekend.',
  result: {
    understood: true,
    recast: 'I am going to Asakusa this weekend.',
    ja: '今週末は浅草に行きます',
    follow_up: 'Who are you going with?',
    follow_up_ja: '誰と行きますか?',
  },
}

function session(overrides: Record<string, unknown> = {}) {
  return {
    phase: 'idle',
    topicJa: null,
    turns: [],
    currentPromptJa: null,
    error: null,
    startRecording: vi.fn(),
    stopRecording: vi.fn(),
    cancelChecking: vi.fn(),
    reset: vi.fn(),
    speakText: vi.fn(),
    clearError: vi.fn(),
    ...overrides,
  }
}

beforeEach(() => {
  useTopicSession.mockReturnValue(session())
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('TopicPage', () => {
  it('はじめる前はお題をもらうボタンを出す', () => {
    render(<TopicPage lang="en" />)

    expect(screen.queryByRole('heading', { name: 'お題で言う' })).not.toBeNull()
    expect(screen.queryByRole('button', { name: 'お題をもらう' })).not.toBeNull()
  })

  it('お題を表示する', () => {
    useTopicSession.mockReturnValue(session({
      currentPromptJa: '今週末の予定を 2 文で言ってください',
      topicJa: '今週末の予定を 2 文で言ってください',
    }))

    render(<TopicPage lang="en" />)

    expect(screen.queryByText('お題')).not.toBeNull()
    expect(screen.queryByText('今週末の予定を 2 文で言ってください')).not.toBeNull()
  })

  it('聞こえた文・相手の受け取り・続きの質問を文字で見せる', () => {
    useTopicSession.mockReturnValue(session({
      phase: 'feedback',
      turns: [turn],
      currentPromptJa: '誰と行きますか?',
    }))

    render(<TopicPage lang="en" />)

    expect(screen.queryByText('伝わりました')).not.toBeNull()
    expect(screen.queryByText('I go Asakusa weekend.')).not.toBeNull()
    expect(screen.queryByText('I am going to Asakusa this weekend.')).not.toBeNull()
    expect(screen.queryByText('Who are you going with?')).not.toBeNull()
    expect(screen.queryByRole('button', { name: '質問に答える' })).not.toBeNull()
    expect(screen.queryByText(/間違|不正解/)).toBeNull()
  })

  it('伝わらなかったときは聞き返しとして見せる', () => {
    useTopicSession.mockReturnValue(session({
      phase: 'feedback',
      turns: [{
        ...turn,
        result: { ...turn.result, understood: false, follow_up: '', follow_up_ja: '' },
      }],
    }))

    render(<TopicPage lang="en" />)

    expect(screen.queryByText(/伝わりませんでした/)).not.toBeNull()
    expect(screen.queryByText('相手の聞き返し')).not.toBeNull()
    expect(screen.queryByRole('button', { name: 'もう一度言う' })).not.toBeNull()
  })

  it('2 ターン終わったら次のお題へ進める', () => {
    useTopicSession.mockReturnValue(session({ phase: 'finished', turns: [turn, turn] }))

    render(<TopicPage lang="en" />)

    expect(screen.queryByRole('button', { name: '次のお題へ' })).not.toBeNull()
  })
})
