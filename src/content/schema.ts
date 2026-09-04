export type BundledVocab = {
  text: string
  emoji: string
  category: 'toolbox' | 'baby' | 'glue'
  hint_ja: string
  example: string
}

const categories = new Set<BundledVocab['category']>(['toolbox', 'baby', 'glue'])
const stringFields = ['text', 'emoji', 'hint_ja', 'example'] as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function validateWeek(json: unknown, label: string): BundledVocab[] {
  if (!Array.isArray(json)) {
    throw new Error(`${label}: 語彙データは配列である必要があります`)
  }

  return json.map((item, index) => {
    if (!isRecord(item)) {
      throw new Error(`${label}: ${index + 1}件目の要素はオブジェクトである必要があります`)
    }

    for (const field of stringFields) {
      if (typeof item[field] !== 'string') {
        throw new Error(`${label}: ${index + 1}件目の必須フィールド「${field}」がないか、文字列ではありません`)
      }
    }

    if (typeof item.category !== 'string' || !categories.has(item.category as BundledVocab['category'])) {
      throw new Error(`${label}: ${index + 1}件目のcategory「${String(item.category)}」が不正です`)
    }

    return {
      text: item.text as string,
      emoji: item.emoji as string,
      category: item.category as BundledVocab['category'],
      hint_ja: item.hint_ja as string,
      example: item.example as string,
    }
  })
}
