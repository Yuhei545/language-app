import type { ClipVoice } from '../../content/lessonAudio'
import { synthesizeBatch, synthesizeSpeech, type SynthesizedAudio } from '../gemini/tts'
import { getSettings } from '../settings'
import { audioCacheKey, getCachedAudio, putCachedAudio } from './audioCache'
import { isAudioPlaybackSupported, playAudio, stopPlayback, unlockAudioPlayback } from './audioPlayer'
import { findBundledClip, getBundledAudio } from './bundledAudio'
import type { SpeechLanguage } from './normalize'
import { encodeWavBuffer } from './wav'

export type TtsLanguage = SpeechLanguage | 'ja'
/** 会話の話者(A/B)と、日本語のナレーター。 */
export type TtsSpeaker = 'A' | 'B' | 'narrator'

export type SpeakOptions = {
  lang: TtsLanguage
  rate?: number
  voiceURI?: string | null
  pitch?: number
  /** 会話の話者。Gemini の声のとき A/B で声を分ける。省略時は A(日本語はナレーター)。 */
  speaker?: TtsSpeaker
  /**
   * Gemini の声で読めなかったとき。'browser' は内蔵音声に切り替えて続ける(既定)、
   * 'throw' は失敗を投げる(会話レッスンのように、機械的な声で続けたくないとき)。
   */
  onGeminiFailure?: 'browser' | 'throw'
}

const browserLanguages: Record<TtsLanguage, string> = {
  en: 'en-US',
  ko: 'ko-KR',
  ja: 'ja-JP',
}

let cachedVoices: SpeechSynthesisVoice[] = []
let voiceListenerAttached = false
let audioUnlocked = false
let activeUtterance: SpeechSynthesisUtterance | null = null
let finishActiveUtterance: (() => void) | null = null

export function isTtsSupported(): boolean {
  return (
    typeof window !== 'undefined'
    && 'speechSynthesis' in window
    && typeof SpeechSynthesisUtterance !== 'undefined'
  )
}

export function stopSpeaking(): void {
  stopPlayback()
  if (isTtsSupported()) {
    window.speechSynthesis.cancel()
    finishActiveUtterance?.()
  }
}

function refreshVoiceCache(): void {
  if (!isTtsSupported()) {
    cachedVoices = []
    return
  }

  cachedVoices = window.speechSynthesis.getVoices()
}

function ensureVoiceCache(): void {
  if (!isTtsSupported()) {
    return
  }

  refreshVoiceCache()

  if (!voiceListenerAttached) {
    window.speechSynthesis.addEventListener('voiceschanged', refreshVoiceCache)
    voiceListenerAttached = true
  }
}

export function listVoices(lang: SpeechLanguage): SpeechSynthesisVoice[] {
  ensureVoiceCache()
  return cachedVoices.filter((voice) => voice.lang.toLowerCase().startsWith(lang))
}

export function hasVoiceFor(lang: TtsLanguage): boolean {
  ensureVoiceCache()
  return cachedVoices.some((voice) => voice.lang.toLowerCase().startsWith(lang))
}

