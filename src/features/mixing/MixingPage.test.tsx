import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LanguageProvider } from '../../app/LanguageContext'
import { MixingPage } from './MixingPage'

const useMixingSessionMock = vi.hoisted(() => vi.fn())

vi.mock('./useMixingSession', () => ({ useMixingSession: useMixingSessionMock }))

const feedback = {
  understood: true,
  recast: 'I go to the station.',
  ja: '私は駅に行きます',
  learnerText: 'I go station',
  durationMs: 2000,
  modelText: 'I go to the station.',
  match: { similarity: 0.7, matched: false, unreliable: false, target: 'text' as const },
}

function sessionState(overrides: Record<string, unknown> = {}) {
  return {
    status: 'feedback',
    cancelChecking: vi.fn(),
    loading: false,
    level: 1,
    totalWords: 60,
    totalCombinations: 1457,
    currentDeal: {
      key: 'deal-1',
      frame: { id: 'go-to', pattern: 'I {verb} to {noun}', hint_ja: '私は{noun}に{verb}', slots: ['verb:place', 'noun:place'] },
      words: [
        { text: 'go', emoji: '🚶', hint_ja: '行く' },
        { text: 'the station', emoji: '🚉', hint_ja: '駅' },
      ],
    },
    intendedMeaning: '私は駅に行く',
    feedback,
    fluency: null,
    sttEngine: 'gemini',
    isSpeaking: false,
    isStartingFluency: false,
    error: null,
    next: vi.fn(),
    startRecording: vi.fn(),
    stopRecording: vi.fn(),
    hearRecast: vi.fn(),
    hearOneWay: vi.fn(),
    startFluency: vi.fn(),
    stopFluency: vi.fn(),
    setLevel: vi.fn(),
    clearError: vi.fn(),
    ...overrides,
  }
}

function renderPage() {
  return render(
    <LanguageProvider>
      <MixingPage />
    </LanguageProvider>,
  )
}

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('MixingPage の結果表示', () => {
  it('聞こえた文・模範・相手の受け取りを文字で見せ、通じたが模範とは違う言い方だと伝える', () => {
    useMixingSessionMock.mockReturnValue(sessionState())
    renderPage()

    expect(screen.getByText('こう聞こえました')).toBeTruthy()
    expect(screen.getByText('I go station')).toBeTruthy()
    expect(screen.getByText('ひとつの言い方(模範)')).toBeTruthy()
    expect(screen.getAllByText('I go to the station.').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('相手はこう受け取りました')).toBeTruthy()
    expect(screen.getByText(/模範とは違う言い方/)).toBeTruthy()
    expect(screen.getByRole('button', { name: '模範を聞く' })).toBeTruthy()
  })

  it('模範と同じ言い方なら、そう伝える', () => {
    useMixingSessionMock.mockReturnValue(sessionState({
      feedback: { ...feedback, learnerText: 'I go to the station', match: { ...feedback.match, similarity: 1, matched: true } },
    }))
    renderPage()

    expect(screen.getByText(/模範と同じ言い方/)).toBeTruthy()
  })

  it('伝わらなかったときは、相手の聞き返しとして見せ、もう一度言える', () => {
    useMixingSessionMock.mockReturnValue(sessionState({
      feedback: { ...feedback, understood: false, recast: 'Did you mean you want to go to the station?', match: { ...feedback.match, similarity: 0.3 } },
    }))
    renderPage()

    expect(screen.getByText(/伝わりませんでした/)).toBeTruthy()
    expect(screen.getByText('相手の聞き返し')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'もう一度言う' })).toBeTruthy()
  })
})
