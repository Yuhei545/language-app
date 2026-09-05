export type SttEngine = 'auto' | 'webspeech' | 'gemini'
export type Interest = 'travel' | 'friends' | 'content'
export type MixingLevel = 1 | 2 | 3

export type Settings = {
  geminiApiKey: string
  geminiModel: string
  sttEngine: SttEngine
  ttsVoice: { en: string | null; ko: string | null }
  ttsVoiceB: { en: string | null; ko: string | null }
  ttsRate: number
  interests: Interest[]
  parentName: { en: string; ko: string }
  mixingLevel: MixingLevel
  lessonPauseSeconds: number
  lessonRecording: boolean
  micDeviceId: string | null
  ttsVoiceJa: string | null
}

type SettingsListener = (settings: Settings) => void

const STORAGE_KEY = 'lla.settings'
const STT_ENGINES: SttEngine[] = ['auto', 'webspeech', 'gemini']
const INTERESTS: Interest[] = ['travel', 'friends', 'content']
const listeners = new Set<SettingsListener>()

const DEFAULT_SETTINGS: Settings = {
  geminiApiKey: '',
  geminiModel: '',
  sttEngine: 'auto',
  ttsVoice: { en: null, ko: null },
  ttsVoiceB: { en: null, ko: null },
  ttsRate: 0.9,
  interests: [],
  parentName: { en: '', ko: '' },
  mixingLevel: 1,
  lessonPauseSeconds: 4,
  lessonRecording: false,
  micDeviceId: null,
  ttsVoiceJa: null,
}

function defaultSettings(): Settings {
  return {
    ...DEFAULT_SETTINGS,
    ttsVoice: { ...DEFAULT_SETTINGS.ttsVoice },
    ttsVoiceB: { ...DEFAULT_SETTINGS.ttsVoiceB },
    interests: [...DEFAULT_SETTINGS.interests],
    parentName: { ...DEFAULT_SETTINGS.parentName },
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNullableString(value: unknown): value is string | null {
  return typeof value === 'string' || value === null
}

function isSettings(value: unknown): value is Settings {
  if (
    !isRecord(value)
    || !isRecord(value.ttsVoice)
    || !isRecord(value.ttsVoiceB)
    || !isRecord(value.parentName)
  ) {
    return false
  }

  return (
    typeof value.geminiApiKey === 'string'
    && typeof value.geminiModel === 'string'
    && typeof value.sttEngine === 'string'
    && STT_ENGINES.includes(value.sttEngine as SttEngine)
    && isNullableString(value.ttsVoice.en)
    && isNullableString(value.ttsVoice.ko)
    && isNullableString(value.ttsVoiceB.en)
    && isNullableString(value.ttsVoiceB.ko)
    && typeof value.ttsRate === 'number'
    && Number.isFinite(value.ttsRate)
    && value.ttsRate >= 0.7
    && value.ttsRate <= 1
    && Array.isArray(value.interests)
    && value.interests.every((interest) => typeof interest === 'string' && INTERESTS.includes(interest as Interest))
    && typeof value.parentName.en === 'string'
    && typeof value.parentName.ko === 'string'
    && (value.mixingLevel === 1 || value.mixingLevel === 2 || value.mixingLevel === 3)
    && typeof value.lessonPauseSeconds === 'number'
    && Number.isFinite(value.lessonPauseSeconds)
    && value.lessonPauseSeconds >= 2
    && value.lessonPauseSeconds <= 8
    && typeof value.lessonRecording === 'boolean'
    && isNullableString(value.micDeviceId)
    && isNullableString(value.ttsVoiceJa)
  )
}

export function getSettings(): Settings {
  const saved = localStorage.getItem(STORAGE_KEY)

  if (saved === null) {
    return defaultSettings()
  }

  try {
    let parsed: unknown = JSON.parse(saved)

    if (isRecord(parsed)) {
      const pauseSeconds = parsed.lessonPauseSeconds
      parsed = {
        ...parsed,
        mixingLevel: parsed.mixingLevel === undefined
          ? DEFAULT_SETTINGS.mixingLevel
          : parsed.mixingLevel,
        lessonPauseSeconds: pauseSeconds === undefined
          ? DEFAULT_SETTINGS.lessonPauseSeconds
          : typeof pauseSeconds === 'number'
            && Number.isFinite(pauseSeconds)
            && (pauseSeconds < 2 || pauseSeconds > 8)
            ? DEFAULT_SETTINGS.lessonPauseSeconds
            : pauseSeconds,
        lessonRecording: parsed.lessonRecording === undefined
          ? DEFAULT_SETTINGS.lessonRecording
          : parsed.lessonRecording,
        ttsVoiceB: parsed.ttsVoiceB === undefined
          ? { ...DEFAULT_SETTINGS.ttsVoiceB }
          : parsed.ttsVoiceB,
        micDeviceId: parsed.micDeviceId === undefined
          ? DEFAULT_SETTINGS.micDeviceId
          : parsed.micDeviceId,
        ttsVoiceJa: parsed.ttsVoiceJa === undefined
          ? DEFAULT_SETTINGS.ttsVoiceJa
          : parsed.ttsVoiceJa,
      }
    }

    if (!isSettings(parsed)) {
      console.error('lla.settings の保存内容が不正です。既定値を使用します。', parsed)
      return defaultSettings()
    }

    return {
      ...parsed,
      ttsVoice: { ...parsed.ttsVoice },
      ttsVoiceB: { ...parsed.ttsVoiceB },
      interests: [...parsed.interests],
      parentName: { ...parsed.parentName },
    }
  } catch (error) {
    console.error('lla.settings のJSONを解析できません。既定値を使用します。', { saved, error })
    return defaultSettings()
  }
}

export function setSettings(partial: Partial<Settings>): Settings {
  const current = getSettings()
  const next: Settings = {
    ...current,
    ...partial,
    ttsVoice: partial.ttsVoice ? { ...partial.ttsVoice } : current.ttsVoice,
    ttsVoiceB: partial.ttsVoiceB ? { ...partial.ttsVoiceB } : current.ttsVoiceB,
    interests: partial.interests ? [...partial.interests] : current.interests,
    parentName: partial.parentName ? { ...partial.parentName } : current.parentName,
  }

  localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  listeners.forEach((listener) => listener(next))
  return next
}

export function subscribe(listener: SettingsListener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
