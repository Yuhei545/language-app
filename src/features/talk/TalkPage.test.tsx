import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LanguageProvider } from '../../app/LanguageContext'
import { TalkPage } from './TalkPage'

const useChatGptPromptMock = vi.hoisted(() => vi.fn())

vi.mock('./useChatGptPrompt', () => ({ useChatGptPrompt: useChatGptPromptMock }))

function state(overrides: Record<string, unknown> = {}) {
  return {
    prompt: 'あなたは私の「英語の親」です。',
    loading: false,
    error: null,
    sceneJa: '',
    setSceneJa: vi.fn(),
    reload: vi.fn(),
    clearError: vi.fn(),
    ...overrides,
  }
}

function renderPage() {
  return render(
    <LanguageProvider>
      <TalkPage />
    </LanguageProvider>,
  )
}

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

describe('TalkPage (ChatGPT で会話)', () => {
  it('プロンプトと手順を表示し、コピーボタンでクリップボードに入れる', async () => {
    const writeText = vi.fn(async () => undefined)
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } })
    useChatGptPromptMock.mockReturnValue(state())
    renderPage()

    expect(screen.getByRole('heading', { name: 'ChatGPT で会話する' })).toBeTruthy()
    expect(screen.getByLabelText('ChatGPT に貼るプロンプト')).toBeTruthy()
    expect(screen.getByText(/音読してから打つ/)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'プロンプトをコピー' }))

    await waitFor(() => expect(writeText).toHaveBeenCalledWith('あなたは私の「英語の親」です。'))
    expect(await screen.findByText('コピーしました')).toBeTruthy()
  })

  it('場面の入力をフックに渡す', () => {
    const setSceneJa = vi.fn()
    useChatGptPromptMock.mockReturnValue(state({ setSceneJa }))
    renderPage()

    fireEvent.change(screen.getByLabelText('今日の場面(任意)'), { target: { value: 'カフェで注文する' } })

    expect(setSceneJa).toHaveBeenCalledWith('カフェで注文する')
  })

  it('読み込み中はその旨を出す', () => {
    useChatGptPromptMock.mockReturnValue(state({ loading: true, prompt: '' }))
    renderPage()

    expect(screen.getByText(/語彙を集めています/)).toBeTruthy()
  })
})
