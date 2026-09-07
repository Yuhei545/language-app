import { describe, expect, it } from 'vitest'
import type { BundledLesson } from '../../content/lessonSchema'
import {
  accuracyFromReport,
  isPassed,
  lessonAfter,
  lessonStatuses,
  selectNextLesson,
  toCurriculumProgress,
  type CurriculumProgress,
} from './curriculum'

function lesson(id: string, order: number): BundledLesson {
  return {
    version: 1,
    id,
    order,
    scene_ja: id,
    dialogue: { title_ja: id, scene_ja: id, turns: [], new_expressions: [] },
    review: [],
  }
}

function progress(curriculumId: string, overrides: Partial<CurriculumProgress> = {}): CurriculumProgress {
  return {
    curriculumId,
    dialogueId: `row-${curriculumId}`,
    timesCompleted: 1,
    lastCompletedAt: '2026-09-06T00:00:00.000Z',
    bestPromptAccuracy: 0.8,
    lastPromptAccuracy: 0.8,
    ...overrides,
  }
}

const lessons = [lesson('01-a', 1), lesson('02-b', 2), lesson('03-c', 3)]

describe('自己申告と合否', () => {
  it('8 割以上で合格', () => {
    expect(accuracyFromReport('most')).toBe(0.8)
    expect(isPassed(progress('01-a', { bestPromptAccuracy: 0.8 }))).toBe(true)
    expect(isPassed(progress('01-a', { bestPromptAccuracy: 0.5 }))).toBe(false)
    expect(isPassed(progress('01-a', { timesCompleted: 0, bestPromptAccuracy: 1 }))).toBe(false)
    expect(isPassed(undefined)).toBe(false)
  })

  it('DB の行を進み具合に変える(生成レッスンは対象外)', () => {
    expect(toCurriculumProgress({
      id: 'row', curriculum_id: '01-a', times_completed: 2, last_completed_at: null, best_prompt_accuracy: 1, last_prompt_accuracy: 0.5,
    })).toMatchObject({ curriculumId: '01-a', dialogueId: 'row', timesCompleted: 2, bestPromptAccuracy: 1 })
    expect(toCurriculumProgress({
      id: 'row', curriculum_id: null, times_completed: 0, last_completed_at: null, best_prompt_accuracy: null, last_prompt_accuracy: null,
    })).toBeNull()
  })
})

describe('lessonStatuses / selectNextLesson', () => {
  it('音声が無ければ locked、未着手は new、届かなければ retry、合格は passed', () => {
    const statuses = lessonStatuses(
      lessons,
      [progress('01-a'), progress('02-b', { bestPromptAccuracy: 0.5 })],
      (id) => id !== '03-c',
    )
    expect(statuses.map((status) => status.kind)).toEqual(['passed', 'retry', 'locked'])
  })

  it('次は順番に、音声があり合格していない最初のもの', () => {
    const statuses = lessonStatuses(lessons, [progress('01-a')], () => true)
    expect(selectNextLesson(statuses)?.lesson.id).toBe('02-b')
  })

  it('全部合格なら、いちばん昔に終えたものを復習に。音声が無ければ null', () => {
    const statuses = lessonStatuses(lessons, [
      progress('01-a', { lastCompletedAt: '2026-09-05T00:00:00.000Z' }),
      progress('02-b', { lastCompletedAt: '2026-09-01T00:00:00.000Z' }),
      progress('03-c', { lastCompletedAt: '2026-09-06T00:00:00.000Z' }),
    ], () => true)
    expect(selectNextLesson(statuses)?.lesson.id).toBe('02-b')
    expect(selectNextLesson(lessonStatuses(lessons, [], () => false))).toBeNull()
  })

  it('合格後の次は、順番で次の未合格を優先する', () => {
    const statuses = lessonStatuses(lessons, [progress('01-a'), progress('02-b')], () => true)
    expect(lessonAfter(statuses, '01-a')?.lesson.id).toBe('03-c')
    expect(lessonAfter(statuses, '03-c')?.lesson.id).toBe('01-a')
  })
})
