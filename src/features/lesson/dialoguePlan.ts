import { estimateActionsMs } from './estimate'
import type { DialogueTurn, LessonDialogue, NewExpression } from './lessonDialogueSchema'
import { buildBackChainActions, type LessonAction } from './plan'
import { RECALL_OFFSETS_SEC } from './schedule'
import type { LessonItem, LessonStage } from './types'

export type DialogueLessonStepKind =
  | 'intro'
  | 'breakdown'
  | 'line'
  | 'explain'
  | 'prompt'
  | 'recall'
  /** 前のレッスンの復習(同梱カリキュラム)。 */
  | 'review'
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

/** 再出題の表示。実際の間隔は経過時間の見積もりで決まるので、何回目かだけを示す。 */
const STAGE_LABELS: Record<Exclude<LessonStage, 0>, string> = {
  1: '1回目',
  2: '2回目',
  3: '3回目',
  4: '4回目',
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
/** 前のレッスンの復習の項目 id の接頭辞。 */
export const REVIEW_ITEM_PREFIX = 'review:'

/** 前のレッスンの復習項目(同梱カリキュラム)。 */
export type ReviewItem = {
  /** 出典のレッスン id(1 つ前・2 つ前・4 つ前のいずれか)。 */
  from: string
  /** 答え(対象言語)。出典の台詞・核・応用の答えのどれかに含まれる。 */
  text: string
  /** 合図の元になる日本語。 */
  ja: string
  speaker: 'A' | 'B'
}

/** 復習は 1 行目の途中(0 秒)から出し、2 回目はその 10 分後。 */
export const REVIEW_OFFSETS_SEC = [0, 600] as const

/** 1 つの区切り(ステップの間)で出す再出題は最大 2 つ。それ以上は次の区切りへ送る。 */
export const MAX_RECALLS_PER_BOUNDARY = 2
/** 同じ項目の再出題は、間に少なくともこの数のステップを挟む(同じ表現が続かないように)。 */
export const MIN_STEPS_BETWEEN_RECALLS = 2
/** 行を終えた時点で再出題がこの回数に届いていない項目(終盤の行)には、締めの前に 1 回だけ出す。 */
export const MIN_RECALLS_BEFORE_REPLAY = 2

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

type TurnGroup = {
  steps: DialogueLessonStep[]
  /** この行の再出題に使う項目。核の表現があればそれ、なければ文全体。 */
  item: LessonItem
  speaker: 'A' | 'B'
}

/**
 * 1 行分の学習ステップ。
 * 核の表現(あれば) → 文全体 → 解説(あれば) → 応用の合図(0〜2)。
 * 核と文全体は Pimsleur 式の逆順組み立て(全体 → 末尾から最大 3 段 → 全体)で、その行の話者の声で読む。
 * 文全体では、核の中にあるかけらは(すでに練習したので)飛ばす。
 */
function buildTurnSteps(
  turn: DialogueTurn,
  index: number,
  total: number,
  lang: 'en' | 'ko',
  pause: LessonAction,
): TurnGroup {
  const speaker = turn.speaker
  const label = `会話 ${index + 1}/${total}`
  const steps: DialogueLessonStep[] = []
  const instruction: LessonAction[] = index === 0
    ? [{ type: 'speak', text: BACK_CHAIN_INSTRUCTION_JA, lang: 'ja', voice: 'narrator' }, { type: 'gap', ms: 300 }]
    : []

  let keyItem: LessonItem | null = null
  if (turn.key) {
    keyItem = {
      id: `key:${index}`,
      kind: 'word',
      cueJa: cueFor(turn.key.ja),
      answer: turn.key.text,
    }
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
      ...buildBackChainActions(turn.text, lang, { voice: speaker, skipContainedIn: turn.key?.text }),
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

  return { steps, item: keyItem ?? lineItem, speaker }
}

type RecallState = {
  kind: 'recall' | 'review'
  item: LessonItem
  speaker: 'A' | 'B'
  groupIndex: number
  /**
   * 期限の起点(見積もりのミリ秒)。再出題は項目を教え終えた時点から、
   * 復習は前回出した時点から数える。
   */
  anchorAt: number
  offsetsSec: readonly number[]
  lastStepIndex: number
  recallCount: number
}

function recallStep(state: RecallState, lang: 'en' | 'ko', pause: LessonAction): DialogueLessonStep {
  const stage = Math.min(state.recallCount + 1, 4) as Exclude<LessonStage, 0>
  return {
    kind: state.kind,
    label: state.kind === 'review' ? `前回の復習(${STAGE_LABELS[stage]})` : `思い出す(${STAGE_LABELS[stage]})`,
    speaker: state.speaker,
    item: state.item,
    stage,
    actions: [
      { type: 'speak', text: state.item.cueJa, lang: 'ja', voice: 'narrator' },
      pause,
      { type: 'speak', text: state.item.answer, lang, voice: state.speaker },
    ],
  }
}

/**
 * 会話 1 本を Pimsleur の 1 レッスンの流れに落とす。
 * 導入(会話を 2 回) → 各行を順に[核 → 文全体 → 解説 → 応用 2 つ] → 通し再生 → あなたが B の役で会話 → まとめ。
 * 前の行の再出題は、次の行の途中(ステップの間)に、経過時間の見積もりが 5 秒/25 秒/2 分/10 分を
 * 過ぎたものから差し込む。同じ行の中では出さず、同じ項目が続かないように間を空ける。
 * 前のレッスンの復習(review)は 1 行目の途中から同じ仕組みで差し込み、10 分後にもう一度出す。
 * 長さは内容で決まり、上限は設けない。
 */
export function buildDialogueLesson(
  dialogue: LessonDialogue,
  opts: { lang: 'en' | 'ko'; pauseSeconds: number; currentWeek: number; review?: ReviewItem[] },
): { steps: DialogueLessonStep[]; items: LessonItem[] } {
  const { lang } = opts
  const pause: LessonAction = { type: 'pause', ms: opts.pauseSeconds * 1000, recordable: true }

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
    buildTurnSteps(turn, index, dialogue.turns.length, lang, pause)
  ))
  const items = groups.map((group) => group.item)

  const body: DialogueLessonStep[] = []
  const states: RecallState[] = (opts.review ?? []).map((review, index) => ({
    kind: 'review',
    item: {
      id: `${REVIEW_ITEM_PREFIX}${index}`,
      kind: 'word',
      cueJa: cueFor(review.ja),
      answer: review.text,
    },
    speaker: review.speaker,
    groupIndex: -1,
    anchorAt: 0,
    offsetsSec: REVIEW_OFFSETS_SEC,
    lastStepIndex: -MIN_STEPS_BETWEEN_RECALLS,
    recallCount: 0,
  }))
  let now = estimateActionsMs(intro.actions)

  const push = (step: DialogueLessonStep) => {
    body.push(step)
    now += estimateActionsMs(step.actions)
  }
  const dueAt = (state: RecallState) => state.anchorAt + state.offsetsSec[state.recallCount] * 1000
  const emitRecall = (state: RecallState) => {
    push(recallStep(state, lang, pause))
    state.lastStepIndex = body.length - 1
    state.recallCount += 1
    if (state.kind === 'review') {
      // 復習の 2 回目は、1 回目を出した時点から数える
      state.anchorAt = now
    }
  }
  const emitDueRecalls = (currentGroup: number) => {
    const due = states
      .filter((state) => (
        state.recallCount < state.offsetsSec.length
        && state.groupIndex < currentGroup
        && body.length - 1 - state.lastStepIndex >= MIN_STEPS_BETWEEN_RECALLS
        && dueAt(state) <= now
      ))
      .sort((left, right) => dueAt(left) - dueAt(right))
      .slice(0, MAX_RECALLS_PER_BOUNDARY)
    due.forEach(emitRecall)
  }

  groups.forEach((group, groupIndex) => {
    group.steps.forEach((step, stepIndex) => {
      if (stepIndex > 0) {
        emitDueRecalls(groupIndex)
      }
      push(step)
      if (stepIndex === 0) {
        states.push({
          kind: 'recall',
          item: group.item,
          speaker: group.speaker,
          groupIndex,
          anchorAt: now,
          offsetsSec: RECALL_OFFSETS_SEC,
          lastStepIndex: body.length - 1,
          recallCount: 0,
        })
      }
    })
  })

  // 終盤の行はまだ再出題の機会が少ないので、締めの前に 1 回だけ思い出させる(復習も 2 回に満たなければ出す)。
  states
    .filter((state) => state.recallCount < Math.min(MIN_RECALLS_BEFORE_REPLAY, state.offsetsSec.length))
    .forEach(emitRecall)

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
