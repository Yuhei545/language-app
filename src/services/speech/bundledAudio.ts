import {
  buildClipIndex,
  clipHash,
  clipUrl,
  type BundledClipRef,
  type ClipLang,
  type ClipVoice,
} from '../../content/lessonAudio'
import { loadAudioManifest } from '../../content/lessons'
import { audioCacheKey, getCachedAudio, putCachedAudio } from './audioCache'

/**
 * 同梱レッスンの事前合成した音声(public/lessons/{lang}/{lessonId}/{hash}.mp3)。
 * マニフェストから索引を作り、文・言語・声で引く。取得した mp3 は IndexedDB に置き、
 * 2 回目からは通信しない。
 */
let clipIndex: Map<string, BundledClipRef> | null = null
const inFlight = new Map<string, Promise<ArrayBuffer>>()

function getIndex(): Map<string, BundledClipRef> {
  if (!clipIndex) {
    const manifests = (['en', 'ko'] as const)
      .map((lang) => loadAudioManifest(lang))
      .filter((manifest): manifest is NonNullable<typeof manifest> => manifest !== null)
    clipIndex = buildClipIndex(manifests)
  }
  return clipIndex
}

export function findBundledClip(text: string, lang: ClipLang, voice: ClipVoice): BundledClipRef | null {
  return getIndex().get(clipHash({ text, lang, voice })) ?? null
}

export function hasBundledClip(text: string, lang: ClipLang, voice: ClipVoice): boolean {
  return findBundledClip(text, lang, voice) !== null
}

function cacheKey(ref: BundledClipRef): string {
  return audioCacheKey({ provider: 'bundled', model: 'mp3', voice: '', lang: ref.lang, text: ref.hash })
}

export function bundledClipUrl(ref: BundledClipRef): string {
  return clipUrl(import.meta.env.BASE_URL, ref.lang, ref.lessonId, ref.hash)
}

/** 端末に無ければ取ってきて保存する。失敗は投げる(内蔵音声には落とさない)。 */
export async function getBundledAudio(ref: BundledClipRef, opts: { signal?: AbortSignal } = {}): Promise<ArrayBuffer> {
  const key = cacheKey(ref)
  const cached = await getCachedAudio(key)
  if (cached) {
    return cached
  }
  const pending = inFlight.get(key)
  if (pending) {
    return pending
  }
  const task = (async () => {
    const response = await fetch(bundledClipUrl(ref), { signal: opts.signal })
    if (!response.ok) {
      throw new Error(`同梱の音声を取得できませんでした(HTTP ${response.status}): ${ref.lessonId}/${ref.hash}`)
    }
    const buffer = await response.arrayBuffer()
    if (buffer.byteLength === 0) {
      throw new Error(`同梱の音声が空でした: ${ref.lessonId}/${ref.hash}`)
    }
    await putCachedAudio(key, buffer)
    return buffer
  })()
  inFlight.set(key, task)
  try {
    return await task
  } finally {
    inFlight.delete(key)
  }
}

export const PREFETCH_CONCURRENCY = 4

/**
 * レッスンの全クリップを先に端末へ入れる。並列 4。失敗はまとめて最後に投げる。
 * onProgress は済んだ数と総数を返す(取得済みも数える)。
 */
export async function prefetchBundledClips(
  refs: BundledClipRef[],
  opts: { onProgress?: (done: number, total: number) => void; signal?: AbortSignal } = {},
): Promise<void> {
  const total = refs.length
  let done = 0
  let next = 0
  const failures: string[] = []
  opts.onProgress?.(0, total)

  const worker = async () => {
    while (next < refs.length) {
      if (opts.signal?.aborted) {
        return
      }
      const ref = refs[next]
      next += 1
      try {
        await getBundledAudio(ref, { signal: opts.signal })
      } catch (error) {
        if (opts.signal?.aborted) {
          return
        }
        console.error('同梱の音声を用意できませんでした', error)
        failures.push(`${ref.lessonId}/${ref.hash}`)
      }
      done += 1
      opts.onProgress?.(done, total)
    }
  }

  await Promise.all(Array.from({ length: Math.min(PREFETCH_CONCURRENCY, refs.length) }, worker))
  if (opts.signal?.aborted) {
    return
  }
  if (failures.length > 0) {
    throw new Error(`音声を ${failures.length} 件取得できませんでした。通信を確認して、もう一度お試しください`)
  }
}

/** テスト用。索引を作り直す。 */
export function resetBundledAudioForTests(): void {
  clipIndex = null
  inFlight.clear()
}
