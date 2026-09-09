import { describe, expect, it } from 'vitest'
import { loadLessons } from '../../content/lessons'
import { buildDialogueLesson } from './dialoguePlan'
import { buildSections, stepAtOffset } from './navigation'

describe('buildSections', () => {
  it('同梱レッスンを冒頭・各会話行・再生・締め・まとめの区切りにまとめる', () => {
    const lesson = loadLessons('en').find((item) => item.id === '01-cafe')
    expect(lesson).toBeDefined()
    if (!lesson) {
      return
    }

    const { steps } = buildDialogueLesson(lesson.dialogue, {
      lang: 'en',
      pauseSeconds: 4,
      currentWeek: 1,
      review: lesson.review,
    })
    const sections = buildSections(steps)
    const lineSections = sections.filter((section) => section.kind === 'line')

    expect(sections[0].label).toBe('冒頭の会話')
    expect(lineSections).toHaveLength(lesson.dialogue.turns.length)
    expect(lineSections[0].label).toMatch(/^会話 1\/8/)
    expect(lineSections[0].label).toContain(lesson.dialogue.turns[0].text)
    expect(sections.at(-1)?.label).toBe('おつかれさまでした')
  })
})

describe('stepAtOffset', () => {
  const starts = [0, 10_000, 20_000, 30_000]

  it('先頭より前は先頭、末尾より後は末尾に丸める', () => {
    expect(stepAtOffset(starts, 0, -30_000)).toBe(0)
    expect(stepAtOffset(starts, starts.length - 1, 30_000)).toBe(starts.length - 1)
  })

  it('オフセット先が同じ step なら隣の step へ進める', () => {
    expect(stepAtOffset(starts, 2, -1)).toBe(1)
    expect(stepAtOffset(starts, 1, 1)).toBe(2)
    expect(stepAtOffset(starts, 2, 0)).toBe(2)
  })
})
