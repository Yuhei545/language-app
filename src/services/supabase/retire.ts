import retiredEnglish from '../../content/en/retired.json'
import { getVocabProgress, listVocabItems, upsertVocabProgressBulk } from './db'
import type { Language, VocabProgressInsert } from './types'

/** 引退させた語は「知っている」扱いにし、復習にはこの日まで出さない(約1年後)。 */
const RETIRED_REVIEW_DELAY_MS = 365 * 24 * 60 * 60 * 1000
const RETIRED_CORRECT_COUNT = 5

/**
 * 同梱コンテンツを差し替えたとき、旧コンテンツの語をカードに出さないようにする。
 * データは消さず、`vocab_progress` を known にするだけなので、後で戻せる。
 * 既に known の語には触らないので、ログインごとに呼んでも無駄な書き込みは起きない。
 *
 * @returns 今回 known にした語の数
 */
export async function retireVocab(
  userId: string,
  lang: Language,
  retiredTexts: string[],
): Promise<number> {
  if (retiredTexts.length === 0) {
    return 0
  }

  const retiredSet = new Set(retiredTexts)
  const items = await listVocabItems(userId, lang)
  const targets = items.filter((item) => retiredSet.has(item.text))
  if (targets.length === 0) {
    return 0
  }

  const progressRows = await getVocabProgress(userId, targets.map((item) => item.id))
  const knownIds = new Set(
    progressRows.filter((row) => row.status === 'known').map((row) => row.vocab_item_id),
  )
  const now = new Date()
  const nextReview = new Date(now.getTime() + RETIRED_REVIEW_DELAY_MS).toISOString()

  const rows: VocabProgressInsert[] = targets
    .filter((item) => !knownIds.has(item.id))
    .map((item) => ({
      user_id: userId,
      vocab_item_id: item.id,
      status: 'known',
      correct_count: RETIRED_CORRECT_COUNT,
      last_reviewed_at: now.toISOString(),
      next_review_at: nextReview,
    }))

  if (rows.length === 0) {
    return 0
  }

  await upsertVocabProgressBulk(rows)
  return rows.length
}

/**
 * 英語の週1〜4を基礎語から実践フレーズに差し替えた(2026-09-05)際の旧語一覧を引退させる。
 * ログイン後の同梱語彙投入のあとに呼ぶ。
 */
export async function retireOutdatedEnglish(userId: string): Promise<number> {
  if (!Array.isArray(retiredEnglish) || retiredEnglish.some((text) => typeof text !== 'string')) {
    throw new Error('content/en/retired.json は文字列の配列である必要があります')
  }

  try {
    return await retireVocab(userId, 'en', retiredEnglish)
  } catch (error) {
    console.error('旧・英語コンテンツの引退処理に失敗しました', error)
    throw error
  }
}
