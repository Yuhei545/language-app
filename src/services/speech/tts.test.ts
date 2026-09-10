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
  let audioPlaybackSupported = true
  let settings: {
    ttsProvider: 'browser' | 'gemini'
    geminiApiKey: string
    geminiTtsModel: string
    geminiVoice: { en: string; ko: string }
    geminiVoiceB: { en: string; ko: string }
    geminiVoiceJa: string
  }

  beforeEach(() => {
    playAudio.mockClear()
    getBundledAudio.mockClear()
    findBundledClip.mockReset()
    synthesizeSpeech.mockReset()
    audioPlaybackSupported = true
    settings = {
      ttsProvider: 'gemini',
      geminiApiKey: 'key',
      geminiTtsModel: 'm',
      geminiVoice: { en: 'Kore', ko: 'Aoede' },
      geminiVoiceB: { en: 'Puck', ko: 'Charon' },
      geminiVoiceJa: 'Zephyr',
    }
    vi.doMock('./audioPlayer', () => ({
      isAudioPlaybackSupported: () => audioPlaybackSupported,
      playAudio,
      playWav: playAudio,
      stopPlayback: vi.fn(),
      unlockAudioPlayback: vi.fn(),
    }))
    vi.doMock('./bundledAudio', () => ({ findBundledClip, getBundledAudio }))
    vi.doMock('../gemini/tts', () => ({ synthesizeSpeech, synthesizeBatch: vi.fn() }))
    vi.doMock('../settings', () => ({ getSettings: () => settings }))
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

  it('Gemini で読めないときは失敗を投げ、内蔵音声に切り替えない', async () => {
    findBundledClip.mockReturnValue(null)
    synthesizeSpeech.mockRejectedValue(new Error('quota'))
    const { speak } = await import('./tts')

    await expect(speak('hello', { lang: 'ja' })).rejects.toThrow('quota')
    expect(synthesizeSpeech).toHaveBeenCalledTimes(1)
    expect(window.speechSynthesis.speak).not.toHaveBeenCalled()
  })

  it('内蔵音声を選んでいるときは speakWithBrowser で読み上げる', async () => {
    settings.ttsProvider = 'browser'
    settings.geminiApiKey = ''
    findBundledClip.mockReturnValue(null)
    const { speak, stopSpeaking } = await import('./tts')

    const reading = speak('hello', { lang: 'en' })
    // 内蔵音声は onend を待つので、読み上げを始めたことだけを確かめる
    await vi.waitFor(() => expect(window.speechSynthesis.speak).toHaveBeenCalledTimes(1))
    expect(synthesizeSpeech).not.toHaveBeenCalled()
    stopSpeaking()
    await reading
  })

  it('Gemini を選んでいて API キーが空なら分かりやすいエラーを投げる', async () => {
    settings.geminiApiKey = '  '
    findBundledClip.mockReturnValue(null)
    const { speak } = await import('./tts')

    await expect(speak('hello', { lang: 'en' }))
      .rejects.toThrow('Gemini の API キーが設定されていません。設定画面で入れてください')
    expect(synthesizeSpeech).not.toHaveBeenCalled()
    expect(window.speechSynthesis.speak).not.toHaveBeenCalled()
  })

  it('Gemini を選んでいて音声を再生できない端末では分かりやすいエラーを投げる', async () => {
    audioPlaybackSupported = false
    findBundledClip.mockReturnValue(null)
    const { speak } = await import('./tts')

    await expect(speak('hello', { lang: 'en' }))
      .rejects.toThrow('この端末では音声の再生が使えません')
    expect(synthesizeSpeech).not.toHaveBeenCalled()
    expect(window.speechSynthesis.speak).not.toHaveBeenCalled()
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
