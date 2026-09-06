import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createSpeechInput,
  isWebSpeechAvailable,
  resetWebSpeechSessionState,
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

/** stop() を呼ぶと、指定した種類のエラーを onerror で返す認識器。 */
function makeFailingRecognitionClass(errorCode: string) {
  return class FailingRecognition extends FakeRecognition {
    override stop() {
      const handler = this.onerror as ((event: { error: string }) => void) | null
      handler?.({ error: errorCode })
    }
  }
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

beforeEach(() => {
  resetWebSpeechSessionState()
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  resetWebSpeechSessionState()
})

describe('isWebSpeechAvailable', () => {
  it('iOS でも API があれば使える(iPhone の Safari)', () => {
    stubNavigator({
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)',
      platform: 'iPhone',
      maxTouchPoints: 5,
    })
    vi.stubGlobal('window', { webkitSpeechRecognition: FakeRecognition })

    expect(isWebSpeechAvailable()).toBe(true)
  })

  it('API が無い端末(iPhone の Chrome)では使えない', () => {
    stubNavigator({
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) CriOS/130.0',
      platform: 'iPhone',
      maxTouchPoints: 5,
    })
    vi.stubGlobal('window', {})

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

  it('auto は API の無い端末(iPhone の Chrome)では gemini を選ぶ', () => {
    stubNavigator({
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) CriOS/130.0',
      platform: 'iPhone',
      maxTouchPoints: 5,
    })
    vi.stubGlobal('window', {})

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

describe('Web Speechが実行中に壊れたときのフォールバック', () => {
  it('通信エラーの後、autoは次回からgeminiを選ぶ', async () => {
    stubNavigator()
    vi.stubGlobal('window', { webkitSpeechRecognition: makeFailingRecognitionClass('network') })
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    const first = createSpeechInput({ lang: 'en', engine: 'auto', transcribe })
    expect(first.engine).toBe('webspeech')

    await first.start()
    await expect(first.stop()).rejects.toThrow()

    const second = createSpeechInput({ lang: 'en', engine: 'auto', transcribe })
    expect(second.engine).toBe('gemini')
  })

  it('切り替えたことが分かる文言でエラーを返す', async () => {
    stubNavigator()
    vi.stubGlobal('window', { webkitSpeechRecognition: makeFailingRecognitionClass('network') })
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    const input = createSpeechInput({ lang: 'en', engine: 'auto', transcribe })
    await input.start()

    await expect(input.stop()).rejects.toThrow(/切り替えました/)
  })

  it('マイク未許可など利用者側の問題ではwebspeechを無効化しない', async () => {
    stubNavigator()
    vi.stubGlobal('window', { webkitSpeechRecognition: makeFailingRecognitionClass('not-allowed') })

    const first = createSpeechInput({ lang: 'en', engine: 'auto', transcribe })
    await first.start()
    await expect(first.stop()).rejects.toThrow(/マイク/)

    const second = createSpeechInput({ lang: 'en', engine: 'auto', transcribe })
    expect(second.engine).toBe('webspeech')
  })

  it('声が拾えなかっただけならwebspeechを無効化しない', async () => {
    stubNavigator()
    vi.stubGlobal('window', { webkitSpeechRecognition: makeFailingRecognitionClass('no-speech') })

    const first = createSpeechInput({ lang: 'en', engine: 'auto', transcribe })
    await first.start()
    await expect(first.stop()).rejects.toThrow()

    const second = createSpeechInput({ lang: 'en', engine: 'auto', transcribe })
    expect(second.engine).toBe('webspeech')
  })
})
