import type { SpeechLanguage } from './normalize'
import { getSettings } from '../settings'
import { stopSpeaking } from './tts'
import {
  blobToBase64,
  downmixToMono,
  downsampleTo16k,
  encodeWav,
  peakRms,
  trimSilence,
} from './wav'

// 録音環境や端末差を見ながら実機で調整する値。
const MIN_SPEECH_SECONDS = 0.3
const MIN_PEAK_RMS = 0.01

export type SttResult = { text: string; engine: 'webspeech' | 'gemini' }

export interface SpeechInput {
  start(): Promise<void>
  stop(): Promise<SttResult>
  cancel(): void
  readonly engine: 'webspeech' | 'gemini'
}

export type TranscribeAudio = (
  audio: { base64: string; mimeType: string },
  lang: SpeechLanguage,
) => Promise<string>

type RecognitionAlternative = { transcript: string }
type RecognitionResult = {
  readonly isFinal: boolean
  readonly length: number
  readonly [index: number]: RecognitionAlternative
}
type RecognitionResultList = {
  readonly length: number
  readonly [index: number]: RecognitionResult
}
type RecognitionEvent = Event & {
  readonly resultIndex: number
  readonly results: RecognitionResultList
}
type RecognitionErrorEvent = Event & {
  readonly error: string
  readonly message?: string
}
type Recognition = {
  lang: string
  interimResults: boolean
  continuous: boolean
  onresult: ((event: RecognitionEvent) => void) | null
  onerror: ((event: RecognitionErrorEvent) => void) | null
  onend: (() => void) | null
  start(): void
  stop(): void
  abort(): void
}
type RecognitionConstructor = new () => Recognition

const recognitionLanguages: Record<SpeechLanguage, string> = {
  en: 'en-US',
  ko: 'ko-KR',
}

function getRecognitionConstructor(): RecognitionConstructor | undefined {
  if (typeof window === 'undefined') {
    return undefined
  }

  const speechWindow = window as unknown as {
    webkitSpeechRecognition?: RecognitionConstructor
    SpeechRecognition?: RecognitionConstructor
  }
  return speechWindow.webkitSpeechRecognition ?? speechWindow.SpeechRecognition
}

/**
 * Web Speech のエンジン自体が使えないことを示すエラー種別。
 * ブラウザの音声認識サーバーに届かない場合(network)や、そのブラウザで
 * 音声認識サービスが提供されていない場合(service-not-allowed)に起きる。
 * マイク未許可や無音は利用者側の問題なので、ここには含めない。
 */
const WEB_SPEECH_ENGINE_FAILURES = new Set(['network', 'service-not-allowed'])

let webSpeechDisabledForSession = false

/** Web Speech をこのセッションで使わない状態にする。 */
function disableWebSpeechForSession(reason: string): void {
  if (webSpeechDisabledForSession) {
    return
  }
  webSpeechDisabledForSession = true
  console.warn(`Web Speech音声認識が使えないため、Gemini音声入力に切り替えます (${reason})`)
}

/** テスト用。セッションの無効化状態を戻す。 */
export function resetWebSpeechSessionState(): void {
  webSpeechDisabledForSession = false
}

function recognitionError(error: string): Error {
  if (WEB_SPEECH_ENGINE_FAILURES.has(error)) {
    disableWebSpeechForSession(error)
    return new Error(
      'ブラウザの音声認識に接続できないため、Gemini音声入力に切り替えました。もう一度話してください。',
    )
  }

  const messages: Record<string, string> = {
    'no-speech': '音声を検出できませんでした',
    'not-allowed': 'マイクの使用が許可されていません',
    'audio-capture': 'マイクを利用できません',
    aborted: '音声認識が中断されました',
  }
  return new Error(messages[error] ?? `音声認識に失敗しました: ${error}`)
}

export class WebSpeechInput implements SpeechInput {
  readonly engine = 'webspeech' as const
  private readonly recognition: Recognition
  private finalText = ''
  private started = false
  private ended = false
  private terminalError: Error | null = null
  private stopPromise: Promise<SttResult> | null = null
  private resolveStop: ((result: SttResult) => void) | null = null
  private rejectStop: ((error: Error) => void) | null = null

  constructor(lang: SpeechLanguage) {
    const RecognitionClass = getRecognitionConstructor()
    if (!RecognitionClass) {
      throw new Error('この端末ではWeb Speech音声認識が使えません')
    }

    this.recognition = new RecognitionClass()
    this.recognition.lang = recognitionLanguages[lang]
    this.recognition.interimResults = false
    this.recognition.continuous = false
    this.recognition.onresult = (event) => this.handleResult(event)
    this.recognition.onerror = (event) => this.handleError(event)
    this.recognition.onend = () => this.handleEnd()
  }

  async start(): Promise<void> {
    stopSpeaking()

    if (this.started) {
      throw new Error('音声認識はすでに開始されています')
    }

    this.finalText = ''
    this.ended = false
    this.terminalError = null
    this.stopPromise = null
    this.resolveStop = null
    this.rejectStop = null

    try {
      this.recognition.start()
      this.started = true
    } catch (error) {
      this.started = false
      throw error
    }
  }

