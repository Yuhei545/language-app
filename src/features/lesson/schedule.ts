import type { LessonItem, LessonStage, LessonStep } from './types'

export const RECALL_OFFSETS_SEC = [5, 25, 120, 600] as const

type Candidate = {
  itemIndex: number
  stage: LessonStage
  targetTime: number
}

export function buildSchedule(
  items: LessonItem[],
  opts: { slotSeconds?: number; introSpacingSlots?: number } = {},
): LessonStep[] {
  if (items.length === 0) {
    return []
  }

  const slotSeconds = opts.slotSeconds ?? 20
  const introSpacingSlots = opts.introSpacingSlots ?? 2
  if (!Number.isFinite(slotSeconds) || slotSeconds <= 0) {
    throw new Error('slotSeconds は0より大きい数である必要があります')
  }
  if (!Number.isInteger(introSpacingSlots) || introSpacingSlots < 0) {
    throw new Error('introSpacingSlots は0以上の整数である必要があります')
  }

  const firstTimes = new Array<number | null>(items.length).fill(null)
  const nextStages = new Array<number>(items.length).fill(0)
  const steps: LessonStep[] = []
  const totalSteps = items.length * 5

  while (steps.length < totalSteps) {
    const candidates: Candidate[] = items.flatMap((_item, itemIndex) => {
      const nextStage = nextStages[itemIndex]
      if (nextStage > 4) {
        return []
      }
      const stage = nextStage as LessonStage

      const firstTime = firstTimes[itemIndex]
      return [{
        itemIndex,
        stage,
        targetTime: stage === 0
          ? itemIndex * introSpacingSlots * slotSeconds
          : (firstTime ?? 0) + RECALL_OFFSETS_SEC[stage - 1],
      }]
    })

    candidates.sort((left, right) => (
      left.targetTime - right.targetTime
      || Number(left.stage === 0) - Number(right.stage === 0)
      || left.itemIndex - right.itemIndex
    ))

    let selected = candidates[0]
    const previous = steps[steps.length - 1]
    const beforePrevious = steps[steps.length - 2]
    if (
      previous
      && beforePrevious
      && previous.item.id === items[selected.itemIndex].id
      && beforePrevious.item.id === items[selected.itemIndex].id
    ) {
      const alternative = candidates.find(
        (candidate) => items[candidate.itemIndex].id !== items[selected.itemIndex].id,
      )
      if (alternative) {
        selected = alternative
      }
    }

    const currentTime = steps.length * slotSeconds
    if (selected.stage === 0) {
      firstTimes[selected.itemIndex] = currentTime
    }
    steps.push({ item: items[selected.itemIndex], stage: selected.stage })
    nextStages[selected.itemIndex] = selected.stage + 1
  }

  return steps
}
