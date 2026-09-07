import { buildDialogueLesson } from '../features/lesson/dialoguePlan'
import type { BundledLesson } from './lessonSchema'
import { fail, requireArray, requireRecord, requireString, type UnknownRecord } from './validation'

/**
 * 同梱レッスンの音声。読み上げる文を「文 + 言語 + 声」の組(クリップ)として列挙し、
 * 事前に合成した mp3 を public/lessons/{lang}/{lessonId}/{hash}.mp3 に置く。
 * マニフェスト(audio-manifest.json)がクリップの一覧と長さを持ち、アプリはそれで索引を作る。
 */
export type ClipVoice = 'A' | 'B' | 'narrator'
export type ClipLang = 'en' | 'ko' | 'ja'
export type Clip = { text: string; lang: ClipLang; voice: ClipVoice }

export type ManifestClip = { ms: number }
export type ManifestLesson = {
  /** そのレッスンの全クリップがそろっているか。true のレッスンだけを「音声準備済み」として出す。 */
  complete: boolean
  clips: Record<string, ManifestClip>
}
export type AudioManifest = {
  version: 1
  lang: 'en' | 'ko'
  /** 合成に使った Gemini の声(固定)。 */
  voices: Record<ClipVoice, string>
  /** 合成に使ったモデル id(代替に切り替えたときの追跡用)。 */
  models: string[]
  lessons: Record<string, ManifestLesson>
}

export type BundledClipRef = { lang: 'en' | 'ko'; lessonId: string; hash: string; ms: number }

/** クリップの同一性。文の前後の空白は無視する。速さ(rate)は含めない(再生時に決める)。 */
export function clipKey(clip: Clip): string {
  return `${clip.lang}\n${clip.voice}\n${clip.text.trim()}`
}

const FNV_OFFSET = 0xcbf29ce484222325n
const FNV_PRIME = 0x100000001b3n
const MASK_64 = (1n << 64n) - 1n

/** FNV-1a 64bit を 16 桁の hex に。ファイル名に使う。 */
export function clipHash(clip: Clip): string {
  const bytes = new TextEncoder().encode(clipKey(clip))
  let hash = FNV_OFFSET
  for (const byte of bytes) {
    hash ^= BigInt(byte)
    hash = (hash * FNV_PRIME) & MASK_64
  }
  return hash.toString(16).padStart(16, '0')
}

/** 間の長さでクリップの集合が変わらないことを確かめるための代表値。 */
export const CLIP_PAUSE_SAMPLES = [2, 8] as const

/** その間の長さで組んだレッスンが読み上げる全クリップ(出現順、重複なし)。 */
export function collectClipsAt(lesson: BundledLesson, lang: 'en' | 'ko', pauseSeconds: number): Clip[] {
  const { steps } = buildDialogueLesson(lesson.dialogue, {
    lang,
    pauseSeconds,
    currentWeek: 1,
    review: lesson.review,
  })
  const seen = new Set<string>()
  const clips: Clip[] = []
  for (const step of steps) {
    for (const action of step.actions) {
      if (action.type !== 'speak') {
        continue
      }
      const clip: Clip = {
        text: action.text,
        lang: action.lang,
        voice: action.lang === 'ja' ? 'narrator' : (action.voice === 'B' ? 'B' : 'A'),
      }
      const key = clipKey(clip)
      if (!seen.has(key)) {
        seen.add(key)
        clips.push(clip)
      }
    }
  }
  return clips
}

/** レッスンの全クリップ。間の長さの代表値すべてで組み、和集合を取る。 */
export function collectClips(lesson: BundledLesson, lang: 'en' | 'ko'): Clip[] {
  const seen = new Set<string>()
  const clips: Clip[] = []
  for (const pauseSeconds of CLIP_PAUSE_SAMPLES) {
    for (const clip of collectClipsAt(lesson, lang, pauseSeconds)) {
      const key = clipKey(clip)
      if (!seen.has(key)) {
        seen.add(key)
        clips.push(clip)
      }
    }
  }
  return clips
}

export function clipUrl(base: string, lang: 'en' | 'ko', lessonId: string, hash: string): string {
  const root = base.endsWith('/') ? base : `${base}/`
  return `${root}lessons/${lang}/${lessonId}/${hash}.mp3`
}

/** hash → クリップの所在。hash は言語と声を含むので、言語をまたいでも一意。 */
export function buildClipIndex(manifests: AudioManifest[]): Map<string, BundledClipRef> {
  const index = new Map<string, BundledClipRef>()
  for (const manifest of manifests) {
    for (const [lessonId, lesson] of Object.entries(manifest.lessons)) {
      if (!lesson.complete) {
        continue
      }
      for (const [hash, clip] of Object.entries(lesson.clips)) {
        if (!index.has(hash)) {
          index.set(hash, { lang: manifest.lang, lessonId, hash, ms: clip.ms })
        }
      }
    }
  }
  return index
}

export function isLessonAudioReady(manifest: AudioManifest | null | undefined, lessonId: string): boolean {
  return manifest?.lessons[lessonId]?.complete === true
}

export function emptyManifest(lang: 'en' | 'ko', voices: Record<ClipVoice, string>): AudioManifest {
  return { version: 1, lang, voices, models: [], lessons: {} }
}

export function validateAudioManifest(json: unknown, label: string): AudioManifest {
  const record: UnknownRecord = requireRecord(json, label, 'root')
  if (record.version !== 1) {
    fail(label, 'version', 'は1である必要があります')
  }
  const lang = record.lang
  if (lang !== 'en' && lang !== 'ko') {
    fail(label, 'lang', 'は en か ko である必要があります')
  }
  const voicesRecord = requireRecord(record.voices, label, 'voices')
  const voices: Record<ClipVoice, string> = {
    A: requireString(voicesRecord, 'A', label, 'voices'),
    B: requireString(voicesRecord, 'B', label, 'voices'),
    narrator: requireString(voicesRecord, 'narrator', label, 'voices'),
  }
  const models = requireArray(record, 'models', label, 'root').map((model, index) => {
    if (typeof model !== 'string') {
      fail(label, `models[${index}]`, 'はstringではありません')
    }
    return model
  })
  const lessonsRecord = requireRecord(record.lessons, label, 'lessons')
  const lessons: Record<string, ManifestLesson> = {}
  for (const [lessonId, value] of Object.entries(lessonsRecord)) {
    const path = `lessons.${lessonId}`
    const lessonRecord = requireRecord(value, label, path)
    if (typeof lessonRecord.complete !== 'boolean') {
      fail(label, `${path}.complete`, 'は boolean である必要があります')
    }
    const clipsRecord = requireRecord(lessonRecord.clips, label, `${path}.clips`)
    const clips: Record<string, ManifestClip> = {}
    for (const [hash, clipValue] of Object.entries(clipsRecord)) {
      const clipRecord = requireRecord(clipValue, label, `${path}.clips.${hash}`)
      if (typeof clipRecord.ms !== 'number' || !Number.isFinite(clipRecord.ms) || clipRecord.ms < 0) {
        fail(label, `${path}.clips.${hash}.ms`, 'は 0 以上の数値である必要があります')
      }
      clips[hash] = { ms: clipRecord.ms }
    }
    lessons[lessonId] = { complete: lessonRecord.complete, clips }
  }
  return { version: 1, lang, voices, models, lessons }
}
