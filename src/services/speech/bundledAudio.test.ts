import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AudioManifest } from '../../content/lessonAudio'
import { clipHash } from '../../content/lessonAudio'

const manifestMock = vi.hoisted(() => ({ loadAudioManifest: vi.fn() }))
vi.mock('../../content/lessons', () => ({ loadAudioManifest: manifestMock.loadAudioManifest }))

const clip = { text: 'Could I get a coffee, please?', lang: 'en' as const, voice: 'B' as const }
const hash = clipHash(clip)

function manifest(): AudioManifest {
  return {
    version: 1,
    lang: 'en',
    voices: { A: 'Kore', B: 'Puck', narrator: 'Zephyr' },
    models: ['gemini-2.5-flash-preview-tts'],
    lessons: {
      '01-cafe': { complete: true, clips: { [hash]: { ms: 1200 } } },
      '02-directions': { complete: false, clips: { deadbeef00000000: { ms: 500 } } },
    },
  }
}

beforeEach(async () => {
  manifestMock.loadAudioManifest.mockImplementation((lang: string) => (lang === 'en' ? manifest() : null))
  const { resetBundledAudioForTests } = await import('./bundledAudio')
  resetBundledAudioForTests()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('findBundledClip', () => {
  it('文・言語・声で引ける。未完成のレッスンのクリップは引けない', async () => {
    const { findBundledClip, hasBundledClip } = await import('./bundledAudio')
    expect(findBundledClip(clip.text, 'en', 'B')).toEqual({ lang: 'en', lessonId: '01-cafe', hash, ms: 1200 })
    expect(findBundledClip(clip.text, 'en', 'A')).toBeNull()
    expect(hasBundledClip('nothing', 'ko', 'A')).toBe(false)
  })
})

describe('getBundledAudio', () => {
  it('取得して保存し、2 回目は通信しない', async () => {
    const bytes = new Uint8Array([1, 2, 3]).buffer
    const fetchMock = vi.fn(async () => new Response(bytes, { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const { findBundledClip, getBundledAudio, bundledClipUrl } = await import('./bundledAudio')
    const ref = findBundledClip(clip.text, 'en', 'B')!

    // base(/language-app/)の下に置かれる
    expect(bundledClipUrl(ref)).toBe(`${import.meta.env.BASE_URL}lessons/en/01-cafe/${hash}.mp3`)
    const first = await getBundledAudio(ref)
    const second = await getBundledAudio(ref)
    expect(new Uint8Array(first)).toEqual(new Uint8Array([1, 2, 3]))
    expect(new Uint8Array(second)).toEqual(new Uint8Array([1, 2, 3]))
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('取得に失敗したら投げる(内蔵音声には落とさない)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 404 })))
    const { findBundledClip, getBundledAudio } = await import('./bundledAudio')
    const ref = { ...findBundledClip(clip.text, 'en', 'B')!, hash: 'missing' }

    await expect(getBundledAudio(ref)).rejects.toThrow('HTTP 404')
  })
})

describe('prefetchBundledClips', () => {
  it('進み具合を知らせ、失敗はまとめて最後に投げる', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.stubGlobal('fetch', vi.fn(async (url: string) => (
      url.includes('bad') ? new Response(null, { status: 500 }) : new Response(new Uint8Array([9]).buffer, { status: 200 })
    )))
    const { prefetchBundledClips } = await import('./bundledAudio')
    const refs = [
      { lang: 'en' as const, lessonId: '01-cafe', hash: 'good1', ms: 100 },
      { lang: 'en' as const, lessonId: '01-cafe', hash: 'bad2', ms: 100 },
      { lang: 'en' as const, lessonId: '01-cafe', hash: 'good3', ms: 100 },
    ]
    const progress: Array<[number, number]> = []

    await expect(prefetchBundledClips(refs, { onProgress: (done, total) => progress.push([done, total]) }))
      .rejects.toThrow('1 件取得できませんでした')
    expect(progress[0]).toEqual([0, 3])
    expect(progress[progress.length - 1]).toEqual([3, 3])
    consoleError.mockRestore()
  })
})
