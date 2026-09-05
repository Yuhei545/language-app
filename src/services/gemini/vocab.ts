import { getGeminiClient, getModelId } from './client'
import { GeminiError, toGeminiError } from './errors'
import type { Lang } from './persona'
import {
  buildPrepPrompt,
  buildVocabPrompt,
  type PrepPromptInput,
  type VocabPromptInput,
} from './prompts'
import { vocabListSchema } from './schemas'

export type GeneratedVocab = {
  text: string
  emoji: string
  hint_ja: string
  example: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseVocabList(text: string | undefined): GeneratedVocab[] {
  if (!text) {
    throw new GeminiError('Geminiの語彙応答が空でした', text, 'parse')
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (error) {
    throw new GeminiError('Geminiの語彙応答を解析できませんでした', error, 'parse')
  }

  if (!isRecord(parsed) || !Array.isArray(parsed.items)) {
    throw new GeminiError('Geminiの語彙応答にitemsがありません', parsed, 'parse')
  }

  return parsed.items.map((item, index) => {
    if (
      !isRecord(item)
      || typeof item.text !== 'string'
      || typeof item.emoji !== 'string'
      || typeof item.hint_ja !== 'string'
      || typeof item.example !== 'string'
    ) {
      throw new GeminiError(`Geminiの語彙応答の${index + 1}件目が不正です`, item, 'parse')
    }

    return {
      text: item.text,
      emoji: item.emoji,
      hint_ja: item.hint_ja,
      example: item.example,
    }
  })
}

async function generateVocab(
  prompt: string,
  opts?: { signal?: AbortSignal },
): Promise<GeneratedVocab[]> {
  try {
    const response = await getGeminiClient().models.generateContent({
      model: getModelId(),
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: {
        responseMimeType: 'application/json',
        responseSchema: vocabListSchema,
        abortSignal: opts?.signal,
      },
    })

    return parseVocabList(response.text)
  } catch (error) {
    if (error instanceof GeminiError) {
      throw error
    }

    throw toGeminiError(error)
  }
}

export function generateWeeklyVocab(params: {
  lang: Lang
  week: number
  knownWords: string[]
  interests: VocabPromptInput['interests']
  count?: number
}, opts?: { signal?: AbortSignal }): Promise<GeneratedVocab[]> {
  return generateVocab(buildVocabPrompt(params), opts)
}

export function generatePrepPhrases(params: {
  lang: Lang
  title: string
  knownWords: string[]
}, opts?: { signal?: AbortSignal }): Promise<GeneratedVocab[]> {
  return generateVocab(buildPrepPrompt(params satisfies PrepPromptInput), opts)
}
