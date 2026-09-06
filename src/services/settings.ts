export type SttEngine = 'auto' | 'webspeech' | 'gemini'
export type Interest = 'travel' | 'friends' | 'content'
export type MixingLevel = 1 | 2 | 3
export type PersonalWordKind = 'place' | 'person' | 'thing' | 'media'
/** 型を回す・即答の確かめ方。self は答えを見て自分で判定(Gemini を使わない)。 */
export type PatternCheck = 'auto' | 'record' | 'self'
/** 読み上げの声。gemini は Gemini TTS(自然な声、作った音声は端末に保存)。上限時は内蔵に自動で戻る。 */
export type TtsProvider = 'browser' | 'gemini'
export type VoicePair = { en: string; ko: string }

export type PersonalWord = {
  ja: string
  en: string
  ko: string
  kind: PersonalWordKind
}

export type Settings = {
  geminiApiKey: string
  geminiModel: string
  /** 音声の文字起こしに使うモデル。空なら geminiModel と同じ。無料枠はモデルごとなので分散できる。 */
  geminiSttModel: string
  patternCheck: PatternCheck
  sttEngine: SttEngine
  ttsProvider: TtsProvider
  geminiTtsModel: string
  geminiVoice: VoicePair
  geminiVoiceB: VoicePair
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
  personalWords: PersonalWord[]
}

type SettingsListener = (settings: Settings) => void

const STORAGE_KEY = 'lla.settings'
const STT_ENGINES: SttEngine[] = ['auto', 'webspeech', 'gemini']
const INTERESTS: Interest[] = ['travel', 'friends', 'content']
const PERSONAL_WORD_KINDS: PersonalWordKind[] = ['place', 'person', 'thing', 'media']
const PATTERN_CHECKS: PatternCheck[] = ['auto', 'record', 'self']
const TTS_PROVIDERS: TtsProvider[] = ['browser', 'gemini']
const listeners = new Set<SettingsListener>()

const DEFAULT_SETTINGS: Settings = {
  geminiApiKey: '',
  geminiModel: '',
  geminiSttModel: '',
  // 既定は自分で判定。音声認識は当てにならず、無料枠も消費するため(Pimsleur も自己判定)。
  patternCheck: 'self',
  sttEngine: 'auto',
  ttsProvider: 'gemini',
  geminiTtsModel: 'gemini-2.5-flash-preview-tts',
  geminiVoice: { en: 'Kore', ko: 'Aoede' },
  geminiVoiceB: { en: 'Puck', ko: 'Charon' },
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
  personalWords: [],
}

function defaultSettings(): Settings {
  return {
    ...DEFAULT_SETTINGS,
    ttsVoice: { ...DEFAULT_SETTINGS.ttsVoice },
    ttsVoiceB: { ...DEFAULT_SETTINGS.ttsVoiceB },
    interests: [...DEFAULT_SETTINGS.interests],
    geminiVoice: { ...DEFAULT_SETTINGS.geminiVoice },
    geminiVoiceB: { ...DEFAULT_SETTINGS.geminiVoiceB },
    parentName: { ...DEFAULT_SETTINGS.parentName },
    personalWords: [...DEFAULT_SETTINGS.personalWords],
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNullableString(value: unknown): value is string | null {
  return typeof value === 'string' || value === null
}

function isVoicePair(value: unknown): value is VoicePair {
  return isRecord(value) && typeof value.en === 'string' && typeof value.ko === 'string'
}

function isPersonalWord(value: unknown): value is PersonalWord {
  return isRecord(value)
    && typeof value.ja === 'string'
    && typeof value.en === 'string'
    && typeof value.ko === 'string'
    && typeof value.kind === 'string'
    && PERSONAL_WORD_KINDS.includes(value.kind as PersonalWordKind)
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
    && typeof value.geminiSttModel === 'string'
    && typeof value.patternCheck === 'string'
    && PATTERN_CHECKS.includes(value.patternCheck as PatternCheck)
    && typeof value.ttsProvider === 'string'
    && TTS_PROVIDERS.includes(value.ttsProvider as TtsProvider)
    && typeof value.geminiTtsModel === 'string'
    && isVoicePair(value.geminiVoice)
    && isVoicePair(value.geminiVoiceB)
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
    && Array.isArray(value.personalWords)
    && value.personalWords.every(isPersonalWord)
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
        personalWords: parsed.personalWords === undefined
          ? [...DEFAULT_SETTINGS.personalWords]
          : parsed.personalWords,
        geminiSttModel: parsed.geminiSttModel === undefined
          ? DEFAULT_SETTINGS.geminiSttModel
          : parsed.geminiSttModel,
        patternCheck: parsed.patternCheck === undefined
          ? DEFAULT_SETTINGS.patternCheck
          : parsed.patternCheck,
        ttsProvider: parsed.ttsProvider === undefined ? DEFAULT_SETTINGS.ttsProvider : parsed.ttsProvider,
        geminiTtsModel: parsed.geminiTtsModel === undefined ? DEFAULT_SETTINGS.geminiTtsModel : parsed.geminiTtsModel,
        geminiVoice: parsed.geminiVoice === undefined ? { ...DEFAULT_SETTINGS.geminiVoice } : parsed.geminiVoice,
        geminiVoiceB: parsed.geminiVoiceB === undefined ? { ...DEFAULT_SETTINGS.geminiVoiceB } : parsed.geminiVoiceB,
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
      personalWords: parsed.personalWords.map((word) => ({ ...word })),
      geminiVoice: { ...parsed.geminiVoice },
      geminiVoiceB: { ...parsed.geminiVoiceB },
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
    personalWords: partial.personalWords
      ? partial.personalWords.map((word) => ({ ...word }))
      : current.personalWords,
  }

  localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  listeners.forEach((listener) => listener(next))
  return next
}

export function subscribe(listener: SettingsListener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
