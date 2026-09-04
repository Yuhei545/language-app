import { loadBundledWeeks } from '../../content'
import { upsertVocabItems } from './db'
import type { Language, VocabItemInsert } from './types'

export async function seedBundledVocab(userId: string, lang: Language): Promise<void> {
  try {
    const rows: VocabItemInsert[] = loadBundledWeeks(lang).flatMap(({ week, items }) => (
      items.map((item) => ({
        user_id: userId,
        lang,
        week,
        text: item.text,
        emoji: item.emoji,
        category: item.category,
        hint_ja: item.hint_ja,
        example: item.example,
        source: 'bundled',
      }))
    ))

    await upsertVocabItems(rows)
  } catch (error) {
    console.error(`同梱語彙の投入に失敗しました（${lang}）`, error)
    throw error
  }
}
