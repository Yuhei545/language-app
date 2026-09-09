import { cleanup, fireEvent, render, screen } from '@testing-library/react'
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
    mode: 'words',
    status: 'ready',
    steps: [step],
    dialogue: null,
    upcomingPrepEvents: [],
    warnings: [],
    curriculum: null,
    curriculumLesson: null,
    currentCurriculumStatus: null,
    nextCurriculumStatus: null,
    promptCount: 0,
    audioProgress: null,
    selfReport: null,
    passed: null,
    reporting: false,
    selectWordLesson: vi.fn(),
    startCurriculumLesson: vi.fn(),
    startDialogueLesson: vi.fn(),
    chooseFreeScene: vi.fn(),
    chooseDifferentScene: vi.fn(),
    chooseCurriculum: vi.fn(),
    reportSelfAssessment: vi.fn(),
    retryAudio: vi.fn(),
    currentIndex: 0,
    currentStep: step,
    currentAction: null,
    estimatedMinutes: 2,
    elapsedMs: 0,
    paused: false,
    autoPaused: false,
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

  it('画面が隠れて自動停止したときは再開の案内を表示する', () => {
    useLessonMock.mockReturnValue(lessonState({
      status: 'running',
      paused: true,
      autoPaused: true,
    }))
    renderPage()

    expect(screen.getByText('画面が隠れたので止めました。「▶ 再開」で続きから')).toBeTruthy()
  })

  it('同梱レッスンでは「今日のレッスン N/10」と音声の準備、一覧を出す', () => {
    const lesson = {
      version: 1 as const,
      id: '01-cafe',
      order: 1,
      scene_ja: 'カフェで注文する',
      dialogue: { title_ja: 'カフェで注文する', scene_ja: 'カフェで', turns: [], new_expressions: [] },
      review: [],
    }
    const statuses = [
      { lesson, index: 0, kind: 'new' as const, audioReady: true },
      { lesson: { ...lesson, id: '02-directions', order: 2, scene_ja: '道を尋ねる' }, index: 1, kind: 'locked' as const, audioReady: false },
    ]
    useLessonMock.mockReturnValue(lessonState({
      mode: 'curriculum',
      dialogue: lesson.dialogue,
      curriculum: { statuses, next: statuses[0], total: 2 },
      curriculumLesson: lesson,
      currentCurriculumStatus: statuses[0],
      audioProgress: { done: 23, total: 110 },
    }))
    renderPage()

    expect(screen.getByText('今日のレッスン 1/2')).toBeTruthy()
    expect(screen.getByText(/音声を準備しています 23\/110/)).toBeTruthy()
    expect(screen.getByRole('button', { name: '自由な場面で作る(Gemini)' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /レッスン一覧/ }))
    expect(screen.getByText('音声を準備中')).toBeTruthy()
  })

  it('終了時は自己申告の 4 択を出し、押した申告をフックに渡す', () => {
    const reportSelfAssessment = vi.fn()
    useLessonMock.mockReturnValue(lessonState({
      mode: 'curriculum',
      status: 'finished',
      promptCount: 16,
      reportSelfAssessment,
      curriculumLesson: { version: 1, id: '01-cafe', order: 1, scene_ja: 'カフェ', dialogue: { title_ja: 'カフェ', scene_ja: 'カフェ', turns: [], new_expressions: [] }, review: [] },
      dialogue: { title_ja: 'カフェ', scene_ja: 'カフェ', turns: [], new_expressions: [] },
    }))
    renderPage()

    expect(screen.getByText(/応用の合図 16 個のうち/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '8 割くらい' }))
    expect(reportSelfAssessment).toHaveBeenCalledWith('most')
  })
})