  stop(): Promise<SttResult> {
    if (this.stopPromise) {
      return this.stopPromise
    }

    if (this.terminalError) {
      return Promise.reject(this.terminalError)
    }

    if (this.ended) {
      return Promise.resolve({ text: this.finalText.trim(), engine: this.engine })
    }

    if (!this.started) {
      return Promise.reject(new Error('音声認識が開始されていません'))
    }

    this.stopPromise = new Promise((resolve, reject) => {
      this.resolveStop = resolve
      this.rejectStop = reject
    })

    try {
      this.recognition.stop()
    } catch (error) {
      this.rejectStop?.(error instanceof Error ? error : new Error(String(error)))
      this.clearStopHandlers()
    }

    return this.stopPromise
  }

  cancel(): void {
    if (!this.started) {
      return
    }

    const error = new Error('音声認識をキャンセルしました')
    this.terminalError = error
    this.started = false
    this.ended = true
    this.recognition.abort()
    this.rejectStop?.(error)
    this.clearStopHandlers()
  }

  private handleResult(event: RecognitionEvent): void {
    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      const result = event.results[index]
      if (result.isFinal && result.length > 0) {
        this.finalText += `${result[0].transcript} `
      }
    }
  }

  private handleError(event: RecognitionErrorEvent): void {
    this.terminalError = recognitionError(event.error)
    this.started = false
    this.rejectStop?.(this.terminalError)
    this.clearStopHandlers()
  }

  private handleEnd(): void {
    this.started = false
    this.ended = true

    if (this.terminalError) {
      this.rejectStop?.(this.terminalError)
    } else {
      this.resolveStop?.({ text: this.finalText.trim(), engine: this.engine })
    }

    this.clearStopHandlers()
  }

  private clearStopHandlers(): void {
    this.resolveStop = null
    this.rejectStop = null
  }
}

type AudioContextConstructor = new () => AudioContext

function getAudioContextConstructor(): AudioContextConstructor | undefined {
  if (typeof window === 'undefined') {
    return undefined
  }

  const audioWindow = window as typeof window & {
    webkitAudioContext?: AudioContextConstructor
  }
  return window.AudioContext ?? audioWindow.webkitAudioContext
}

function microphoneError(error: unknown): Error {
  if (error instanceof DOMException && (error.name === 'NotAllowedError' || error.name === 'SecurityError')) {
    return new Error('マイクの使用が許可されていません')
  }

  return error instanceof Error ? error : new Error(String(error))
}

export class GeminiAudioInput implements SpeechInput {
  readonly engine = 'gemini' as const
  private readonly lang: SpeechLanguage
  private readonly transcribe: TranscribeAudio
  private stream: MediaStream | null = null
  private recorder: MediaRecorder | null = null
  private recordingDone: Promise<Blob> | null = null
  private processing: Promise<SttResult> | null = null
  private chunks: Blob[] = []
  private timeoutId: ReturnType<typeof setTimeout> | null = null
  private cancelled = false
  private inputInfo: { label: string; settings: MediaTrackSettings } | null = null

  constructor(lang: SpeechLanguage, transcribe: TranscribeAudio) {
    this.lang = lang
    this.transcribe = transcribe
  }

