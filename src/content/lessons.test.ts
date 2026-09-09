import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { NEW_EXPRESSION_RANGE } from '../features/lesson/lessonDialogueSchema'
import { clipHash, collectClips, collectClipsAt } from './lessonAudio'
import { knownWordsUpTo, loadAudioManifest, loadLessons } from './lessons'
import { lintLesson, MIN_PROMPTS_PER_LESSON } from './lessonSchema'

const LANGS = ['en', 'ko'] as const

/**
 * 音声ファイルの場所。テストの中では import.meta.url が http になる(Vite が配信する形)ので、
 * ファイルの場所は作業ディレクトリ(プロジェクトの根)から組み立てる。
 */
function clipPath(lang: 'en' | 'ko', lessonId: string, hash: string): string {
  return join(process.cwd(), 'public', 'lessons', lang, lessonId, `${hash}.mp3`)
}

for (const lang of LANGS) {
  describe(`同梱レッスン(${lang})`, () => {
    const lessons = loadLessons(lang)

    it('order が 1 から連続し、id が一意', () => {
      expect(lessons.map((lesson) => lesson.order)).toEqual(lessons.map((_, index) => index + 1))
      expect(new Set(lessons.map((lesson) => lesson.id)).size).toBe(lessons.length)
    })

    it('新しい表現が先行レッスンと重複しない', () => {
      const seen = new Map<string, string>()
      for (const lesson of lessons) {
        for (const expression of lesson.dialogue.new_expressions) {
          const key = expression.text.trim().toLowerCase()
          expect(seen.get(key), `${lesson.id}: 「${expression.text}」は ${seen.get(key)} で既に教えている`).toBeUndefined()
          seen.set(key, lesson.id)
        }
      }
    })

    for (const lesson of lessons) {
      describe(lesson.id, () => {
        const earlier = lessons.filter((item) => item.order < lesson.order)

        it('内容の検査に通る(既知語は累積、復習は出典に含まれる)', () => {
          const issues = lintLesson(lesson, { lang, knownWords: knownWordsUpTo(lang, lessons, lesson.order), earlier })
          expect(issues.map((issue) => `${issue.code}: ${issue.message}`)).toEqual([])
        })

        it('各行に核と応用があり、合図は 8 以上、新しい表現は 4〜6', () => {
          for (const turn of lesson.dialogue.turns) {
            expect(turn.key?.text.length ?? 0).toBeGreaterThan(0)
            expect(turn.prompts?.length ?? 0).toBeGreaterThanOrEqual(1)
          }
          const promptCount = lesson.dialogue.turns.reduce((total, turn) => total + (turn.prompts?.length ?? 0), 0)
          expect(promptCount).toBeGreaterThanOrEqual(MIN_PROMPTS_PER_LESSON)
          expect(lesson.dialogue.new_expressions.length).toBeGreaterThanOrEqual(NEW_EXPRESSION_RANGE.min)
          expect(lesson.dialogue.new_expressions.length).toBeLessThanOrEqual(NEW_EXPRESSION_RANGE.max)
        })

        it('クリップの集合は間の長さに依らない', () => {
          const short = collectClipsAt(lesson, lang, 2).map(clipHash).sort()
          const long = collectClipsAt(lesson, lang, 8).map(clipHash).sort()
          expect(short).toEqual(long)
        })
      })
    }

    describe('音声マニフェスト', () => {
      const manifest = loadAudioManifest(lang)

      it('マニフェストに無いレッスンは未準備、あるレッスンは現在のクリップ集合と一致する', () => {
        if (!manifest) {
          return
        }
        expect(manifest.lang).toBe(lang)
        for (const lesson of lessons) {
          const entry = manifest.lessons[lesson.id]
          if (!entry) {
            continue
          }
          const hashes = new Set(collectClips(lesson, lang).map(clipHash))
          const stale = Object.keys(entry.clips).filter((hash) => !hashes.has(hash))
          expect(stale, `${lesson.id}: 文面を直した後の古いクリップ。npm run lessons:audio -- --prune を実行`).toEqual([])
          if (entry.complete) {
            const missing = [...hashes].filter((hash) => !entry.clips[hash] || !existsSync(clipPath(lang, lesson.id, hash)))
            expect(missing, `${lesson.id}: complete なのに mp3 が無い`).toEqual([])
          }
        }
        for (const lessonId of Object.keys(manifest.lessons)) {
          expect(lessons.some((lesson) => lesson.id === lessonId), `マニフェストに無いレッスン ${lessonId}`).toBe(true)
        }
      })
    })
  })
}
