import twoWordJson from './en/twoword.json'
import {
  fail,
  requireArray,
  requireNonEmptyString,
  requireRecord,
  type UnknownRecord,
} from './validation'

/**
 * 2 語トレ。動詞 1 語 + 目的語 1 語から始めて、主語・時や場所を足して 3 語・4 語に伸ばす。
 * 冠詞と三単現の s は括弧に入れて「気にしない」ことを見せる(情意フィルターを下げる)。
 * 解答は 1 つではなく、動詞リストから選べていれば正解とする。
 */
export type VerbGroup = 'state' | 'emotion' | 'transfer' | 'thought' | 'action' | 'change'

export const VERB_GROUP_LABELS: Record<VerbGroup, string> = {
  state: '今の状態',
  emotion: '心が動く',
  transfer: '伝える・聞く',
  thought: '考える',
  action: '人やものが動く',
  change: '新しい状態になる',
}

export type TwoWordVerb = { text: string; ja: string; group: VerbGroup }

export type TwoWordLevel = 2 | 3 | 4
export type TwoWordKind = 'basic' | 'scene'

export type TwoWordQuestion = {
  id: string
  /** 何語で言うか。 */
  level: TwoWordLevel
  kind: TwoWordKind
  /** お題(日本語)。場面設定では指示文。 */
  ja: string
  /** 場面設定のとき、相手の発話。 */
  prompt?: string
  promptJa?: string
  /** 解答例。1 つとは限らない。 */
  answers: string[]
}

export type TwoWordSet = {
  version: 1
  verbs: TwoWordVerb[]
  questions: TwoWordQuestion[]
}

const VERB_GROUPS = new Set<string>(['state', 'emotion', 'transfer', 'thought', 'action', 'change'])
export const QUESTION_ID_PATTERN = /^tw-\d{3}$/

function validateVerb(value: unknown, label: string, index: number): TwoWordVerb {
  const path = `verbs[${index}]`
  const record = requireRecord(value, label, path)
  const group = record.group
  if (typeof group !== 'string' || !VERB_GROUPS.has(group)) {
    fail(label, `${path}.group`, `が不正です: ${String(group)}`)
  }
  return {
    text: requireNonEmptyString(record, 'text', label, path),
    ja: requireNonEmptyString(record, 'ja', label, path),
    group: group as VerbGroup,
  }
}

function validateQuestion(value: unknown, label: string, index: number): TwoWordQuestion {
  const path = `questions[${index}]`
  const record = requireRecord(value, label, path)
  const id = requireNonEmptyString(record, 'id', label, path)
  if (!QUESTION_ID_PATTERN.test(id)) {
    fail(label, `${path}.id`, `の形が不正です: ${id}(例: tw-001)`)
  }
  const level = record.level
  if (level !== 2 && level !== 3 && level !== 4) {
    fail(label, `${path}.level`, 'は 2、3、4 のいずれかである必要があります')
  }
  const kind = record.kind
  if (kind !== 'basic' && kind !== 'scene') {
    fail(label, `${path}.kind`, 'は basic か scene である必要があります')
  }
  const answers = requireArray(record, 'answers', label, path).map((answer, answerIndex) => {
    if (typeof answer !== 'string' || answer.trim().length === 0) {
      fail(label, `${path}.answers[${answerIndex}]`, 'が空です')
    }
    return answer
  })
  if (answers.length === 0) {
    fail(label, `${path}.answers`, 'が空です')
  }
  const question: TwoWordQuestion = {
    id,
    level,
    kind,
    ja: requireNonEmptyString(record, 'ja', label, path),
    answers,
  }
  if (kind === 'scene') {
    question.prompt = requireNonEmptyString(record, 'prompt', label, path)
    question.promptJa = requireNonEmptyString(record, 'promptJa', label, path)
  }
  return question
}

export function validateTwoWord(json: unknown, label: string): TwoWordSet {
  const record: UnknownRecord = requireRecord(json, label, 'root')
  if (record.version !== 1) {
    fail(label, 'version', 'は1である必要があります')
  }
  const verbs = requireArray(record, 'verbs', label, 'root').map((value, index) => validateVerb(value, label, index))
  const questions = requireArray(record, 'questions', label, 'root')
    .map((value, index) => validateQuestion(value, label, index))
  return { version: 1, verbs, questions }
}

/** 括弧の中(冠詞・三単現など)を外した形。答え合わせの表示に使う。 */
export function stripOptional(answer: string): string {
  return answer.replace(/\(([^)]*)\)\s*/g, '').replace(/\s+/g, ' ').trim()
}

/** 括弧を外して数えた語数。2 語トレの「2 語」はこの数え方。 */
export function wordCount(answer: string): number {
  const stripped = stripOptional(answer)
  return stripped.length === 0 ? 0 : stripped.split(/\s+/).length
}

let cache: TwoWordSet | null = null

export function loadTwoWord(): TwoWordSet {
  if (!cache) {
    cache = validateTwoWord(twoWordJson, 'en/twoword.json')
  }
  return cache
}

/** その語数の問題。level 2 は基礎と場面設定の両方。 */
export function questionsOfLevel(set: TwoWordSet, level: TwoWordLevel): TwoWordQuestion[] {
  return set.questions.filter((question) => question.level === level)
}
