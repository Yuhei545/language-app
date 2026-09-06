import type { Interest, PersonalWordKind } from '../settings'
import type { DialogueIssue } from '../../features/lesson/lessonDialogueSchema'
import { getPersona, type Lang } from './persona'

export type ParentPromptInput = {
  lang: Lang
  personaName: string
  scenario: string
  knownWords: string[]
  weekWords: string[]
  targetWords: string[]
  interests: Interest[]
}

export type VocabPromptInput = {
  lang: Lang
  week: number
  knownWords: string[]
  interests: Interest[]
  count?: number
}

export type PrepPromptInput = {
  lang: Lang
  title: string
  knownWords: string[]
}

export type MixingCheckPromptInput = {
  lang: Lang
  personaName: string
  intendedMeaningJa: string
  learnerText: string
}

export type TopicCheckPromptInput = {
  lang: Lang
  personaName: string
  topicJa: string
  learnerText: string
  previousTurn?: {
    question: string
    answer: string
  }
}

export type QuickQuestionsPromptInput = {
  lang: Lang
  frames: Array<{ pattern: string; hint_ja: string }>
  personalWords: Array<{ text: string; kind: PersonalWordKind }>
  count?: number
  /** 今日の狙い(型は ___ 入り)。質問に自然に入れてもらう。 */
  targetExpressions?: string[]
}

export type QuickJudgePromptInput = {
  lang: Lang
  items: Array<{ q: string; answer: string }>
}

export type TranslatePersonalWordPromptInput = {
  ja: string
  kind: PersonalWordKind
}

export type DialogueLevel = 'practical-b1' | 'beginner'

export type DialoguePromptInput = {
  lang: Lang
  sceneJa: string
  interests: Interest[]
  knownWords: string[]
  level: DialogueLevel
  retryIssues?: DialogueIssue[]
  /** 今日の狙い(型は ___ 入り)。半分以上を台詞にそのまま入れてもらう。 */
  targetExpressions?: string[]
}

const languageNames: Record<Lang, string> = {
  en: 'English',
  ko: 'Korean',
}

const interestNames: Record<Interest, string> = {
  travel: 'travel situations',
  friends: 'conversations with friends',
  content: 'videos and online content',
}

function list(values: string[]): string {
  return values.length > 0 ? values.join(', ') : '(none)'
}

function listInterests(interests: Interest[]): string {
  return interests.length > 0
    ? interests.map((interest) => interestNames[interest]).join(', ')
    : 'general everyday situations'
}

export function buildParentSystemPrompt(input: ParentPromptInput): string {
  const language = languageNames[input.lang]
  const persona = getPersona(input.lang, input.personaName)

  const rules = [
    `Reply ONLY in the target language (${language}). Use 1-2 short sentences.`,
    `NEVER correct the learner's mistakes. Never use words like "wrong", "mistake", or "incorrect". Instead, restate what you understood in a natural, correct form, then continue.`,
    `Always work hard to understand the learner's intent even when the grammar is broken. If the intent is truly unclear, ask a simple yes/no question.`,
    `Use ONLY these words plus the ~100 most frequent words of ${language}:\n   Known words: ${list(input.knownWords)}\n   This week's words: ${list(input.weekWords)}`,
    `End every turn with a short question so the learner keeps speaking.`,
    `Be warm and unhurried. You are ${persona.name} from ${persona.city}.`,
  ]

  if (input.targetWords.length > 0) {
    rules.push(`Try to naturally create openings for the learner to use these words, but never quiz them directly: ${list(input.targetWords)}`)
  }

  rules.push(`Scenario: ${input.scenario}`)

  const numbered = rules.map((rule, index) => `${index + 1}. ${rule}`).join('\n')

  return `You are a warm language parent helping a beginner speak ${language}.

${numbered}
Learner interests: ${listInterests(input.interests)}.`
}

export function buildVocabPrompt(input: VocabPromptInput): string {
  const language = languageNames[input.lang]
  const count = input.count ?? 40

  return `Generate exactly ${count} ${language} vocabulary items for week ${input.week}.
Choose high-frequency words used in everyday conversation, especially for: ${listInterests(input.interests)}.
Do not include any word already in the learner's known words. Known words: ${list(input.knownWords)}.
Each item must include the word or phrase, one emoji, a short Japanese hint, and a natural beginner-friendly example sentence.`
}