/** ブラウザ内蔵の読み上げ。 */
export function speakWithBrowser(
  text: string,
  opts: { lang: TtsLanguage; rate?: number; voiceURI?: string | null; pitch?: number },
): Promise<void> {
  if (!isTtsSupported()) {
    return Promise.reject(new Error('この端末では読み上げが使えません'))
  }

  ensureVoiceCache()
  stopSpeaking()

  return new Promise((resolve, reject) => {
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = browserLanguages[opts.lang]
    const requestedPitch = opts.pitch ?? 1
    utterance.pitch = Number.isFinite(requestedPitch)
      ? Math.max(0.5, Math.min(2, requestedPitch))
      : 1
    const timeoutMs = Math.max(4_000, text.length * 250 + 2_000)
    let settled = false
    let watchdog: ReturnType<typeof setTimeout> | null = null

    const finish = (error?: Error) => {
      if (settled) {
        return
      }
      settled = true
      if (watchdog !== null) {
        clearTimeout(watchdog)
      }
      if (activeUtterance === utterance) {
        activeUtterance = null
        finishActiveUtterance = null
      }
      if (error) {
        reject(error)
      } else {
        resolve()
      }
    }

    activeUtterance = utterance
    finishActiveUtterance = () => finish()
    watchdog = setTimeout(() => {
      console.warn('読み上げの終了通知が来なかったため打ち切りました', {
        text,
        lang: opts.lang,
        timeoutMs,
      })
      window.speechSynthesis.cancel()
      finish()
    }, timeoutMs)

    if (opts.rate !== undefined) {
      utterance.rate = opts.rate
    }

    if (opts.voiceURI) {
      const voice = cachedVoices.find((candidate) => candidate.voiceURI === opts.voiceURI)
      if (voice) {
        utterance.voice = voice
      }
    }

    utterance.onend = () => finish()
    utterance.onerror = (event) => {
      if (event.error === 'interrupted' || event.error === 'canceled') {
        finish()
        return
      }

      finish(new Error(`読み上げに失敗しました: ${event.error}`))
    }
    window.speechSynthesis.speak(utterance)
  })
}

// ---- 同梱の音声 ---------------------------------------------------------------

/** 同梱の音声は自然な速さで固定(playbackRate は音程も変えるため、速さの設定は当てない)。 */
export const BUNDLED_PLAYBACK_RATE = 1

function clipVoiceFor(lang: TtsLanguage, speaker: TtsSpeaker | undefined): ClipVoice {
  if (lang === 'ja') {
    return 'narrator'
  }
  return speaker === 'B' ? 'B' : 'A'
}

// ---- Gemini の声 --------------------------------------------------------------

/** 最後に内蔵音声へ切り替わった理由。設定画面などで見せる。 */
let lastGeminiFallback: string | null = null
export function getLastGeminiTtsFallback(): string | null {
  return lastGeminiFallback
}

/** 同じ文を同時に 2 回作らないための、進行中の合成。 */
const inFlight = new Map<string, Promise<ArrayBuffer>>()

function geminiVoiceFor(lang: TtsLanguage, speaker: TtsSpeaker): string {
  const settings = getSettings()
  if (lang === 'ja') {
    return settings.geminiVoiceJa
  }
  const pair = speaker === 'B' ? settings.geminiVoiceB : settings.geminiVoice
  return pair[lang] || settings.geminiVoice[lang]
}

function cacheKeyFor(text: string, lang: TtsLanguage, voice: string): string {
  return audioCacheKey({
    provider: 'gemini',
    model: getSettings().geminiTtsModel,
    voice,
    lang,
    text,
  })
}

function toWav(audio: SynthesizedAudio): ArrayBuffer {
  return encodeWavBuffer(audio.samples, audio.sampleRate)
}

function usesGeminiVoice(): boolean {
  const settings = getSettings()
  return (
    settings.ttsProvider === 'gemini'
    && settings.geminiApiKey.trim() !== ''
    && isAudioPlaybackSupported()
  )
}

async function getOrSynthesize(text: string, lang: TtsLanguage, voice: string): Promise<ArrayBuffer> {
  const key = cacheKeyFor(text, lang, voice)
  const cached = await getCachedAudio(key)
  if (cached) {
    return cached
  }
  const pending = inFlight.get(key)
  if (pending) {
    return pending
  }
  const task = (async () => {
    const audio = await synthesizeSpeech({ text, lang, voiceName: voice, model: getSettings().geminiTtsModel })
    const wav = toWav(audio)
    await putCachedAudio(key, wav)
    return wav
  })()
  inFlight.set(key, task)
  try {
    return await task
  } finally {
    inFlight.delete(key)
  }
}

