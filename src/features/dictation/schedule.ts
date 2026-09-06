/**
 * ディクテーションの再出題。忘却曲線(エビングハウス)に沿って、忘れかけた頃にもう一度出す。
 * 箱(box)が上がるほど次までの間隔が長くなる Leitner 方式。
 */
export type DictationStage = 'cloze' | 'full'

export type DictationSchedule = {
  stage: DictationStage
  box: number
  correctStreak: number
  nextReviewAt: string | null
}

/** 箱ごとの日数。0 は当日中にもう一度。 */
export const REVIEW_DAYS = [0, 1, 3, 7, 14, 30] as const
export const MAX_BOX = REVIEW_DAYS.length - 1

/** 穴埋めから全文へ上げる一致率と、連続で必要な回数。 */
export const STAGE_UP = { ratio: 0.9, streak: 2 } as const
/** この一致率を下回ったら、箱を戻して早めにもう一度出す。 */
export const KEEP_RATIO = 0.7

function addDays(from: Date, days: number): string {
  const next = new Date(from)
  next.setDate(next.getDate() + days)
  // 当日中の再出題は 10 分後にする(同じ日にもう一度出したい)
  if (days === 0) {
    next.setMinutes(next.getMinutes() + 10)
  } else {
    next.setHours(4, 0, 0, 0)
  }
  return next.toISOString()
}

/**
 * 答え合わせの結果から次の予定を決める。
 * - 一致率が高い: 箱を 1 つ上げ、間隔を伸ばす。穴埋めで 2 回続けて 9 割なら全文へ
 * - ふつう: 箱は据え置き
 * - 低い: 箱を 0 に戻し、当日中にもう一度
 */
export function nextSchedule(
  current: DictationSchedule,
  ratio: number,
  now: Date = new Date(),
): DictationSchedule {
  if (ratio < KEEP_RATIO) {
    return {
      stage: current.stage,
      box: 0,
      correctStreak: 0,
      nextReviewAt: addDays(now, 0),
    }
  }

  const good = ratio >= STAGE_UP.ratio
  const correctStreak = good ? current.correctStreak + 1 : 0
  const box = good ? Math.min(MAX_BOX, current.box + 1) : current.box
  const stage: DictationStage = (
    current.stage === 'cloze' && correctStreak >= STAGE_UP.streak
  )
    ? 'full'
    : current.stage
  // 段階が上がったら、その文はまた最初の箱から
  const nextBox = stage !== current.stage ? 0 : box

  return {
    stage,
    box: nextBox,
    correctStreak: stage !== current.stage ? 0 : correctStreak,
    nextReviewAt: addDays(now, REVIEW_DAYS[nextBox]),
  }
}

/** 予定日が来ているか。予定が無い(初めて)なら来ている扱い。 */
export function isDue(schedule: { nextReviewAt: string | null }, now: Date = new Date()): boolean {
  if (!schedule.nextReviewAt) {
    return true
  }
  const at = new Date(schedule.nextReviewAt)
  return Number.isNaN(at.getTime()) || at.getTime() <= now.getTime()
}
