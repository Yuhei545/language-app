import { getGeminiClient, getModelId } from './client'
import { GeminiError, toGeminiError } from './errors'
import {
  buildMixingCheckPrompt,
  buildParentSystemPrompt,
  type MixingCheckPromptInput,
  type ParentPromptInput,
} from './prompts'
import { mixingCheckSchema, parentReplySchema } from './schemas'

export type ParentTurn = {
  reply: string
  simpler: string
  ja: string
  new_words: string[]
}

export type MixingCheckResult = {
  understood: boolean
  recast: string
  ja: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseParentTurn(text: string | undefined): ParentTurn {
  if (!text) {
    throw new GeminiError('Geminiの応答が空でした', text, 'parse')
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (error) {
    throw new GeminiError('Geminiの会話応答を解析できませんでした', error, 'parse')
  }

  if (
    !isRecord(parsed)
    || typeof parsed.reply !== 'string'
    || typeof parsed.simpler !== 'string'
    || typeof parsed.ja !== 'string'
    || !Array.isArray(parsed.new_words)
    || !parsed.new_words.every((word) => typeof word === 'string')
  ) {
    throw new GeminiError('Geminiの会話応答に必要な項目がありません', parsed, 'parse')
  }

  return {
    reply: parsed.reply,
    simpler: parsed.simpler,
    ja: parsed.ja,
    new_words: [...parsed.new_words],
  }
}

function parseMixingCheck(text: string | undefined): MixingCheckResult {
  if (!text) {
    throw new GeminiError('Geminiの意味判定が空でした', text, 'parse')
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (error) {
    throw new GeminiError('Geminiの意味判定を解析できませんでした', error, 'parse')
  }

  if (
    !isRecord(parsed)
    || typeof parsed.understood !== 'boolean'
    || typeof parsed.recast !== 'string'
    || typeof parsed.ja !== 'string'
  ) {
    throw new GeminiError('Geminiの意味判定に必要な項目がありません', parsed, 'parse')
  }

  return {
    understood: parsed.understood,
    recast: parsed.recast,
    ja: parsed.ja,
  }
}

export async function sendParentTurn(params: {
  input: ParentPromptInput
  history: Array<{ role: 'user' | 'assistant'; text: string }>
  userText: string
}): Promise<ParentTurn> {
  try {
    const contents = [
      ...params.history.map((message) => ({
        role: message.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: message.text }],
      })),
      { role: 'user', parts: [{ text: params.userText }] },
    ]
    const response = await getGeminiClient().models.generateContent({
      model: getModelId(),
      contents,
      config: {
        systemInstruction: buildParentSystemPrompt(params.input),
        responseMimeType: 'application/json',
        responseSchema: parentReplySchema,
      },
    })

    return parseParentTurn(response.text)
  } catch (error) {
    if (error instanceof GeminiError) {
      throw error
    }

    throw toGeminiError(error)
  }
}

export async function checkMixingTurn(
  input: MixingCheckPromptInput,
): Promise<MixingCheckResult> {
  try {
    const response = await getGeminiClient().models.generateContent({
      model: getModelId(),
      contents: [{
        role: 'user',
        parts: [{ text: buildMixingCheckPrompt(input) }],
      }],
      config: {
        temperature: 0.3,
        responseMimeType: 'application/json',
        responseSchema: mixingCheckSchema,
      },
    })

    return parseMixingCheck(response.text)
  } catch (error) {
    if (error instanceof GeminiError) {
      throw error
    }

    throw toGeminiError(error)
  }
}
