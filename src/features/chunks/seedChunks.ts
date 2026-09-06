import { loadCore, type CorePhrasal, type CoreVocab, type CoreWord } from '../../content/coreSchema'
import { upsertVocabItems } from '../../services/supabase/db'
import type { Language, VocabItemInsert } from '../../services/supabase/types'
import { slotPool } from '../mixing/combinations'
import { renderPattern } from '../mixing/particles'
import { chunkKeyForFrame, chunkKeyForPhrasal, frameDisplay, frameHintJa } from './registry'

/** 週の習得率(週を進める 80% の判定)に混ぜないため、型・句動詞のカードは週 0 に入れる。 */
export const CHUNK_SEED_WEEK = 0
export const FRAME_EMOJI = '🧩'

/** 句動詞の例文。型の手書き例文にあればそれ、無ければ句動詞のスロットを持つ型で組み立てる。 */
export function phrasalExample(word: CorePhrasal, core: CoreVocab): string {
  const needle = word.text.toLowerCase()
  for (const frame of core.frames) {
    const hit = frame.examples.find((example) => example.text.toLowerCase().includes(needle))
    if (hit) {
      return hit.text
    }
  }

  const slot = `phrasal:${word.takes}`
  const frame = core.frames.find((candidate) => candidate.slots.includes(slot))
  if (!frame) {
    return word.text
  }
  const words: CoreWord[] = []
  for (const frameSlot of frame.slots) {
    if (frameSlot === slot) {
      words.push(word)
      continue
    }
    const [first] = slotPool(core, frameSlot)
    if (!first) {
      return word.text
    }
    words.push(first)
  }
  return renderPattern(frame, words)
}

/** 型と句動詞をカードにする行。同じ見せ方の型(___ was ___. が 2 つ)は最初の 1 つだけ。 */
export function buildChunkSeedRows(core: CoreVocab, lang: Language, userId: string): VocabItemInsert[] {
  const rows: VocabItemInsert[] = []
  const texts = new Set<string>()
  const push = (row: VocabItemInsert) => {
    if (texts.has(row.text)) {
      return
    }
    texts.add(row.text)
    rows.push(row)
  }

  for (const frame of core.frames) {
    const display = frameDisplay(frame)
    push({
      user_id: userId,
      lang,
      week: CHUNK_SEED_WEEK,
      text: display,
      emoji: FRAME_EMOJI,
      hint_ja: frameHintJa(frame),
      example: frame.examples[0]?.text ?? display,
      category: 'core',
      source: 'bundled',
      chunk_key: chunkKeyForFrame(frame),
    })
  }

  for (const word of core.phrasal) {
    push({
      user_id: userId,
      lang,
      week: CHUNK_SEED_WEEK,
      text: word.text,
      emoji: word.emoji,
      hint_ja: word.hint_ja,
      example: phrasalExample(word, core),
      category: 'core',
      source: 'bundled',
      chunk_key: chunkKeyForPhrasal(word.text, lang),
    })
  }

  return rows
}

/** 型・句動詞をカードとして投入する。既にある text は触らない(upsertVocabItems が重複を無視)。 */
export async function seedCoreChunks(userId: string, lang: Language): Promise<void> {
  try {
    const rows = buildChunkSeedRows(loadCore(lang), lang, userId)
    if (rows.length === 0) {
      return
    }
    await upsertVocabItems(rows)
  } catch (error) {
    console.error(`型・句動詞のカード投入に失敗しました(${lang})`, error)
    throw error
  }
}
