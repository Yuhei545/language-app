import { normalizeText } from '../../services/speech/normalize'

export type DialogueSpeaker = 'A' | 'B'
export type DialogueTurn = { speaker: DialogueSpeaker; text: string; ja: string }
export type NewExpression = { text: string; ja: string; note_ja: string; turn_index: number }
export type LessonDialogue = {
  title_ja: string
  scene_ja: string
  turns: DialogueTurn[]
  new_expressions: NewExpression[]
}

export type DialogueIssueCode = 'turns' | 'alternation' | 'length' | 'expressions' | 'ratio' | 'script'
export type DialogueIssue = { code: DialogueIssueCode; message: string }

export type DialogueValidation =
  | { ok: true; dialogue: LessonDialogue; ratio: number }
  | { ok: false; issues: DialogueIssue[]; ratio: number }

export const DIALOGUE_TURN_RANGE = { min: 6, max: 8 } as const
export const NEW_EXPRESSION_RANGE = { min: 4, max: 6 } as const
export const MAX_LINE_LENGTH = { en: 14, ko: 30 } as const
/** 既知語比率のしきい値。韓国語は助詞が付いて一致しにくいので緩める。 */
export const KNOWN_RATIO_THRESHOLD = { en: 0.8, ko: 0.5 } as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseDialogue(json: unknown): LessonDialogue | string {
  if (!isRecord(json)) {
    return '会話データがオブジェクトではありません'
  }
  if (
    typeof json.title_ja !== 'string'
    || json.title_ja.trim().length === 0
    || typeof json.scene_ja !== 'string'
    || json.scene_ja.trim().length === 0
  ) {
    return 'title_ja / scene_ja が文字列ではありません'
  }
  if (!Array.isArray(json.turns)) {
    return 'turns が配列ではありません'
  }
  if (!Array.isArray(json.new_expressions)) {
    return 'new_expressions が配列ではありません'
  }

  const turns: DialogueTurn[] = []
  for (const [index, turn] of json.turns.entries()) {
    if (!isRecord(turn) || (turn.speaker !== 'A' && turn.speaker !== 'B')
      || typeof turn.text !== 'string' || turn.text.trim().length === 0
      || typeof turn.ja !== 'string' || turn.ja.trim().length === 0) {
      return `turns[${index}] の形が不正です`
    }
    turns.push({ speaker: turn.speaker, text: turn.text.trim(), ja: turn.ja.trim() })
  }

  const expressions: NewExpression[] = []
  for (const [index, expression] of json.new_expressions.entries()) {
    if (!isRecord(expression)
      || typeof expression.text !== 'string' || expression.text.trim().length === 0
      || typeof expression.ja !== 'string' || expression.ja.trim().length === 0
      || typeof expression.note_ja !== 'string' || expression.note_ja.trim().length === 0
      || typeof expression.turn_index !== 'number'
      || !Number.isInteger(expression.turn_index)) {
      return `new_expressions[${index}] の形が不正です`
    }
    expressions.push({
      text: expression.text.trim(),
      ja: expression.ja.trim(),
      note_ja: expression.note_ja.trim(),
      turn_index: expression.turn_index,
    })
  }

  return { title_ja: json.title_ja.trim(), scene_ja: json.scene_ja.trim(), turns, new_expressions: expressions }
}

function tokens(text: string, lang: 'en' | 'ko'): string[] {
  return normalizeText(text, lang).split(/\s+/).filter((token) => token.length > 0)
}

const HANGUL_OR_JAPANESE = /[가-힣㄰-㆏぀-ヿ一-鿿]/
// 1 文字だと「A」「OK」のような表記で誤検知するので、2 文字以上のラテン文字の連なりを対象にする
const LATIN_WORD = /[A-Za-z]{2,}/

/**
 * Gemini が生成した会話を、レッスンに使える形か機械的に検査する。
 * 形が壊れていても throw せず、理由の一覧を返す(再生成の指示に使う)。
 */
