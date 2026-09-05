import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { speak, unlockAudio } from '../../services/speech'
import { VoiceSelect } from './VoiceSelect'

vi.mock('../../services/speech', () => ({
  speak: vi.fn(async () => undefined),
  unlockAudio: vi.fn(),
}))

const mockedSpeak = vi.mocked(speak)
const mockedUnlock = vi.mocked(unlockAudio)

const voices = [
  { voiceURI: 'voice-a', name: 'Voice A', lang: 'en-US' },
  { voiceURI: 'voice-b', name: 'Voice B', lang: 'en-GB' },
] as unknown as SpeechSynthesisVoice[]

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('VoiceSelect', () => {
  it('試聴ボタンで、選んだ声と言語で読み上げる', async () => {
    render(<VoiceSelect label="英語の音声" lang="en" voices={voices} value="voice-b" onChange={vi.fn()} rate={0.8} />)

    fireEvent.click(screen.getByRole('button', { name: '英語の音声を試聴する' }))

    await waitFor(() => expect(mockedSpeak).toHaveBeenCalledOnce())
    expect(mockedUnlock).toHaveBeenCalledOnce()
    expect(mockedSpeak.mock.calls[0][1]).toMatchObject({ lang: 'en', voiceURI: 'voice-b', rate: 0.8 })
  })

  it('相手役の試聴では低めの声(pitch)を渡す', async () => {
    render(<VoiceSelect label="英語の相手役" lang="en" voices={voices} value={null} onChange={vi.fn()} previewPitch={0.9} />)

    fireEvent.click(screen.getByRole('button', { name: '英語の相手役を試聴する' }))

    await waitFor(() => expect(mockedSpeak).toHaveBeenCalledOnce())
    expect(mockedSpeak.mock.calls[0][1]).toMatchObject({ voiceURI: null, pitch: 0.9 })
  })

  it('読み上げに失敗したら理由を画面に出す', async () => {
    mockedSpeak.mockRejectedValueOnce(new Error('この端末では読み上げが使えません'))
    render(<VoiceSelect label="韓国語の音声" lang="ko" voices={voices} value="voice-a" onChange={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: '韓国語の音声を試聴する' }))

    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('読み上げが使えません'))
  })

  it('音声が無いときは試聴ボタンを出さない', () => {
    render(<VoiceSelect label="英語の音声" lang="en" voices={[]} value={null} onChange={vi.fn()} />)

    expect(screen.queryByRole('button', { name: /試聴/ })).toBeNull()
    expect(screen.getByText('音声が見つかりません')).toBeTruthy()
  })
})
