import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { LanguageProvider } from '../../app/LanguageContext'
import type { LessonStep } from './types'
import { LessonPage } from './LessonPage'

const useLessonMock = vi.hoisted(() => vi.fn())

vi.mock('./useLesson', () => ({ useLesson: useLessonMock }))

const step: LessonStep = {
  item: {
    id: 'card:vocab-1',
    kind: 'word',
    cueJa: '駅へ行きたいと伝える',
    answer: 'I want to go to the station.',
  },
  stage: 1,
}

function lessonState(overrides: Record<string, unknown> = {}) {
  return {
    status: 'ready',
    steps: [step],
    currentIndex: 0,
    currentStep: step,
    currentAction: null,
    estimatedMinutes: 2,
    elapsedMs: 0,
    paused: false,
    start: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    skip: vi.fn(),
    stop: vi.fn(),
    recallResults: [],
    error: null,
    clearError: vi.fn(),
    ...overrides,
  }
}

function renderPage() {
  return render(
    <MemoryRouter>
      <LanguageProvider>
        <LessonPage />
      </LanguageProvider>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('LessonPage', () => {
  it('ready で「はじめる」と秒数スライダーを表示する', () => {
    useLessonMock.mockReturnValue(lessonState())
    renderPage()

    expect(screen.queryByRole('button', { name: 'はじめる' })).not.toBeNull()
    expect(screen.queryByRole('slider', { name: /答える間の秒数/ })).not.toBeNull()
  })

  it('pause 中は問いを表示し、模範の答えを表示しない', () => {
    useLessonMock.mockReturnValue(lessonState({
      status: 'running',
      currentAction: 'pause',
    }))
    renderPage()

    expect(screen.queryByText(step.item.cueJa)).not.toBeNull()
    expect(screen.queryByText(step.item.answer)).toBeNull()
    expect(screen.queryByText('声に出してみましょう')).not.toBeNull()
  })
})