  async start(): Promise<void> {
    stopSpeaking()

    if (this.recordingDone) {
      throw new Error('録音はすでに開始されています')
    }

    if (
      typeof navigator === 'undefined'
      || !navigator.mediaDevices?.getUserMedia
      || typeof MediaRecorder === 'undefined'
    ) {
      throw new Error('この端末では録音が使えません')
    }

    this.cancelled = false
    this.chunks = []
    this.inputInfo = null

    try {
      const micDeviceId = getSettings().micDeviceId
      try {
        this.stream = await navigator.mediaDevices.getUserMedia({
          audio: micDeviceId ? { deviceId: { exact: micDeviceId } } : true,
        })
      } catch (error) {
        const name = error instanceof DOMException
          ? error.name
          : typeof error === 'object' && error !== null && 'name' in error
            ? String(error.name)
            : ''
        if (micDeviceId && (name === 'OverconstrainedError' || name === 'NotFoundError')) {
          console.warn('選択したマイクを利用できないため、端末の既定マイクへ切り替えます', {
            micDeviceId,
            error,
          })
          this.stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        } else {
          throw error
        }
      }
      const inputTrack = this.stream.getAudioTracks()[0]
      this.inputInfo = inputTrack
        ? { label: inputTrack.label, settings: inputTrack.getSettings() }
        : null
      this.recorder = new MediaRecorder(this.stream)
    } catch (error) {
      this.stopTracks()
      throw microphoneError(error)
    }

    const recorder = this.recorder
    this.recordingDone = new Promise((resolve, reject) => {
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.chunks.push(event.data)
        }
      }
      recorder.onstop = () => {
        this.clearTimeout()
        this.stopTracks()
        resolve(new Blob(this.chunks, { type: recorder.mimeType || 'audio/webm' }))
      }
      recorder.onerror = (event) => {
        this.clearTimeout()
        this.stopTracks()
        const error = (event as Event & { error?: DOMException }).error
        reject(error ?? new Error('録音中にエラーが発生しました'))
      }
    })

    try {
      recorder.start()
    } catch (error) {
      this.recordingDone = null
      this.recorder = null
      this.stopTracks()
      throw error
    }
    this.timeoutId = setTimeout(() => {
      if (recorder.state === 'recording' || recorder.state === 'paused') {
        recorder.stop()
      }
    }, 20_000)
  }

  stop(): Promise<SttResult> {
    if (this.processing) {
      return this.processing
    }

    if (!this.recordingDone || !this.recorder) {
      return Promise.reject(new Error('録音が開始されていません'))
    }

    if (this.cancelled) {
      return Promise.reject(new Error('録音をキャンセルしました'))
    }

    if (this.recorder.state === 'recording' || this.recorder.state === 'paused') {
      this.recorder.stop()
    }

    this.processing = this.finishRecording(this.recordingDone)
    return this.processing
  }

  cancel(): void {
    this.cancelled = true
    this.clearTimeout()

    if (this.recorder && (this.recorder.state === 'recording' || this.recorder.state === 'paused')) {
      this.recorder.stop()
    }

    this.stopTracks()
  }

  private async finishRecording(recordingDone: Promise<Blob>): Promise<SttResult> {
    const recordedBlob = await recordingDone
    if (this.cancelled) {
      throw new Error('録音をキャンセルしました')
    }

    const AudioContextClass = getAudioContextConstructor()
    if (!AudioContextClass) {
      throw new Error('この端末では録音音声を変換できません')
    }

    const audioContext = new AudioContextClass()
    let samples: Float32Array
    let sampleRate: number

    try {
      const audioBuffer = await audioContext.decodeAudioData(await recordedBlob.arrayBuffer())
      const channels = Array.from(
        { length: audioBuffer.numberOfChannels },
        (_, index) => new Float32Array(audioBuffer.getChannelData(index)),
      )
      samples = downmixToMono(channels)
      sampleRate = audioBuffer.sampleRate
    } finally {
      await audioContext.close()
    }

    if (this.cancelled) {
      throw new Error('録音をキャンセルしました')
    }

    const resampled = downsampleTo16k(samples, sampleRate)
    const trimmed = trimSilence(resampled, 16_000)
    const peak = peakRms(trimmed, 16_000)
    const rawSec = sampleRate > 0 ? samples.length / sampleRate : 0
    const trimmedSec = trimmed.length / 16_000
    if (
      trimmed.length < MIN_SPEECH_SECONDS * 16_000
      || peak < MIN_PEAK_RMS
    ) {
      const label = this.inputInfo?.label || '不明'
      const message = `声が小さすぎます(最大音量 ${peak.toFixed(3)}、録音 ${rawSec.toFixed(1)}秒、声の部分 ${trimmedSec.toFixed(1)}秒、入力: ${label})。設定の「マイクテスト」で入力を確認してください`
      console.warn(message, {
        inputInfo: this.inputInfo,
        minimumPeakRms: MIN_PEAK_RMS,
        minimumSpeechSeconds: MIN_SPEECH_SECONDS,
        peak,
        rawSec,
        trimmedSec,
      })
      throw new Error(message)
    }

    const wav = encodeWav(trimmed, 16_000)
    const base64 = await blobToBase64(wav)
    const text = await this.transcribe({ base64, mimeType: 'audio/wav' }, this.lang)
    return { text, engine: this.engine }
  }

  private clearTimeout(): void {
    if (this.timeoutId !== null) {
      clearTimeout(this.timeoutId)
      this.timeoutId = null
    }
  }

  private stopTracks(): void {
    this.stream?.getTracks().forEach((track) => track.stop())
    this.stream = null
  }
}

export function isIos(): boolean {
  if (typeof navigator === 'undefined') {
    return false
  }

  const iosUserAgent = /iPad|iPhone|iPod/i.test(navigator.userAgent)
  const disguisedIpad = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1
  return iosUserAgent || disguisedIpad
}

export function isWebSpeechAvailable(): boolean {
  if (webSpeechDisabledForSession) {
    return false
  }
  return !isIos() && getRecognitionConstructor() !== undefined
}

export function createSpeechInput(opts: {
  lang: SpeechLanguage
  engine: 'auto' | 'webspeech' | 'gemini'
  transcribe: TranscribeAudio
}): SpeechInput {
  const webSpeechAvailable = isWebSpeechAvailable()

  if (opts.engine === 'auto') {
    return webSpeechAvailable
      ? new WebSpeechInput(opts.lang)
      : new GeminiAudioInput(opts.lang, opts.transcribe)
  }

  if (opts.engine === 'webspeech') {
    if (webSpeechAvailable) {
      return new WebSpeechInput(opts.lang)
    }

    console.warn('Web Speech APIはこの端末で利用できないため、Gemini音声入力へ切り替えます')
  }

  return new GeminiAudioInput(opts.lang, opts.transcribe)
}
