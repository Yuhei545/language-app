import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createSpeechInput,
  isWebSpeechAvailable,
  type TranscribeAudio,
} from './stt'

class FakeRecognition {
  lang = ''
  interimResults = true
  continuous = true
  onresult = null
  onerror = null
  onend = null

  start() {}
  stop() {}
  abort() {}
}

const transcribe: TranscribeAudio = vi.fn(async () => 'transcribed')

function stubNavigator(overrides: Partial<Navigator> = {}): void {
  vi.stubGlobal('navigator', {
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
    platform: 'Win32',
    maxTouchPoints: 0,
    ...overrides,
  })
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('isWebSpeechAvailable', () => {
  it('iOSではAPIが存在してもfalseになる', () => {
    stubNavigator({
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)',
      platform: 'iPhone',
      maxTouchPoints: 5,
    })
    vi.stubGlobal('window', { webkitSpeechRecognition: FakeRecognition })

    expect(isWebSpeechAvailable()).toBe(false)
  })
})

describe('createSpeechInput', () => {
  it('autoはPCでWeb Speechが使える場合にwebspeechを選ぶ', () => {
    stubNavigator()
    vi.stubGlobal('window', { webkitSpeechRecognition: FakeRecognition })

    const input = createSpeechInput({ lang: 'en', engine: 'auto', transcribe })
    expect(input.engine).toBe('webspeech')
  })

  it('autoはiOSではgeminiを選ぶ', () => {
    stubNavigator({
      userAgent: 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X)',
      platform: 'iPad',
      maxTouchPoints: 5,
    })
    vi.stubGlobal('window', { webkitSpeechRecognition: FakeRecognition })

    const input = createSpeechInput({ lang: 'ko', engine: 'auto', transcribe })
    expect(input.engine).toBe('gemini')
  })

  it('webspeech指定でも利用不可なら警告してgeminiへフォールバックする', () => {
    stubNavigator()
    vi.stubGlobal('window', {})
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    const input = createSpeechInput({ lang: 'en', engine: 'webspeech', transcribe })

    expect(input.engine).toBe('gemini')
    expect(warn).toHaveBeenCalledOnce()
  })
})
