import type { LessonDialogue, NewExpression } from './lessonDialogueSchema'
import { buildBackChainActions, planStep, type LessonAction } from './plan'
import { buildSchedule } from './schedule'
import type { LessonItem, LessonStage } from './types'

export type DialogueLessonStepKind = 'intro' | 'breakdown' | 'replay' | 'recall' | 'closing' | 'summary'

export type DialogueLessonStep = {
  kind: DialogueLessonStepKind
  /** 画面表示用。「冒頭の会話」「新しい表現 2/5」「あなたの番」など。 */
  label: string
  speaker?: 'A' | 'B' | 'you'
  actions: LessonAction[]
  item?: LessonItem
  stage?: LessonStage
}

const STAGE_LABELS: Record<Exclude<LessonStage, 0>, string> = {
  1: '5秒後',
  2: '25秒後',
  3: '2分後',
  4: '10分後',
}

export function expressionCue(expression: NewExpression): string {
  return `「${expression.ja}」と言ってみましょう`
}

/** 最初の分解の前に一度だけ流す説明。 */
export const BACK_CHAIN_INSTRUCTION_JA = '後ろから組み立てます。聞こえたら、そのまま繰り返してください'

function dialogueSpeaks(
  dialogue: LessonDialogue,
  lang: 'en' | 'ko',
  rate?: number,
): LessonAction[] {
  return dialogue.turns.flatMap<LessonAction>((turn, index) => [
    { type: 'speak', text: turn.text, lang, voice: turn.speaker, ...(rate !== undefined ? { rate } : {}) },
    ...(index < dialogue.turns.length - 1 ? [{ type: 'gap', ms: 300 } as LessonAction] : []),
  ])
}

/**
 * 会話 1 本を「冒頭の会話 → 分解 → 再生 → 再出題を挟みつつ締めの会話 → まとめ」の手順に落とす。
 * Pimsleur の構成(会話を聞く → 語り手が分解 → 予期と段階的想起 → 自分が片方の役)に対応する。
 */
export function buildDialogueLesson(
  dialogue: LessonDialogue,
  opts: { lang: 'en' | 'ko'; pauseSeconds: number; currentWeek: number },
): { steps: DialogueLessonStep[]; items: LessonItem[] } {
  const { lang } = opts
  const pause: LessonAction = { type: 'pause', ms: opts.pauseSeconds * 1000, recordable: true }

  const items: LessonItem[] = dialogue.new_expressions.map((expression, index) => ({
    id: `dialogue:${index}`,
    kind: 'word',
    cueJa: expressionCue(expression),
    answer: expression.text,
  }))

  const intro: DialogueLessonStep = {
    kind: 'intro',
    label: '冒頭の会話',
    actions: [
      { type: 'speak', text: dialogue.title_ja, lang: 'ja', voice: 'narrator' },
      { type: 'gap', ms: 300 },
      ...dialogueSpeaks(dialogue, lang),
    ],
  }

  const breakdowns: DialogueLessonStep[] = dialogue.new_expressions.map((expression, index) => {
    // その表現を言う人物の声で組み立てる(あなたの役の表現は B、相手の表現は A)
    const speaker = dialogue.turns[expression.turn_index]?.speaker ?? 'A'
    const instruction: LessonAction[] = index === 0
      ? [{ type: 'speak', text: BACK_CHAIN_INSTRUCTION_JA, lang: 'ja', voice: 'narrator' }, { type: 'gap', ms: 300 }]
      : []
    return {
      kind: 'breakdown',
      label: `新しい表現 ${index + 1}/${dialogue.new_expressions.length}`,
      item: items[index],
      stage: 0,
      speaker,
      actions: [
        { type: 'speak', text: expression.note_ja, lang: 'ja', voice: 'narrator' },
        ...instruction,
        ...buildBackChainActions(expression.text, lang, { voice: speaker }),
        { type: 'speak', text: expressionCue(expression), lang: 'ja', voice: 'narrator' },
        pause,
        { type: 'speak', text: expression.text, lang, voice: speaker },
        { type: 'speak', text: 'もう一度', lang: 'ja', voice: 'narrator' },
        pause,
        { type: 'speak', text: expression.text, lang, voice: speaker },
      ],
    }
  })

  const replay: DialogueLessonStep = {
    kind: 'replay',
    label: '会話をもう一度',
    actions: dialogueSpeaks(dialogue, lang, 0.9),
  }

  const recalls: DialogueLessonStep[] = buildSchedule(items)
    .filter((step) => step.stage !== 0)
    .map((step) => ({
      kind: 'recall',
      label: `思い出す(${STAGE_LABELS[step.stage as Exclude<LessonStage, 0>]})`,
      item: step.item,
      stage: step.stage,
      actions: planStep(step, { lang, pauseSeconds: opts.pauseSeconds }),
    }))

  const closings: DialogueLessonStep[] = dialogue.turns.flatMap<DialogueLessonStep>((turn, index) => {
    if (turn.speaker !== 'B') {
      return []
    }
    const previous = index > 0 ? dialogue.turns[index - 1] : null
    return [{
      kind: 'closing',
      label: 'あなたの番',
      speaker: 'you',
      actions: [
        ...(previous ? [{ type: 'speak', text: previous.text, lang, voice: 'A' } as LessonAction] : []),
        { type: 'speak', text: `あなたの番:「${turn.ja}」`, lang: 'ja', voice: 'narrator' },
        pause,
        { type: 'speak', text: turn.text, lang, voice: 'B' },
      ],
    }]
  })

  const summary: DialogueLessonStep = {
    kind: 'summary',
    label: 'おつかれさまでした',
    actions: [
      { type: 'speak', text: 'おつかれさまでした。今日の表現は明日カードに出ます', lang: 'ja', voice: 'narrator' },
    ],
  }

  return { steps: [intro, ...breakdowns, replay, ...recalls, ...closings, summary], items }
}
