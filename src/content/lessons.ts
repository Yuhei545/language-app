import { loadCore } from './coreSchema'
import { loadBundledWeeks } from './index'
import { validateAudioManifest, type AudioManifest } from './lessonAudio'
import { lessonExpressions, validateLessonFile, type BundledLesson } from './lessonSchema'

/**
 * 同梱カリキュラム(src/content/{lang}/lessons/*.json)。
 * ファイルを足すだけで読み込まれる(import.meta.glob)。audio-manifest.json は音声の一覧。
 */
const files: Record<'en' | 'ko', Record<string, unknown>> = {
  en: import.meta.glob('./en/lessons/*.json', { eager: true, import: 'default' }) as Record<string, unknown>,
  ko: import.meta.glob('./ko/lessons/*.json', { eager: true, import: 'default' }) as Record<string, unknown>,
}

export const AUDIO_MANIFEST_FILE = 'audio-manifest.json'

function fileName(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1)
}

export function loadLessons(lang: 'en' | 'ko'): BundledLesson[] {
  return Object.entries(files[lang])
    .filter(([path]) => fileName(path) !== AUDIO_MANIFEST_FILE)
    .map(([path, json]) => {
      const label = `${lang}/lessons/${fileName(path)}`
      const lesson = validateLessonFile(json, label)
      if (`${lesson.id}.json` !== fileName(path)) {
        throw new Error(`${label}: id「${lesson.id}」がファイル名と一致しません`)
      }
      return lesson
    })
    .sort((left, right) => left.order - right.order)
}

export function loadAudioManifest(lang: 'en' | 'ko'): AudioManifest | null {
  const entry = Object.entries(files[lang]).find(([path]) => fileName(path) === AUDIO_MANIFEST_FILE)
  return entry ? validateAudioManifest(entry[1], `${lang}/lessons/${AUDIO_MANIFEST_FILE}`) : null
}

function unique(words: string[]): string[] {
  return [...new Set(words.map((word) => word.trim()).filter((word) => word.length > 0))]
}

/**
 * その順番のレッスンで「知っている」と数える語。
 * 週 1〜4 の語、核の語と型の例文、それより前のレッスンで教えた表現(新しい表現 + 核)。
 */
export function knownWordsUpTo(lang: 'en' | 'ko', lessons: BundledLesson[], order: number): string[] {
  const weeks = loadBundledWeeks(lang).flatMap((week) => week.items.map((item) => item.text))
  const core = loadCore(lang)
  const coreWords = [...core.verbs, ...core.nouns, ...core.adjectives, ...core.phrasal].map((word) => word.text)
  const examples = core.frames.flatMap((frame) => frame.examples.map((example) => example.text))
  const earlier = lessons
    .filter((lesson) => lesson.order < order)
    .flatMap((lesson) => lessonExpressions(lesson))
  return unique([...weeks, ...coreWords, ...examples, ...earlier])
}