/**
 * 読み上げ。
 * 1. 同梱の音声(事前に合成したレッスンの文)があればそれを再生する。失敗は投げる。
 * 2. 無ければ、設定が Gemini の声なら キャッシュ → 合成 → 再生。日本語のナレーションも Gemini で読む。
 *    読めなかったときは onGeminiFailure に従う(既定は内蔵音声に切り替えて続ける)。
 * 3. それ以外は内蔵音声。
 */
export async function speak(text: string, opts: SpeakOptions): Promise<void> {
  const bundled = findBundledClip(text, opts.lang, clipVoiceFor(opts.lang, opts.speaker))
  if (bundled) {
    const buffer = await getBundledAudio(bundled)
    stopSpeaking()
    await playAudio(buffer, { rate: BUNDLED_PLAYBACK_RATE })
    return
  }

  if (usesGeminiVoice()) {
    try {
      const wav = await getOrSynthesize(text, opts.lang, geminiVoiceFor(opts.lang, opts.speaker ?? 'A'))
      stopSpeaking()
      await playAudio(wav, { rate: opts.rate })
      lastGeminiFallback = null
      return
    } catch (error) {
      if (opts.onGeminiFailure === 'throw') {
        throw error
      }
      lastGeminiFallback = error instanceof Error ? error.message : String(error)
      console.warn('Gemini の声で読めなかったので、内蔵音声に切り替えます', error)
    }
  }
  return speakWithBrowser(text, opts)
}

/** 設定画面の試聴用。保存前の声で読む。 */
export async function previewGeminiVoice(text: string, lang: TtsLanguage, voiceName: string): Promise<void> {
  unlockAudio()
  const wav = await getOrSynthesize(text, lang, voiceName)
  stopSpeaking()
  await playAudio(wav)
}

/**
 * これから読む文を先に作っておく。Gemini の声のときだけ動き、同梱の音声がある文とキャッシュ済みは飛ばす。
 * 同じ声の文はまとめて 1 回で合成し、切り分けに失敗したら 1 文ずつ作る。
 */
export async function prefetchSpeech(
  items: Array<{ text: string; lang: TtsLanguage; speaker?: TtsSpeaker }>,
): Promise<void> {
  const settings = getSettings()
  if (settings.ttsProvider !== 'gemini' || settings.geminiApiKey.trim() === '') {
    return
  }
  const groups = new Map<string, { lang: TtsLanguage; voice: string; texts: string[] }>()
  for (const item of items) {
    if (findBundledClip(item.text, item.lang, clipVoiceFor(item.lang, item.speaker))) {
      continue
    }
    const voice = geminiVoiceFor(item.lang, item.speaker ?? 'A')
    const key = cacheKeyFor(item.text, item.lang, voice)
    if (inFlight.has(key) || (await getCachedAudio(key))) {
      continue
    }
    const groupKey = `${item.lang}|${voice}`
    const group = groups.get(groupKey) ?? { lang: item.lang, voice, texts: [] }
    if (!group.texts.includes(item.text)) {
      group.texts.push(item.text)
    }
    groups.set(groupKey, group)
  }

  for (const group of groups.values()) {
    for (let start = 0; start < group.texts.length; start += 6) {
      const chunk = group.texts.slice(start, start + 6)
      try {
        const batch = await synthesizeBatch({
          texts: chunk,
          lang: group.lang,
          voiceName: group.voice,
          model: settings.geminiTtsModel,
        })
        if (batch) {
          await Promise.all(batch.map((audio, index) => (
            putCachedAudio(cacheKeyFor(chunk[index], group.lang, group.voice), toWav(audio))
          )))
          continue
        }
        for (const text of chunk) {
          await getOrSynthesize(text, group.lang, group.voice)
        }
      } catch (error) {
        console.warn('読み上げの先読みに失敗しました(読むときに作り直します)', error)
        return
      }
    }
  }
}

export function unlockAudio(): void {
  unlockAudioPlayback()
  if (audioUnlocked || !isTtsSupported()) {
    return
  }

  const utterance = new SpeechSynthesisUtterance('​')
  utterance.volume = 0
  window.speechSynthesis.speak(utterance)
  audioUnlocked = true
}
