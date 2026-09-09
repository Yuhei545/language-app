import type { DialogueLessonStep } from './dialoguePlan'
import { estimateActionsMs } from './estimate'
import type { LessonAction } from './plan'
import type { LessonStep } from './types'

export type RunnableLessonStep = LessonStep | DialogueLessonStep

export type LessonSection = {
  index: number
  label: string
  kind: 'intro' | 'line' | 'replay' | 'closing' | 'summary' | 'other'
}

const DIALOGUE_LABEL_PATTERN = /^会話 (\d+)\/(\d+)/

function isSpecialSectionKind(
  kind: DialogueLessonStep['kind'],
): kind is 'intro' | 'replay' | 'closing' | 'summary' {
  return kind === 'intro' || kind === 'replay' || kind === 'closing' || kind === 'summary'
}

/** 目次。連続する step を「区切り」ごとにまとめる。index はその区切りの最初の step。 */
export function buildSections(steps: RunnableLessonStep[]): LessonSection[] {
  const sections: LessonSection[] = []
  let currentDialogueNumber: string | null = null

  steps.forEach((step, index) => {
    if (!('actions' in step)) {
      sections.push({ index, label: step.item.cueJa, kind: 'other' })
      currentDialogueNumber = null
      return
    }

    const dialogueMatch = step.label.match(DIALOGUE_LABEL_PATTERN)
    const startsDialogueSection = dialogueMatch !== null && dialogueMatch[1] !== currentDialogueNumber

    if (isSpecialSectionKind(step.kind)) {
      sections.push({ index, label: step.label, kind: step.kind })
      currentDialogueNumber = null
    } else if (startsDialogueSection && dialogueMatch) {
      const dialogueLabel = `会話 ${dialogueMatch[1]}/${dialogueMatch[2]}`
      sections.push({ index, label: dialogueLabel, kind: 'line' })
      currentDialogueNumber = dialogueMatch[1]
    } else if (sections.length === 0) {
      sections.push({ index, label: step.label, kind: 'other' })
    }

    if (step.kind === 'line' && step.item) {
      const section = sections[sections.length - 1]
      const lineMatch = step.label.match(DIALOGUE_LABEL_PATTERN)
      if (section?.kind === 'line' && lineMatch?.[1] === currentDialogueNumber) {
        section.label = `会話 ${lineMatch[1]}/${lineMatch[2]}  ${step.item.answer}`
      }
    }
  })

  return sections
}

/** 各 step の開始時刻(ミリ秒、見積もり)。 */
export function stepStartsMs(
  steps: RunnableLessonStep[],
  actionsOf: (step: RunnableLessonStep) => LessonAction[],
): number[] {
  let elapsedMs = 0
  return steps.map((step) => {
    const startsAt = elapsedMs
    elapsedMs += estimateActionsMs(actionsOf(step))
    return startsAt
  })
}

/** 今の step から deltaMs だけ前後にずらした先の step。 */
export function stepAtOffset(starts: number[], fromIndex: number, deltaMs: number): number {
  if (deltaMs === 0) {
    return fromIndex
  }
  if (starts.length === 0) {
    return 0
  }

  const from = Math.max(0, Math.min(fromIndex, starts.length - 1))
  const target = starts[from] + deltaMs
  if (deltaMs < 0) {
    let result = 0
    for (let index = 0; index < starts.length; index += 1) {
      if (starts[index] > target) {
        break
      }
      result = index
    }
    return result === from ? Math.max(0, from - 1) : result
  }

  let result = starts.length - 1
  for (let index = 0; index < starts.length; index += 1) {
    if (starts[index] >= target) {
      result = index
      break
    }
  }
  return result === from ? Math.min(starts.length - 1, from + 1) : result
}

/** 今の step が属する区切り。 */
export function sectionIndexOf(sections: LessonSection[], stepIndex: number): number {
  if (sections.length === 0) {
    return -1
  }

  let result = 0
  for (let index = 1; index < sections.length; index += 1) {
    if (sections[index].index > stepIndex) {
      break
    }
    result = index
  }
  return result
}