export function buildPrepPrompt(input: PrepPromptInput): string {
  const language = languageNames[input.lang]

  return `Generate exactly 10 practical ${language} phrases the learner will actually need for this event: ${input.title}.
Prefer short, natural phrases that can be spoken immediately in that situation.
Do not duplicate the learner's known words or phrases: ${list(input.knownWords)}.
Each item must include the phrase, one emoji, a short Japanese hint, and a natural example sentence.`
}

/**
 * 文字起こし用プロンプト。書字体系を固定しないと、Flash 系モデルは
 * ローマ字化・翻訳・解説を混ぜることがあり、単語カードの判定が壊れる。
 */
export function buildTranscribePrompt(lang: Lang): string {
  const script: Record<Lang, string> = {
    en: 'Write it in English letters only.',
    ko: 'Write it in Hangul only.',
  }

  return `Transcribe this ${languageNames[lang]} speech exactly as spoken. ${script[lang]} `
    + 'Output only the transcription: no translation, no romanization, no commentary, no quotation marks. '
    + 'If there is no clear speech, output exactly [NO_SPEECH].'
}

export function buildMixingCheckPrompt(input: MixingCheckPromptInput): string {
  const language = languageNames[input.lang]

  return `You are ${input.personaName}, a warm and patient language parent.
The learner was trying to express this intended meaning in ${language}: ${input.intendedMeaningJa}
The learner said: ${input.learnerText}

Decide only whether the intended meaning was communicated.
1. Do not evaluate grammar or pronunciation. Never correct the learner. Never use words such as "wrong", "mistake", or "incorrect".
2. If the meaning came through, set understood=true and restate what you understood as one natural, correct ${language} sentence in recast.
3. If the meaning did not come through, set understood=false and write one gentle ${language} question in recast that says what you heard and checks the learner's intent.
4. Put a Japanese translation of recast in ja.`
}

export function buildTopicCheckPrompt(input: TopicCheckPromptInput): string {
  const language = languageNames[input.lang]
  const previousTurn = input.previousTurn
    ? `\nThis is the second turn. Use this previous question and answer as context:\nPrevious question: ${input.previousTurn.question}\nPrevious answer: ${input.previousTurn.answer}\nJudge how the current utterance continues that exchange.`
    : ''

  return `You are ${input.personaName}, a warm and patient language parent.
The learner spoke in ${language} for this Japanese topic: ${input.topicJa}
The learner said: ${input.learnerText}${previousTurn}

Decide only whether the learner's meaning was communicated and relevant to the topic.
1. Do not evaluate grammar or pronunciation. Never call an answer "wrong", a "mistake", or "incorrect".
2. Set understood to whether the meaning came through.
3. In recast, write one natural ${language} sentence expressing what the learner communicated. If the meaning did not come through, write one gentle confirmation question instead.
4. In ja, write the Japanese translation of recast.
5. If understood is true, ask one short ${language} follow-up question about information the learner has not said yet, and put its Japanese translation in follow_up_ja.
6. If understood is false, set follow_up and follow_up_ja to empty strings.
Return only JSON with understood, recast, ja, follow_up, and follow_up_ja.`
}

export function buildQuickQuestionsPrompt(input: QuickQuestionsPromptInput): string {
  const language = languageNames[input.lang]
  const count = input.count ?? 8
  const frames = input.frames.length > 0
    ? input.frames.map((frame) => `- ${frame.pattern} (${frame.hint_ja})`).join('\n')
    : '(none)'
  const personalWords = input.personalWords.length > 0
    ? input.personalWords.map((word) => `- ${word.text} (${word.kind})`).join('\n')
    : '(none)'
  const targets = input.targetExpressions?.length
    ? `\nTarget expressions (use each in at least one question, naturally; fill ___ with a fitting word):\n${input.targetExpressions.map((text) => `- ${text}`).join('\n')}\n`
    : ''

  return `Create exactly ${count} short ${language} questions that a beginner can answer in 1-2 seconds.
Use and vary the practiced sentence patterns and the learner's personal words when natural.
Mix the patterns so consecutive questions do not keep using the same pattern.
Do not evaluate the learner or use the words "wrong", "mistake", or "incorrect".

Practiced patterns:
${frames}

Personal words:
${personalWords}
${targets}
Return only a JSON array of exactly ${count} objects. Every object must contain q with the ${language} question and ja with its Japanese translation.`
}

