import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { LanguageProvider } from '../../app/LanguageContext'
import { DictationPage } from './DictationPage'

const useDictationSession = vi.hoisted(() => vi.fn())

vi.mock('./useDictationSession', async () => {
  const actual = await vi.importActual<typeof import('./useDictationSession')>('./useDictationSession')
  return { ...actual, useDictationSession }
})

const sentence = {
  id: 'en-001',
  text: 'I want to go to the station.',
  focus: ['want to は wanna のように聞こえる'],
  features: [{ id: 'reduction' as const, span: 'want to' }],
}

const cloze = {
  segments: ['I ', ' go to the station.'],
  blanks: [{ answer: 'want to', featureId: 'reduction' as const }],
}

function session(overrides: Record<string, unknown> = {}) {
  return {
    status: 'typing',
    currentSentence: sentence,
    currentIndex: 0,
    totalSentences: 5,
    stage: 'cloze',
    cloze,
    blankInputs: [''],
    playsRemaining: 2,
    typedText: '',
    result: null,
    featureNotes: [],
    weakFeatures: [],
    averageRatio: 0,
    isSpeaking: false,
    isSubmitting: false,
    error: null,
    play: vi.fn(),
    beginTyping: vi.fn(),
    setTypedText: vi.fn(),
    setBlankInput: vi.fn(),
    submit: vi.fn(),
    next: vi.fn(),
    clearError: vi.fn(),
    ...overrides,
  }
}

function renderPage() {
  return render(
    <MemoryRouter>
      <LanguageProvider>
        <DictationPage />
      </LanguageProvider>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  localStorage.clear()
  useDictationSession.mockReturnValue(session())
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('DictationPage', () => {
  it('穴埋めの段階では、空欄と前後の文字を出す', () => {
    renderPage()

    expect(screen.queryByText('穴埋め')).not.toBeNull()
    expect(screen.queryByText('I')).not.toBeNull()
    expect(screen.queryByLabelText('空欄 1')).not.toBeNull()
    expect(screen.queryByLabelText('dictation-answer')).toBeNull()
  })

  it('空欄に入力するとフックへ伝える', () => {
    const setBlankInput = vi.fn()
    useDictationSession.mockReturnValue(session({ setBlankInput }))
    renderPage()

    fireEvent.change(screen.getByLabelText('空欄 1'), { target: { value: 'want to' } })

    expect(setBlankInput).toHaveBeenCalledWith(0, 'want to')
  })

  it('全文の段階では、まとめて書く欄を出す', () => {
    useDictationSession.mockReturnValue(session({ stage: 'full', cloze: null }))
    renderPage()

    expect(screen.queryByText('全文')).not.toBeNull()
    expect(screen.queryByLabelText('聞こえた通りに入力してください')).not.toBeNull()
    expect(screen.queryByLabelText('空欄 1')).toBeNull()
  })

  it('答え合わせでは、抜けた語をタップしてそこだけ聞ける', () => {
    const play = vi.fn()
    useDictationSession.mockReturnValue(session({
      status: 'result',
      play,
      result: {
        tokens: [
          { text: 'i', kind: 'match' as const },
          { text: 'want', kind: 'missing' as const },
        ],
        ratio: 0.5,
        blankResults: [false],
        featureResults: [{ featureId: 'reduction' as const, correct: false }],
      },
      featureNotes: [{
        id: 'reduction' as const,
        lang: 'en' as const,
        name_ja: '縮約',
        note_ja: '決まった組み合わせが会話では別の形に聞こえます。',
        example: 'want to → wanna',
        correct: false,
      }],
    }))
    renderPage()

    expect(screen.queryByText('50% 聞き取れました')).not.toBeNull()
    expect(screen.queryByText('縮約')).not.toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'want だけ聞く' }))

    expect(play).toHaveBeenCalledWith(0.85, 'want')
  })

  it('まとめでは苦手な音を出す', () => {
    useDictationSession.mockReturnValue(session({
      status: 'finished',
      currentSentence: null,
      averageRatio: 0.72,
      weakFeatures: [{
        id: 'flap' as const,
        lang: 'en' as const,
        name_ja: 'フラップの t',
        note_ja: '母音にはさまれた t は軽い音になります。',
        example: 'water → ワラー',
        accuracy: 0.25,
      }],
    }))
    renderPage()

    expect(screen.queryByText('苦手な音')).not.toBeNull()
    expect(screen.queryByText('フラップの t')).not.toBeNull()
    expect(screen.queryByText('25%')).not.toBeNull()
    expect(screen.queryByText(/忘れかけた頃に/)).not.toBeNull()
  })
})
