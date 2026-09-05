import type { DialogueTurn, LessonDialogue, NewExpression } from './lessonDialogueSchema'
import { buildBackChainActions, planStep, type LessonAction } from './plan'
import { buildSchedule } from './schedule'
import type { LessonItem, LessonStage } from './types'

export type DialogueLessonStepKind =
  | 'intro'
  | 'breakdown'
  | 'line'
  | 'explain'
  | 'prompt'
  | 'recall'
  | 'replay'
  | 'closing'
  | 'summary'

export type DialogueLessonStep = {
  kind: DialogueLessonStepKind
  /** 画面表示用。「冒頭の会話」「会話 2/6: 核の表現」「あなたの番」など。 */
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

function cueFor(ja: string): string {
  return `「${ja}」と言ってみましょう`
}

/** 最初の分解の前に一度だけ流す説明。 */
export const BACK_CHAIN_INSTRUCTION_JA = '後ろから組み立てます。聞こえたら、そのまま繰り返してください'
export const INTRO_NARRATION_JA = '会話を聞いてください。今は分からなくて構いません。このレッスンの終わりには、もう一度聞いて分かるようになり、あなたも会話に参加します'
export const REPLAY_NARRATION_JA = 'もう一度、会話を聞いてください。今度は分かるはずです'
export const SUMMARY_NARRATION_JA = 'おつかれさまでした。今日の表現は明日カードに出ます'

/** 応用の合図(組み替え練習)の項目 id の接頭辞。正答率の集計に使う。 */
export const PROMPT_ITEM_PREFIX = 'prompt:'

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

function itemTurnIndex(item: LessonItem): number {
  const match = /^(?:key|line):(\d+)$/.exec(item.id)
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER
}

/**
 * 1 行分の学習ステップ。
 * 核の表現(あれば) → 文全体 → 解説(あれば) → 応用の合図(0〜2)。
 * 核と文全体は Pimsleur 式の逆順組み立て(全体 → 末尾から+繰り返す間 → 全体)で、その行の話者の声で読む。
 */
function buildTurnSteps(
  turn: DialogueTurn,
  index: number,
  total: number,
  lang: 'en' | 'ko',
  pause: LessonAction,
  items: LessonItem[],
): DialogueLessonStep[] {
  const speaker = turn.speaker
  const label = `会話 ${index + 1}/${total}`
  const steps: DialogueLessonStep[] = []
  const instruction: LessonAction[] = index === 0
    ? [{ type: 'speak', text: BACK_CHAIN_INSTRUCTION_JA, lang: 'ja', voice: 'narrator' }, { type: 'gap', ms: 300 }]
    : []

  if (turn.key) {
    const keyItem: LessonItem = {
      id: `key:${index}`,
      kind: 'word',
      cueJa: cueFor(turn.key.ja),
      answer: turn.key.text,
    }
    items.push(keyItem)
    steps.push({
      kind: 'breakdown',
      label: `${label}: 核の表現`,
      speaker,
      item: keyItem,
      stage: 0,
      actions: [
        { type: 'speak', text: `「${turn.key.ja}」は、こう言います`, lang: 'ja', voice: 'narrator' },
        ...instruction,
        ...buildBackChainActions(turn.key.text, lang, { voice: speaker }),
        { type: 'speak', text: cueFor(turn.key.ja), lang: 'ja', voice: 'narrator' },
        pause,
        { type: 'speak', text: turn.key.text, lang, voice: speaker },
      ],
    })
  }

  const lineItem: LessonItem = {
    id: `line:${index}`,
    kind: 'word',
    cueJa: cueFor(turn.ja),
    answer: turn.text,
  }
  items.push(lineItem)
  const role = speaker === 'B' ? 'あなたの役' : '相手'
  steps.push({
    kind: 'line',
    label: `${label}: 文全体`,
    speaker,
    item: lineItem,
    stage: 0,
    actions: [
      { type: 'speak', text: `${role}の台詞です。「${turn.ja}」`, lang: 'ja', voice: 'narrator' },
      ...(turn.key ? [] : instruction),
      ...buildBackChainActions(turn.text, lang, { voice: speaker }),
      { type: 'speak', text: cueFor(turn.ja), lang: 'ja', voice: 'narrator' },
      pause,
      { type: 'speak', text: turn.text, lang, voice: speaker },
    ],
  })

  const note = (turn.note_ja ?? '').trim()
  if (note.length > 0) {
    steps.push({
      kind: 'explain',
      label: `${label}: 解説`,
      actions: [{ type: 'speak', text: note, lang: 'ja', voice: 'narrator' }],
    })
  }

  const prompts = turn.prompts ?? []
  prompts.forEach((prompt, promptIndex) => {
    steps.push({
      kind: 'prompt',
      label: `${label}: 応用 ${promptIndex + 1}`,
      speaker: 'you',
      item: {
        id: `${PROMPT_ITEM_PREFIX}${index}:${promptIndex}`,
        kind: 'word',
        cueJa: prompt.cue_ja,
        answer: prompt.answer,
      },
      stage: 0,
      actions: [
        { type: 'speak', text: prompt.cue_ja, lang: 'ja', voice: 'narrator' },
        pause,
        { type: 'speak', text: prompt.answer, lang, voice: speaker },
      ],
    })
  })

  return steps
}

/**
 * 会話 1 本を Pimsleur の 1 レッスンの流れに落とす。
 * 導入(会話を 2 回) → 各行を順に[核 → 文全体 → 解説 → 応用 2 つ]、その間に既出項目の再出題 →
 * 通し再生 → あなたが B の役で会話 → まとめ。長さは内容で決まり、上限は設けない。
 */
export function buildDialogueLesson(
  dialogue: LessonDialogue,
  opts: { lang: 'en' | 'ko'; pauseSeconds: number; currentWeek: number },
): { steps: DialogueLessonStep[]; items: LessonItem[] } {
  const { lang } = opts
  const pause: LessonAction = { type: 'pause', ms: opts.pauseSeconds * 1000, recordable: true }
  const items: LessonItem[] = []

  const intro: DialogueLessonStep = {
    kind: 'intro',
    label: '冒頭の会話',
    actions: [
      { type: 'speak', text: dialogue.title_ja, lang: 'ja', voice: 'narrator' },
      { type: 'gap', ms: 300 },
      { type: 'speak', text: INTRO_NARRATION_JA, lang: 'ja', voice: 'narrator' },
      { type: 'gap', ms: 500 },
      ...dialogueSpeaks(dialogue, lang),
      { type: 'gap', ms: 900 },
      ...dialogueSpeaks(dialogue, lang, 0.95),
    ],
  }

  const groups = dialogue.turns.map((turn, index) => (
    buildTurnSteps(turn, index, dialogue.turns.length, lang, pause, items)
  ))

  const recalls: DialogueLessonStep[] = buildSchedule(items)
    .filter((step) => step.stage !== 0)
    .map((step) => ({
      kind: 'recall',
      label: `思い出す(${STAGE_LABELS[step.stage as Exclude<LessonStage, 0>]})`,
      item: step.item,
      stage: step.stage,
      actions: planStep(step, { lang, pauseSeconds: opts.pauseSeconds }),
    }))

  // 再出題は行の処理の間に散らす。ただし、まだ出ていない行の項目は出さない。
  const quota = groups.length > 0 ? Math.ceil(recalls.length / groups.length) : recalls.length
  const pending = [...recalls]
  const body: DialogueLessonStep[] = []
  groups.forEach((group, groupIndex) => {
    body.push(...group)
    let taken = 0
    for (let index = 0; index < pending.length && taken < quota;) {
      const candidate = pending[index]
      if (candidate.item && itemTurnIndex(candidate.item) <= groupIndex) {
        body.push(candidate)
        pending.splice(index, 1)
        taken += 1
      } else {
        index += 1
      }
    }
  })
  body.push(...pending)

  const replay: DialogueLessonStep = {
    kind: 'replay',
    label: '会話をもう一度',
    actions: [
      { type: 'speak', text: REPLAY_NARRATION_JA, lang: 'ja', voice: 'narrator' },
      { type: 'gap', ms: 500 },
      ...dialogueSpeaks(dialogue, lang),
    ],
  }

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
    actions: [{ type: 'speak', text: SUMMARY_NARRATION_JA, lang: 'ja', voice: 'narrator' }],
  }

  return { steps: [intro, ...body, replay, ...closings, summary], items }
}