export function buildQuickJudgePrompt(input: QuickJudgePromptInput): string {
  const language = languageNames[input.lang]
  const items = input.items.map((item, index) => (
    `${index + 1}. Question: ${item.q}\n   Learner answer: ${item.answer}`
  )).join('\n')

  return `Judge whether the meaning of each learner answer was communicated in ${language}.
Do not evaluate grammar or pronunciation. Never call an answer "wrong", a "mistake", or "incorrect".
Keep exactly the same order as the ${input.items.length} input items.
For every item return understood as a boolean and better as one short, more natural ${language} answer. better may be an empty string when the original answer already communicates the meaning naturally.

Items:
${items || '(none)'}

Return only a JSON array of exactly ${input.items.length} objects with understood and better.`
}

export function buildTranslatePersonalWordPrompt(
  input: TranslatePersonalWordPromptInput,
): string {
  return `Translate this Japanese personal word for use in everyday language practice.
Japanese: ${input.ja}
Kind: ${input.kind}

Return its natural English form in en and Korean form in ko.
For a proper noun such as a person's name, place, title, or work, use its common established spelling when known; otherwise use a natural romanization for English and Hangul transcription for Korean.
Do not add explanations, evaluations, or words such as "wrong", "mistake", or "incorrect".
Return only JSON with en and ko.`
}

export function buildDialoguePrompt(input: DialoguePromptInput): string {
  const language = languageNames[input.lang]
  const lineLimit = input.lang === 'en'
    ? 'Keep every English line within 14 words.'
    : 'Keep every Korean line within 30 characters.'
  const level = input.level === 'practical-b1'
    ? 'Use practical everyday English at CEFR B1.'
    : 'Use beginner Korean, polite -요 forms.'
  const retry = input.retryIssues?.length
    ? `\nYour previous attempt had these problems:\n${input.retryIssues.map((issue) => `- ${issue.message}`).join('\n')}\nFix every problem in the new result.`
    : ''
  const targetCount = input.targetExpressions?.length ?? 0
  const targets = targetCount > 0
    ? `\n10. Target expressions (count them as known words): weave at least ${Math.ceil(targetCount / 2)} of these into the dialogue verbatim, preferably in Speaker B's lines so the learner says them. For a pattern with ___, keep the fixed words exactly and fill ___ with a fitting word:\n${(input.targetExpressions ?? []).map((text) => `- ${text}`).join('\n')}`
    : ''

  return `Create a natural ${language} dialogue for this scene: ${input.sceneJa}
Learner interests: ${listInterests(input.interests)}.
${level}

Rules:
1. Write 6 to 8 turns. Speaker A is the scene-appropriate counterpart, such as a clerk or friend. Speaker B is the learner. Start with A and alternate A/B strictly.
2. ${lineLimit}
3. Prefer the learner's known words. Use only 4 to 6 new expressions, woven naturally into the dialogue.
4. Add a Japanese translation in ja for every turn.
5. For every turn add key: the core chunk of that line (a short phrase that appears verbatim in the line) as text, with its Japanese meaning in ja.
6. For every turn add note_ja: one or two short Japanese sentences ONLY when a learner would want an explanation right there (grammar, politeness level, nuance, culture). Otherwise use an empty string.
7. For every turn add exactly 2 prompts. Each prompt recombines pieces of this line with the learner's known words into a new, natural sentence within the line limit: cue_ja is a Japanese instruction such as 「『水をお願いします』と言ってください」 or 「相手に『他に何か要りますか』と聞いてください」, answer is the ${language} sentence, ja is its Japanese meaning. Do not simply repeat the line in both prompts.
8. For every new expression, add text, its Japanese meaning in ja, one Japanese usage sentence in note_ja, and the zero-based turn_index of the turn containing the exact text.
9. Return title_ja, scene_ja, turns (with key, note_ja, prompts), and new_expressions in the required JSON structure.${targets}

Known words (maximum 300): ${list(input.knownWords.slice(0, 300))}.${retry}`
}
