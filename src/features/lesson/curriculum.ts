import type { BundledLesson } from '../../content/lessonSchema'
import type { CurriculumProgressRow } from '../../services/supabase/types'

/** 応用の合図の自己申告がこの割合以上なら合格。本家の「70〜80% で次へ」に合わせる。 */
export const PASS_THRESHOLD = 0.8

/** 終了時の自己申告。応用の合図 16 個のうち言えたのは? */
export type SelfReport = 'all' | 'most' | 'half' | 'few'

export const SELF_REPORT_ACCURACY: Record<SelfReport, number> = {
  all: 1,
  most: 0.8,
  half: 0.5,
  few: 0.25,
}

export const SELF_REPORT_LABELS: Record<SelfReport, string> = {
  all: 'ほぼ全部言えた',
  most: '8 割くらい',
  half: '半分くらい',
  few: 'それ以下',
}

export function accuracyFromReport(report: SelfReport): number {
  return SELF_REPORT_ACCURACY[report]
}

export type CurriculumProgress = {
  curriculumId: string
  dialogueId: string
  timesCompleted: number
  lastCompletedAt: string | null
  bestPromptAccuracy: number | null
  lastPromptAccuracy: number | null
}

export function toCurriculumProgress(row: CurriculumProgressRow): CurriculumProgress | null {
  if (!row.curriculum_id) {
    return null
  }
  return {
    curriculumId: row.curriculum_id,
    dialogueId: row.id,
    timesCompleted: row.times_completed,
    lastCompletedAt: row.last_completed_at,
    bestPromptAccuracy: row.best_prompt_accuracy,
    lastPromptAccuracy: row.last_prompt_accuracy,
  }
}

export function isPassed(progress: CurriculumProgress | undefined): boolean {
  return progress !== undefined
    && progress.timesCompleted > 0
    && progress.bestPromptAccuracy !== null
    && progress.bestPromptAccuracy >= PASS_THRESHOLD
}

/**
 * 一覧の状態。
 * - locked: 音声がまだ用意されていない
 * - new: 未着手
 * - retry: やったが 8 割に届いていない
 * - passed: 合格
 */
export type CurriculumStatusKind = 'locked' | 'new' | 'retry' | 'passed'

export type CurriculumStatus = {
  lesson: BundledLesson
  /** 0 始まり。表示は index + 1。 */
  index: number
  kind: CurriculumStatusKind
  audioReady: boolean
  progress?: CurriculumProgress
}

export function lessonStatuses(
  lessons: BundledLesson[],
  progress: CurriculumProgress[],
  audioReady: (lessonId: string) => boolean,
): CurriculumStatus[] {
  const byId = new Map(progress.map((item) => [item.curriculumId, item]))
  return lessons.map((lesson, index) => {
    const ready = audioReady(lesson.id)
    const row = byId.get(lesson.id)
    const kind: CurriculumStatusKind = !ready
      ? 'locked'
      : isPassed(row)
        ? 'passed'
        : row && row.timesCompleted > 0
          ? 'retry'
          : 'new'
    return { lesson, index, kind, audioReady: ready, progress: row }
  })
}

/**
 * 次に出すレッスン。順番に、音声があり合格していない最初のもの。
 * 全部合格なら、いちばん昔に終えたものを復習として出す。音声のあるレッスンが無ければ null。
 */
export function selectNextLesson(statuses: CurriculumStatus[]): CurriculumStatus | null {
  const pending = statuses.find((status) => status.audioReady && status.kind !== 'passed')
  if (pending) {
    return pending
  }
  const passed = statuses.filter((status) => status.audioReady && status.kind === 'passed')
  if (passed.length === 0) {
    return null
  }
  return [...passed].sort((left, right) => (
    (left.progress?.lastCompletedAt ?? '').localeCompare(right.progress?.lastCompletedAt ?? '')
  ))[0]
}

/** 合格したあとの「次のレッスン」。順番で次の未合格を優先し、無ければ selectNextLesson と同じ。 */
export function lessonAfter(statuses: CurriculumStatus[], lessonId: string): CurriculumStatus | null {
  const index = statuses.findIndex((status) => status.lesson.id === lessonId)
  const later = statuses.slice(index + 1).find((status) => status.audioReady && status.kind !== 'passed')
  return later ?? selectNextLesson(statuses.filter((status) => status.lesson.id !== lessonId))
}
