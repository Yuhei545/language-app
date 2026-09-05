import type { SpeechLanguage } from './normalize'

export type TtsLanguage = SpeechLanguage | 'ja'

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

export function speak(
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

    if (opts.lang !== 'ja' && opts.voiceURI) {
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

export function unlockAudio(): void {
  if (audioUnlocked || !isTtsSupported()) {
    return
  }

  const utterance = new SpeechSynthesisUtterance('\u200b')
  utterance.volume = 0
  window.speechSynthesis.speak(utterance)
  audioUnlocked = true
}
