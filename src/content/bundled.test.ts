import { describe, expect, it } from 'vitest'
import { loadBundledWeeks } from './index'

const langs = ['en', 'ko'] as const

describe('同梱の週1〜4コンテンツ', () => {
  for (const lang of langs) {
    describe(lang, () => {
      const weeks = loadBundledWeeks(lang)

      it('週1〜4がすべてスキーマを満たす', () => {
        expect(weeks.map((w) => w.week)).toEqual([1, 2, 3, 4])
        for (const { items } of weeks) {
          expect(items.length).toBeGreaterThan(0)
        }
      })

      it('週ごとのカテゴリが設計どおり', () => {
        const categoriesByWeek = weeks.map(
          ({ items }) => [...new Set(items.map((item) => item.category))].sort(),
        )
        expect(categoriesByWeek[0]).toEqual(['toolbox'])
        expect(categoriesByWeek[1]).toEqual(['baby'])
        expect(categoriesByWeek[2]).toEqual(['glue'])
        expect(categoriesByWeek[3]).toEqual(['glue'])
      })

      it('language_progress の一意制約に合わせ、text が言語内で重複しない', () => {
        const allTexts = weeks.flatMap(({ items }) => items.map((item) => item.text))
        expect(new Set(allTexts).size).toBe(allTexts.length)
      })

      it('絵文字・日本語ヒント・例文が空でない', () => {
        for (const { week, items } of weeks) {
          for (const item of items) {
            expect(item.emoji.trim(), `week${week} ${item.text} の emoji`).not.toBe('')
            expect(item.hint_ja.trim(), `week${week} ${item.text} の hint_ja`).not.toBe('')
            expect(item.example.trim(), `week${week} ${item.text} の example`).not.toBe('')
          }
        }
      })

      it('例文がその語を実際に含む', () => {
        for (const { week, items } of weeks) {
          for (const item of items) {
            const head = item.text.split(/[\s.?]/)[0]
            expect(
              item.example.toLowerCase().includes(head.toLowerCase()),
              `week${week}: 例文「${item.example}」に「${head}」が含まれていません`,
            ).toBe(true)
          }
        }
      })
    })
  }
})
