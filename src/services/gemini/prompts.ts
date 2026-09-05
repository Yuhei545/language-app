import type { Interest } from '../settings'
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

export type DialogueLevel = 'practical-b1' | 'beginner'

export type DialoguePromptInput = {
  lang: Lang
  sceneJa: string
  interests: Interest[]
  knownWords: string[]
  level: DialogueLevel
  retryIssues?: DialogueIssue[]
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

  return `Create a natural ${language} dialogue for this scene: ${input.sceneJa}
Learner interests: ${listInterests(input.interests)}.
${level}

Rules:
1. Write 6 to 8 turns. Speaker A is the scene-appropriate counterpart, such as a clerk or friend. Speaker B is the learner. Start with A and alternate A/B strictly.
2. ${lineLimit}
3. Prefer the learner's known words. Use only 4 to 6 new expressions, woven naturally into the dialogue.
4. Add a Japanese translation in ja for every turn.
5. For every new expression, add text, its Japanese meaning in ja, one Japanese usage sentence in note_ja, and the zero-based turn_index of the turn containing the exact text.
6. Return title_ja, scene_ja, turns, and new_expressions in the required JSON structure.

Known words (maximum 300): ${list(input.knownWords.slice(0, 300))}.${retry}`
}
