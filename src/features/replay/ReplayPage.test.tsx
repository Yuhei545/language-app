import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { LanguageProvider } from '../../app/LanguageContext'
import { ReplayPage } from './ReplayPage'

const useReplaySession = vi.hoisted(() => vi.fn())

vi.mock('./useReplaySession', () => ({ useReplaySession }))

const dialogue = {
  id: 'd1',
  user_id: 'u',
  lang: 'en' as const,
  scene_ja: 'カフェで注文する',
  title_ja: 'カフェ',
  dialogue: [
    { speaker: 'A' as const, text: 'Hi, what can I get for you?', ja: 'ご注文は?' },
    { speaker: 'B' as const, text: 'Could I get a coffee?', ja: 'コーヒーをお願いします' },
  ],
  new_expressions: [],
  times_completed: 1,
  last_completed_at: null,
  created_at: '2026-09-06T00:00:00.000Z',
}

function session(overrides: Record<string, unknown> = {}) {
  return {
    status: 'idle',
    dialogues: [dialogue],
    dialogueIndex: 0,
    turnIndex: 1,
    totalTurns: 2,
    scriptVisible: false,
    targets: [],
    error: null,
    start: vi.fn(async () => undefined),
    stop: vi.fn(),
    toggleScript: vi.fn(),
    clearError: vi.fn(),
    ...overrides,
  }
}

function renderPage() {
  return render(
    <MemoryRouter>
      <LanguageProvider>
        <ReplayPage />
      </LanguageProvider>
    </MemoryRouter>,
  )
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('ReplayPage', () => {
  it('聞く会話の一覧と「はじめる」を出し、押すと再生を始める', () => {
    const start = vi.fn(async () => undefined)
    useReplaySession.mockReturnValue(session({ start }))
    renderPage()

    expect(screen.getByRole('heading', { name: '今日の聞き流し' })).toBeTruthy()
    expect(screen.getByText('カフェ')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'はじめる' }))
    expect(start).toHaveBeenCalledTimes(1)
  })

  it('再生中は進み具合を出し、台本は押したときだけ見せる', () => {
    useReplaySession.mockReturnValue(session({ status: 'playing', scriptVisible: true }))
    renderPage()

    expect(screen.getByText(/1 本目 \/ 1・2 \/ 2 行/)).toBeTruthy()
    expect(screen.getByText('Could I get a coffee?')).toBeTruthy()
    expect(screen.getByRole('button', { name: '台本を隠す' })).toBeTruthy()
  })

  it('保存した会話が無ければレッスンへ誘導する', () => {
    useReplaySession.mockReturnValue(session({ dialogues: [], totalTurns: 0 }))
    renderPage()

    expect(screen.getByText('まだ保存した会話がありません。')).toBeTruthy()
    expect(screen.getByRole('link', { name: '会話レッスンを作る' })).toBeTruthy()
  })
})
