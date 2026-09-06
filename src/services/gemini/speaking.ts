import {
  getGeminiClient,
  getModelId,
  LONG_GENERATION_TIMEOUT_MS,
  TRANSIENT_RETRY,
} from './client'
import { GeminiError, toGeminiError } from './errors'
import {
  buildQuickJudgePrompt,
  buildQuickQuestionsPrompt,
  buildTopicCheckPrompt,
  buildTranslatePersonalWordPrompt,
  type QuickJudgePromptInput,
  type QuickQuestionsPromptInput,
  type TopicCheckPromptInput,
  type TranslatePersonalWordPromptInput,
} from './prompts'
import {
  personalWordTranslationSchema,
  quickJudgeSchema,
  quickQuestionsSchema,
  topicCheckSchema,
} from './schemas'

export type TopicCheckResult = {
  understood: boolean
  recast: string
  ja: string
  follow_up: string
  follow_up_ja: string
}

export type QuickQuestion = {
  q: string
  ja: string
}

export type QuickAnswerJudgment = {
  understood: boolean
  better: string
}

export type PersonalWordTranslation = {
  en: string
  ko: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseJson(text: string | undefined, label: string): unknown {
  if (!text?.trim()) {
    throw new GeminiError(`Geminiの${label}応答が空でした`, text, 'parse')
  }

  try {
    return JSON.parse(text) as unknown
  } catch (error) {
    throw new GeminiError(`Geminiの${label}応答を解析できませんでした`, error, 'parse')
  }
}

function parseTopicCheck(text: string | undefined): TopicCheckResult {
  const parsed = parseJson(text, 'お題判定')
  if (
    !isRecord(parsed)
    || typeof parsed.understood !== 'boolean'
    || typeof parsed.recast !== 'string'
    || typeof parsed.ja !== 'string'
    || typeof parsed.follow_up !== 'string'
    || typeof parsed.follow_up_ja !== 'string'
  ) {
    throw new GeminiError('Geminiのお題判定に必要な項目がありません', parsed, 'parse')
  }

  return {
    understood: parsed.understood,
    recast: parsed.recast,
    ja: parsed.ja,
    follow_up: parsed.follow_up,
    follow_up_ja: parsed.follow_up_ja,
  }
}

function parseQuickQuestions(
  text: string | undefined,
  expectedCount: number,
): QuickQuestion[] {
  const parsed = parseJson(text, '即答質問')
  if (!Array.isArray(parsed)) {
    throw new GeminiError('Geminiの即答質問が配列ではありません', parsed, 'parse')
  }
  if (parsed.length !== expectedCount) {
    throw new GeminiError(
      `Geminiの即答質問は${expectedCount}件必要ですが、${parsed.length}件でした`,
      parsed,
      'parse',
    )
  }

  return parsed.map((item, index) => {
    if (!isRecord(item) || typeof item.q !== 'string' || typeof item.ja !== 'string') {
      throw new GeminiError(
        `Geminiの即答質問の${index + 1}件目に必要な項目がありません`,
        item,
        'parse',
      )
    }
    return { q: item.q, ja: item.ja }
  })
}

function parseQuickJudgments(
  text: string | undefined,
  expectedCount: number,
): QuickAnswerJudgment[] {
  const parsed = parseJson(text, '即答判定')
  if (!Array.isArray(parsed)) {
    throw new GeminiError('Geminiの即答判定が配列ではありません', parsed, 'parse')
  }
  if (parsed.length !== expectedCount) {
    throw new GeminiError(
      `Geminiの即答判定は${expectedCount}件必要ですが、${parsed.length}件でした`,
      parsed,
      'parse',
    )
  }

  return parsed.map((item, index) => {
    if (
      !isRecord(item)
      || typeof item.understood !== 'boolean'
      || typeof item.better !== 'string'
    ) {
      throw new GeminiError(
        `Geminiの即答判定の${index + 1}件目に必要な項目がありません`,
        item,
        'parse',
      )
    }
    return { understood: item.understood, better: item.better }
  })
}

function parsePersonalWordTranslation(text: string | undefined): PersonalWordTranslation {
  const parsed = parseJson(text, '自分の語の翻訳')
  if (!isRecord(parsed) || typeof parsed.en !== 'string' || typeof parsed.ko !== 'string') {
    throw new GeminiError('Geminiの自分の語の翻訳に必要な項目がありません', parsed, 'parse')
  }

  return { en: parsed.en, ko: parsed.ko }
}

export async function checkTopicTurn(
  params: TopicCheckPromptInput,
  opts?: { signal?: AbortSignal },
): Promise<TopicCheckResult> {
  try {
    const response = await getGeminiClient().models.generateContent({
      model: getModelId(),
      contents: [{
        role: 'user',
        parts: [{ text: buildTopicCheckPrompt(params) }],
      }],
      config: {
        responseMimeType: 'application/json',
        responseSchema: topicCheckSchema,
        abortSignal: opts?.signal,
      },
    })

    return parseTopicCheck(response.text)
  } catch (error) {
    if (error instanceof GeminiError) {
      throw error
    }
    throw toGeminiError(error)
  }
}

export async function generateQuickQuestions(
  params: QuickQuestionsPromptInput,
  opts?: { signal?: AbortSignal },
): Promise<QuickQuestion[]> {
  try {
    const response = await getGeminiClient().models.generateContent({
      model: getModelId(),
      contents: [{
        role: 'user',
        parts: [{ text: buildQuickQuestionsPrompt(params) }],
      }],
      config: {
        responseMimeType: 'application/json',
        responseSchema: quickQuestionsSchema,
        abortSignal: opts?.signal,
        httpOptions: {
          timeout: LONG_GENERATION_TIMEOUT_MS,
          retryOptions: {
            ...TRANSIENT_RETRY,
            attempts: 4,
            initialDelay: 2,
            maxDelay: 15,
          },
        },
      },
    })

    return parseQuickQuestions(response.text, params.count ?? 8)
  } catch (error) {
    if (error instanceof GeminiError) {
      throw error
    }
    throw toGeminiError(error)
  }
}

export async function judgeQuickAnswers(
  params: QuickJudgePromptInput,
  opts?: { signal?: AbortSignal },
): Promise<QuickAnswerJudgment[]> {
  try {
    const response = await getGeminiClient().models.generateContent({
      model: getModelId(),
      contents: [{
        role: 'user',
        parts: [{ text: buildQuickJudgePrompt(params) }],
      }],
      config: {
        responseMimeType: 'application/json',
        responseSchema: quickJudgeSchema,
        abortSignal: opts?.signal,
        httpOptions: {
          timeout: LONG_GENERATION_TIMEOUT_MS,
          retryOptions: {
            ...TRANSIENT_RETRY,
            attempts: 4,
            initialDelay: 2,
            maxDelay: 15,
          },
        },
      },
    })

    return parseQuickJudgments(response.text, params.items.length)
  } catch (error) {
    if (error instanceof GeminiError) {
      throw error
    }
    throw toGeminiError(error)
  }
}

export async function translatePersonalWord(
  params: TranslatePersonalWordPromptInput,
  opts?: { signal?: AbortSignal },
): Promise<PersonalWordTranslation> {
  try {
    const response = await getGeminiClient().models.generateContent({
      model: getModelId(),
      contents: [{
        role: 'user',
        parts: [{ text: buildTranslatePersonalWordPrompt(params) }],
      }],
      config: {
        responseMimeType: 'application/json',
        responseSchema: personalWordTranslationSchema,
        abortSignal: opts?.signal,
      },
    })

    return parsePersonalWordTranslation(response.text)
  } catch (error) {
    if (error instanceof GeminiError) {
      throw error
    }
    throw toGeminiError(error)
  }
}
