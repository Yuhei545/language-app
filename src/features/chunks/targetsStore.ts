import { loadCore } from '../../content/coreSchema'
import {
  getDailyTargets,
  insertDailyTargets,
  listChunkEncounterSummary,
  listVocabItems,
} from '../../services/supabase/db'
import type { Language, VocabItemRow } from '../../services/supabase/types'
import { selectDailyTargets } from './dailyTargets'
import { summaryFromView, type ChunkSummary } from './ledger'
import { ledgerError } from './record'
import { buildChunkRegistry, type Chunk } from './registry'

export function localDay(date = new Date()): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const STORAGE_PREFIX = 'lla.targets.'

export function targetsStorageKey(lang: Language, day: string): string {
  return `${STORAGE_PREFIX}${lang}.${day}`
}

function readStoredKeys(storageKey: string): string[] | null {
  try {
    const raw = localStorage.getItem(storageKey)
    if (!raw) {
      return null
    }
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) && parsed.every((key) => typeof key === 'string') ? parsed : null
  } catch (error) {
    console.warn('今日の狙いの控えを読めませんでした', error)
    return null
  }
}

/** 今日の分を書き、同じ言語の他の日の控えは消す。 */
function writeStoredKeys(lang: Language, storageKey: string, keys: string[]): void {
  try {
    const prefix = `${STORAGE_PREFIX}${lang}.`
    for (let index = localStorage.length - 1; index >= 0; index -= 1) {
      const existing = localStorage.key(index)
      if (existing && existing.startsWith(prefix) && existing !== storageKey) {
        localStorage.removeItem(existing)
      }
    }
    localStorage.setItem(storageKey, JSON.stringify(keys))
  } catch (error) {
    console.warn('今日の狙いの控えを書けませんでした', error)
  }
}

export type LoadedTargets = {
  targets: Chunk[]
  /** 台帳が使えなかったとき(006 未適用など)。狙いはこの端末で決めた仮のもの。 */
  error: Error | null
}

/**
 * 今日の狙いを決める。同じ日は同じ狙い。
 * 控え(localStorage) → DB → 無ければ選んで保存 → 保存後に取り直す(他端末が先に決めていればそちら)。
 */
export async function loadDailyTargets(params: {
  userId: string
  lang: Language
  registry: Chunk[]
  summaries: Map<string, ChunkSummary>
  now?: Date
  rng?: () => number
}): Promise<LoadedTargets> {
  const now = params.now ?? new Date()
  const day = localDay(now)
  const storageKey = targetsStorageKey(params.lang, day)
  const byKey = new Map(params.registry.map((chunk) => [chunk.key, chunk]))
  const resolve = (keys: string[]): Chunk[] => keys
    .map((key) => byKey.get(key))
    .filter((chunk): chunk is Chunk => chunk !== undefined)
  const choose = () => selectDailyTargets({
    registry: params.registry,
    summaries: params.summaries,
    lang: params.lang,
    now: now.getTime(),
    rng: params.rng,
  })

  const stored = readStoredKeys(storageKey)
  if (stored) {
    const targets = resolve(stored)
    if (targets.length > 0) {
      return { targets, error: null }
    }
  }

  try {
    const existing = await getDailyTargets(params.userId, params.lang, day)
    if (existing) {
      const targets = resolve(existing.chunk_keys)
      if (targets.length > 0) {
        writeStoredKeys(params.lang, storageKey, targets.map((chunk) => chunk.key))
        return { targets, error: null }
      }
    }

    const chosen = choose()
    await insertDailyTargets({
      user_id: params.userId,
      lang: params.lang,
      day,
      chunk_keys: chosen.map((chunk) => chunk.key),
    })
    const saved = await getDailyTargets(params.userId, params.lang, day)
    const resolved = saved ? resolve(saved.chunk_keys) : []
    const targets = resolved.length > 0 ? resolved : chosen
    writeStoredKeys(params.lang, storageKey, targets.map((chunk) => chunk.key))
    return { targets, error: null }
  } catch (error) {
    console.error('今日の狙いを保存できませんでした。この端末だけで決めます', error)
    const chosen = choose()
    writeStoredKeys(params.lang, storageKey, chosen.map((chunk) => chunk.key))
    return { targets: chosen, error: ledgerError(error) }
  }
}

export type ChunkContext = {
  registry: Chunk[]
  summaries: Map<string, ChunkSummary>
  targets: Chunk[]
  error: Error | null
}

/** 各モードの読み込みで使う。登録簿・台帳の集計・今日の狙いをまとめて返す。 */
export async function loadChunkContext(params: {
  userId: string
  lang: Language
  vocabItems?: VocabItemRow[]
  now?: Date
}): Promise<ChunkContext> {
  const vocabItems = params.vocabItems ?? await listVocabItems(params.userId, params.lang)
  const registry = buildChunkRegistry(loadCore(params.lang), vocabItems, params.lang)

  let summaries = new Map<string, ChunkSummary>()
  let error: Error | null = null
  try {
    summaries = summaryFromView(await listChunkEncounterSummary(params.userId, params.lang))
  } catch (summaryError) {
    console.error('表現の台帳を読めませんでした', summaryError)
    error = ledgerError(summaryError)
  }

  const loaded = await loadDailyTargets({
    userId: params.userId,
    lang: params.lang,
    registry,
    summaries,
    now: params.now,
  })
  return { registry, summaries, targets: loaded.targets, error: error ?? loaded.error }
}
