import type { ReviewItem } from '../features/lesson/dialoguePlan'
import {
  validateDialogue,
  type DialogueIssue,
  type DialoguePrompt,
  type DialogueTurn,
  type LessonDialogue,
  type NewExpression,
} from '../features/lesson/lessonDialogueSchema'
import { normalizeText } from '../services/speech/normalize'
import {
  fail,
  requireArray,
  requireInteger,
  requireNonEmptyString,
  requireRecord,
  requireString,
  type UnknownRecord,
} from './validation'

export type { ReviewItem }

/**
 * 同梱カリキュラムの 1 レッスン。会話は v3 の項目(核・解説・応用)を必須にする。
 * review は前のレッスン(1 つ前・2 つ前・4 つ前)の表現で、レッスンの途中に差し込まれる。
 */
export type BundledLesson = {
  version: 1
  /** 例: 01-cafe。先頭の 2 桁が order と一致し、ファイル名と一致する。 */
  id: string
  order: number
  scene_ja: string
  dialogue: LessonDialogue
  review: ReviewItem[]
}

export const LESSON_ID_PATTERN = /^(\d{2})-[a-z][a-z-]*$/
/** 復習の出典は、このぶんだけ前のレッスン(段階的に間隔をあける)。 */
export const REVIEW_SOURCE_OFFSETS = [1, 2, 4] as const
export const MAX_PROMPTS_PER_TURN = 2
export const MIN_PROMPTS_PER_LESSON = 8

export function reviewSourceOrders(order: number): number[] {
  return REVIEW_SOURCE_OFFSETS.map((offset) => order - offset).filter((source) => source >= 1)
}

/** 復習の個数。1 本目は無し、2〜3 本目は 2〜6、4 本目以降は 4〜6。 */
export function reviewCountRange(order: number): { min: number; max: number } {
  if (order <= 1) {
    return { min: 0, max: 0 }
  }
  if (order <= 3) {
    return { min: 2, max: 6 }
  }
  return { min: 4, max: 6 }
}

function validatePrompt(value: unknown, label: string, path: string): DialoguePrompt {
  const record = requireRecord(value, label, path)
  return {
    cue_ja: requireNonEmptyString(record, 'cue_ja', label, path),
    answer: requireNonEmptyString(record, 'answer', label, path),
    ja: requireNonEmptyString(record, 'ja', label, path),
  }
}

function validateTurn(value: unknown, label: string, path: string): DialogueTurn {
  const record = requireRecord(value, label, path)
  const speaker = record.speaker
  if (speaker !== 'A' && speaker !== 'B') {
    fail(label, `${path}.speaker`, 'は A か B である必要があります')
  }
  const key = requireRecord(record.key, label, `${path}.key`)
  const prompts = requireArray(record, 'prompts', label, path)
  if (prompts.length < 1 || prompts.length > MAX_PROMPTS_PER_TURN) {
    fail(label, `${path}.prompts`, `は 1〜${MAX_PROMPTS_PER_TURN} 個にしてください(現在 ${prompts.length} 個)`)
  }
  return {
    speaker,
    text: requireNonEmptyString(record, 'text', label, path),
    ja: requireNonEmptyString(record, 'ja', label, path),
    key: {
      text: requireNonEmptyString(key, 'text', label, `${path}.key`),
      ja: requireNonEmptyString(key, 'ja', label, `${path}.key`),
    },
    note_ja: requireString(record, 'note_ja', label, path).trim(),
    prompts: prompts.map((prompt, index) => validatePrompt(prompt, label, `${path}.prompts[${index}]`)),
  }
}

function validateExpression(value: unknown, label: string, path: string): NewExpression {
  const record = requireRecord(value, label, path)
  return {
    text: requireNonEmptyString(record, 'text', label, path),
    ja: requireNonEmptyString(record, 'ja', label, path),
    note_ja: requireNonEmptyString(record, 'note_ja', label, path),
    turn_index: requireInteger(record, 'turn_index', label, path),
  }
}

function validateDialogueShape(value: unknown, label: string): LessonDialogue {
  const record = requireRecord(value, label, 'dialogue')
  return {
    title_ja: requireNonEmptyString(record, 'title_ja', label, 'dialogue'),
    scene_ja: requireNonEmptyString(record, 'scene_ja', label, 'dialogue'),
    turns: requireArray(record, 'turns', label, 'dialogue')
      .map((turn, index) => validateTurn(turn, label, `dialogue.turns[${index}]`)),
    new_expressions: requireArray(record, 'new_expressions', label, 'dialogue')
      .map((expression, index) => validateExpression(expression, label, `dialogue.new_expressions[${index}]`)),
  }
}

