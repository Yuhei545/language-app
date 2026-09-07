import { describe, expect, it } from 'vitest'
import {
  buildClipIndex,
  clipHash,
  clipKey,
  clipUrl,
  collectClips,
  emptyManifest,
  isLessonAudioReady,
  validateAudioManifest,
  type AudioManifest,
} from './lessonAudio'
import { loadLessons } from './lessons'

describe('clipHash', () => {
  it('文・言語・声で決まり、前後の空白と速さは無視する', () => {
    const base = clipHash({ text: 'Could I get a coffee?', lang: 'en', voice: 'B' })
    expect(base).toMatch(/^[0-9a-f]{16}$/)
    expect(clipHash({ text: '  Could I get a coffee?  ', lang: 'en', voice: 'B' })).toBe(base)
    expect(clipHash({ text: 'Could I get a coffee?', lang: 'en', voice: 'A' })).not.toBe(base)
    expect(clipHash({ text: 'Could I get a coffee?', lang: 'ko', voice: 'B' })).not.toBe(base)
    expect(clipKey({ text: 'a', lang: 'ja', voice: 'narrator' })).toBe('ja\nnarrator\na')
  })
})

describe('collectClips', () => {
  const lesson = loadLessons('en')[0]

  it('台詞・核・かけら・応用・日本語ナレーションを、声つきで重複なく列挙する', () => {
    const clips = collectClips(lesson, 'en')
    const keys = clips.map(clipKey)
    expect(new Set(keys).size).toBe(keys.length)
    expect(clips.some((clip) => clip.lang === 'ja' && clip.voice === 'narrator')).toBe(true)
    expect(clips.some((clip) => clip.lang === 'en' && clip.voice === 'A')).toBe(true)
    expect(clips.some((clip) => clip.lang === 'en' && clip.voice === 'B')).toBe(true)
    // 日本語は必ずナレーターの声
    expect(clips.filter((clip) => clip.lang === 'ja').every((clip) => clip.voice === 'narrator')).toBe(true)
    // 会話の 1 行目は相手(A)の声で読む
    expect(clips).toContainEqual({ text: lesson.dialogue.turns[0].text, lang: 'en', voice: 'A' })
  })
})

describe('マニフェストと索引', () => {
  const manifest: AudioManifest = {
    version: 1,
    lang: 'en',
    voices: { A: 'Kore', B: 'Puck', narrator: 'Zephyr' },
    models: ['gemini-2.5-flash-preview-tts'],
    lessons: {
      '01-cafe': { complete: true, clips: { aaaa: { ms: 1200 }, bbbb: { ms: 800 } } },
      '02-directions': { complete: false, clips: { cccc: { ms: 500 } } },
    },
  }

  it('complete なレッスンのクリップだけを索引に入れる', () => {
    const index = buildClipIndex([manifest])
    expect(index.get('aaaa')).toEqual({ lang: 'en', lessonId: '01-cafe', hash: 'aaaa', ms: 1200 })
    expect(index.has('cccc')).toBe(false)
    expect(isLessonAudioReady(manifest, '01-cafe')).toBe(true)
    expect(isLessonAudioReady(manifest, '02-directions')).toBe(false)
    expect(isLessonAudioReady(null, '01-cafe')).toBe(false)
  })

  it('URL は base の末尾のスラッシュに関わらず同じ', () => {
    expect(clipUrl('/language-app/', 'en', '01-cafe', 'aaaa')).toBe('/language-app/lessons/en/01-cafe/aaaa.mp3')
    expect(clipUrl('/language-app', 'en', '01-cafe', 'aaaa')).toBe('/language-app/lessons/en/01-cafe/aaaa.mp3')
  })

  it('検証は形の崩れを投げる', () => {
    expect(validateAudioManifest(manifest, 'x')).toEqual(manifest)
    expect(validateAudioManifest(emptyManifest('ko', { A: 'a', B: 'b', narrator: 'n' }), 'x').lessons).toEqual({})
    expect(() => validateAudioManifest({ ...manifest, version: 2 }, 'x')).toThrow('version')
    expect(() => validateAudioManifest({ ...manifest, lessons: { bad: { complete: 'yes', clips: {} } } }, 'x')).toThrow('complete')
  })
})
