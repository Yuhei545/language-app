import type { SpeechLanguage } from './normalize'

const browserLanguages: Record<SpeechLanguage, string> = {
  en: 'en-US',
  ko: 'ko-KR',
}

let cachedVoices: SpeechSynthesisVoice[] = []
let voiceListenerAttached = false
let audioUnlocked = false

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

export function speak(
  text: string,
  opts: { lang: SpeechLanguage; rate?: number; voiceURI?: string | null },
): Promise<void> {
  if (!isTtsSupported()) {
    return Promise.reject(new Error('この端末では読み上げが使えません'))
  }

  ensureVoiceCache()
  window.speechSynthesis.cancel()

  return new Promise((resolve, reject) => {
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = browserLanguages[opts.lang]

    if (opts.rate !== undefined) {
      utterance.rate = opts.rate
    }

    if (opts.voiceURI) {
      const voice = cachedVoices.find((candidate) => candidate.voiceURI === opts.voiceURI)
      if (voice) {
        utterance.voice = voice
      }
    }

    utterance.onend = () => resolve()
    utterance.onerror = (event) => {
      if (event.error === 'interrupted' || event.error === 'canceled') {
        resolve()
        return
      }

      reject(new Error(`読み上げに失敗しました: ${event.error}`))
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
