import type { Interest } from '../settings'
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