function validateReviewItem(value: unknown, label: string, path: string): ReviewItem {
  const record = requireRecord(value, label, path)
  const speaker = record.speaker
  if (speaker !== 'A' && speaker !== 'B') {
    fail(label, `${path}.speaker`, 'は A か B である必要があります')
  }
  return {
    from: requireNonEmptyString(record, 'from', label, path),
    text: requireNonEmptyString(record, 'text', label, path),
    ja: requireNonEmptyString(record, 'ja', label, path),
    speaker,
  }
}

/** 形の検査。意味の検査(既知語の比率、復習の出典など)は lintLesson で行う。 */
export function validateLessonFile(json: unknown, label: string): BundledLesson {
  const record: UnknownRecord = requireRecord(json, label, 'root')
  if (record.version !== 1) {
    fail(label, 'version', 'は1である必要があります')
  }
  const id = requireNonEmptyString(record, 'id', label, 'root')
  const match = LESSON_ID_PATTERN.exec(id)
  if (!match) {
    fail(label, 'id', `の形が不正です: ${id}(例: 01-cafe)`)
  }
  const order = requireInteger(record, 'order', label, 'root')
  if (order < 1) {
    fail(label, 'order', 'は 1 以上である必要があります')
  }
  if (order !== Number(match[1])) {
    fail(label, 'order', `が id の番号と一致しません(${order} / ${match[1]})`)
  }
  return {
    version: 1,
    id,
    order,
    scene_ja: requireNonEmptyString(record, 'scene_ja', label, 'root'),
    dialogue: validateDialogueShape(record.dialogue, label),
    review: requireArray(record, 'review', label, 'root')
      .map((item, index) => validateReviewItem(item, label, `review[${index}]`)),
  }
}

/** 出典として使える文: 台詞、核の表現、応用の答え。 */
export function sourceTexts(lesson: BundledLesson): string[] {
  return lesson.dialogue.turns.flatMap((turn) => [
    turn.text,
    ...(turn.key ? [turn.key.text] : []),
    ...(turn.prompts ?? []).map((prompt) => prompt.answer),
  ])
}

/** このレッスンで教える表現(新しい表現 + 核)。次のレッスンでは既知語として数える。 */
export function lessonExpressions(lesson: BundledLesson): string[] {
  return [
    ...lesson.dialogue.new_expressions.map((expression) => expression.text),
    ...lesson.dialogue.turns.flatMap((turn) => (turn.key ? [turn.key.text] : [])),
  ]
}

/**
 * 意味の検査。会話は既存の validateDialogue(行数・長さ・既知語比率など)、
 * 復習は個数・出典・出典に含まれることを見る。問題が無ければ空。
 */
export function lintLesson(
  lesson: BundledLesson,
  opts: { lang: 'en' | 'ko'; knownWords: string[]; earlier: BundledLesson[] },
): DialogueIssue[] {
  const result = validateDialogue(lesson.dialogue, { lang: opts.lang, knownWords: opts.knownWords })
  const issues: DialogueIssue[] = result.ok ? [] : [...result.issues]

  const promptCount = lesson.dialogue.turns.reduce((total, turn) => total + (turn.prompts?.length ?? 0), 0)
  if (promptCount < MIN_PROMPTS_PER_LESSON) {
    issues.push({ code: 'prompts', message: `応用の合図は合計 ${MIN_PROMPTS_PER_LESSON} 個以上にしてください(現在 ${promptCount} 個)` })
  }

  const range = reviewCountRange(lesson.order)
  if (lesson.review.length < range.min || lesson.review.length > range.max) {
    issues.push({ code: 'review', message: `復習は ${range.min}〜${range.max} 個にしてください(現在 ${lesson.review.length} 個)` })
  }

  const allowedOrders = new Set(reviewSourceOrders(lesson.order))
  const earlierById = new Map(opts.earlier.map((item) => [item.id, item]))
  lesson.review.forEach((item, index) => {
    const source = earlierById.get(item.from)
    if (!source) {
      issues.push({ code: 'review', message: `review[${index}] の出典「${item.from}」が先行レッスンにありません` })
      return
    }
    if (!allowedOrders.has(source.order)) {
      issues.push({
        code: 'review',
        message: `review[${index}] の出典は 1 つ前・2 つ前・4 つ前のレッスンにしてください(${item.from} は ${source.order} 本目)`,
      })
    }
    const needle = normalizeText(item.text, opts.lang)
    const found = sourceTexts(source).some((text) => normalizeText(text, opts.lang).includes(needle))
    if (needle.length === 0 || !found) {
      issues.push({
        code: 'review',
        message: `review[${index}]「${item.text}」が出典「${item.from}」の台詞・核・応用の答えに含まれていません`,
      })
    }
  })

  return issues
}