export function validateDialogue(
  json: unknown,
  opts: { lang: 'en' | 'ko'; knownWords: string[] },
): DialogueValidation {
  const parsed = parseDialogue(json)
  if (typeof parsed === 'string') {
    return { ok: false, issues: [{ code: 'turns', message: parsed }], ratio: 0 }
  }

  const { lang } = opts
  const issues: DialogueIssue[] = []
  const { turns, new_expressions: expressions } = parsed

  if (turns.length < DIALOGUE_TURN_RANGE.min || turns.length > DIALOGUE_TURN_RANGE.max) {
    issues.push({
      code: 'turns',
      message: `往復数は ${DIALOGUE_TURN_RANGE.min}〜${DIALOGUE_TURN_RANGE.max} 行にしてください(現在 ${turns.length} 行)`,
    })
  }

  if (turns.length > 0 && turns[0].speaker !== 'A') {
    issues.push({ code: 'alternation', message: '会話は A(相手役)から始めてください' })
  }
  for (let index = 1; index < turns.length; index += 1) {
    if (turns[index].speaker === turns[index - 1].speaker) {
      issues.push({ code: 'alternation', message: `${index + 1} 行目で同じ話者が続いています。A と B を交互にしてください` })
      break
    }
  }

  turns.forEach((turn, index) => {
    const length = lang === 'en'
      ? turn.text.split(/\s+/).filter((word) => word.length > 0).length
      : turn.text.replace(/\s+/g, '').length
    if (length > MAX_LINE_LENGTH[lang]) {
      issues.push({
        code: 'length',
        message: lang === 'en'
          ? `${index + 1} 行目が ${length} 語あります。14 語以内にしてください`
          : `${index + 1} 行目が ${length} 文字あります。30 文字以内にしてください`,
      })
    }
  })

  if (expressions.length < NEW_EXPRESSION_RANGE.min || expressions.length > NEW_EXPRESSION_RANGE.max) {
    issues.push({
      code: 'expressions',
      message: `新しい表現は ${NEW_EXPRESSION_RANGE.min}〜${NEW_EXPRESSION_RANGE.max} 個にしてください(現在 ${expressions.length} 個)`,
    })
  }
  expressions.forEach((expression) => {
    const turn = turns[expression.turn_index]
    // 文頭の大文字や句読点の差で外れないよう、両方を正規化して比べる
    const normalizedExpression = normalizeText(expression.text, lang)
    if (!turn || normalizedExpression.length === 0 || !normalizeText(turn.text, lang).includes(normalizedExpression)) {
      issues.push({
        code: 'expressions',
        message: `新しい表現「${expression.text}」が ${expression.turn_index + 1} 行目にそのまま含まれていません`,
      })
    }
  })

  turns.forEach((turn, index) => {
    const foreign = lang === 'en' ? HANGUL_OR_JAPANESE.test(turn.text) : LATIN_WORD.test(turn.text)
    if (foreign) {
      issues.push({
        code: 'script',
        message: lang === 'en'
          ? `${index + 1} 行目に英語以外の文字が混ざっています`
          : `${index + 1} 行目にラテン文字の語が混ざっています`,
      })
    }
  })

  const expressionTokens = new Set(expressions.flatMap((expression) => tokens(expression.text, lang)))
  const knownTokens = new Set(opts.knownWords.flatMap((word) => tokens(word, lang)))
  const candidateTokens = turns
    .flatMap((turn) => tokens(turn.text, lang))
    .filter((token) => !expressionTokens.has(token))
  const knownCount = candidateTokens.filter((token) => knownTokens.has(token)).length
  const ratio = candidateTokens.length === 0 ? 1 : knownCount / candidateTokens.length
  if (ratio < KNOWN_RATIO_THRESHOLD[lang]) {
    issues.push({
      code: 'ratio',
      message: `既知語の割合が ${(ratio * 100).toFixed(0)}% です。${(KNOWN_RATIO_THRESHOLD[lang] * 100).toFixed(0)}% 以上になるよう、渡した既知語を優先して使ってください`,
    })
  }

  if (issues.length > 0) {
    return { ok: false, issues, ratio }
  }
  return { ok: true, dialogue: parsed, ratio }
}
