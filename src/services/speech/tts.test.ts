import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

function voice(lang: string): SpeechSynthesisVoice {
  return {
    default: false,
    lang,
    localService: true,
    name: `${lang} voice`,
    voiceURI: `${lang}-voice`,
  }
}

function stubSpeechSynthesis(voices: SpeechSynthesisVoice[]) {
  const speechSynthesis = {
    addEventListener: vi.fn(),
    cancel: vi.fn(),
    getVoices: vi.fn(() => voices),
    speak: vi.fn(),
  }
  vi.stubGlobal('speechSynthesis', speechSynthesis)
  vi.stubGlobal('SpeechSynthesisUtterance', class {})
}

beforeEach(() => {
  vi.resetModules()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('hasVoiceFor', () => {
  it('日本語音声があれば true を返す', async () => {
    stubSpeechSynthesis([voice('en-US'), voice('ja-JP')])
    const { hasVoiceFor } = await import('./tts')

    expect(hasVoiceFor('ja')).toBe(true)
  })

  it('日本語音声がなければ false を返す', async () => {
    stubSpeechSynthesis([voice('en-US'), voice('ko-KR')])
    const { hasVoiceFor } = await import('./tts')

    expect(hasVoiceFor('ja')).toBe(false)
  })
})
