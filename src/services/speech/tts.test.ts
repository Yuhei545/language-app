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

describe('speak: 同梱の音声と Gemini の失敗', () => {
  const playAudio = vi.fn(async () => undefined)
  const getBundledAudio = vi.fn(async () => new ArrayBuffer(8))
  const findBundledClip = vi.fn()
  const synthesizeSpeech = vi.fn()

  beforeEach(() => {
    playAudio.mockClear()
    getBundledAudio.mockClear()
    findBundledClip.mockReset()
    synthesizeSpeech.mockReset()
    vi.doMock('./audioPlayer', () => ({
      isAudioPlaybackSupported: () => true,
      playAudio,
      playWav: playAudio,
      stopPlayback: vi.fn(),
      unlockAudioPlayback: vi.fn(),
    }))
    vi.doMock('./bundledAudio', () => ({ findBundledClip, getBundledAudio }))
    vi.doMock('../gemini/tts', () => ({ synthesizeSpeech, synthesizeBatch: vi.fn() }))
    vi.doMock('../settings', () => ({
      getSettings: () => ({
        ttsProvider: 'gemini',
        geminiApiKey: 'key',
        geminiTtsModel: 'm',
        geminiVoice: { en: 'Kore', ko: 'Aoede' },
        geminiVoiceB: { en: 'Puck', ko: 'Charon' },
        geminiVoiceJa: 'Zephyr',
      }),
    }))
    stubSpeechSynthesis([voice('en-US'), voice('ja-JP')])
  })

  it('同梱の音声があれば、Gemini も内蔵音声も使わずに自然な速さで再生する', async () => {
    findBundledClip.mockReturnValue({ lang: 'en', lessonId: '01-cafe', hash: 'abc', ms: 100 })
    const { speak } = await import('./tts')

    await speak('Could I get a coffee?', { lang: 'en', speaker: 'B', rate: 0.8 })

    expect(findBundledClip).toHaveBeenCalledWith('Could I get a coffee?', 'en', 'B')
    expect(getBundledAudio).toHaveBeenCalledTimes(1)
    expect(playAudio).toHaveBeenCalledWith(expect.any(ArrayBuffer), { rate: 1 })
    expect(synthesizeSpeech).not.toHaveBeenCalled()
    expect(window.speechSynthesis.speak).not.toHaveBeenCalled()
  })

  it('日本語はナレーターの声で引き、同梱の取得に失敗したら投げる(内蔵に落ちない)', async () => {
    findBundledClip.mockReturnValue({ lang: 'en', lessonId: '01-cafe', hash: 'ja1', ms: 100 })
    getBundledAudio.mockRejectedValueOnce(new Error('HTTP 404'))
    const { speak } = await import('./tts')

    await expect(speak('「合図」と言ってみましょう', { lang: 'ja' })).rejects.toThrow('HTTP 404')
    expect(findBundledClip).toHaveBeenCalledWith('「合図」と言ってみましょう', 'ja', 'narrator')
    expect(window.speechSynthesis.speak).not.toHaveBeenCalled()
  })

  it('Gemini で読めないとき、onGeminiFailure が throw なら投げ、既定なら内蔵音声に切り替える', async () => {
    findBundledClip.mockReturnValue(null)
    synthesizeSpeech.mockRejectedValue(new Error('quota'))
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { speak, getLastGeminiTtsFallback } = await import('./tts')

    await expect(speak('hello', { lang: 'ja', onGeminiFailure: 'throw' })).rejects.toThrow('quota')
    expect(window.speechSynthesis.speak).not.toHaveBeenCalled()

    const fallback = speak('hello', { lang: 'en' })
    // 内蔵音声は onend を待つので、読み上げを始めたことだけを確かめる
    await vi.waitFor(() => expect(window.speechSynthesis.speak).toHaveBeenCalledTimes(1))
    expect(getLastGeminiTtsFallback()).toBe('quota')
    ;(await import('./tts')).stopSpeaking()
    await fallback
    consoleWarn.mockRestore()
  })

  it('日本語も Gemini で合成する(ナレーターの声)', async () => {
    findBundledClip.mockReturnValue(null)
    synthesizeSpeech.mockResolvedValue({ samples: new Float32Array(240), sampleRate: 24000 })
    const { speak } = await import('./tts')

    await speak('こんにちは', { lang: 'ja' })

    expect(synthesizeSpeech).toHaveBeenCalledWith(expect.objectContaining({ lang: 'ja', voiceName: 'Zephyr' }))
    expect(playAudio).toHaveBeenCalledTimes(1)
  })
})
