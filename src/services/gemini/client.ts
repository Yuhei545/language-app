import { GoogleGenAI } from '@google/genai'
import { getSettings } from '../settings'
import { GeminiError } from './errors'
import { GEMINI_TIMEOUT_MS, LONG_GENERATION_TIMEOUT_MS, TRANSIENT_RETRY } from './httpOptions'
import { scheduleGeminiRequest } from './throttle'
import { recordGeminiRequest } from './usage'

export { GEMINI_TIMEOUT_MS, LONG_GENERATION_TIMEOUT_MS, TRANSIENT_RETRY }

let cachedApiKey: string | null = null
let cachedClient: GoogleGenAI | null = null

/**
 * 呼び出しを 1 本の列に通し、回数を数える。
 * 無料枠は 1 分あたりの上限が小さいので、まとめて投げないようにするのが目的。
 */
function withThrottleAndUsage(client: GoogleGenAI): GoogleGenAI {
  const models = client.models
  const original = models.generateContent.bind(models)
  models.generateContent = ((params: Parameters<typeof original>[0]) => (
    scheduleGeminiRequest(() => {
      recordGeminiRequest()
      return original(params)
    })
  )) as typeof models.generateContent
  return client
}

export function getGeminiClient(): GoogleGenAI {
  const apiKey = getSettings().geminiApiKey.trim()

  if (!apiKey) {
    throw new GeminiError('設定画面で Gemini の APIキーを入力してください', undefined, 'auth')
  }

  if (!cachedClient || cachedApiKey !== apiKey) {
    cachedClient = withThrottleAndUsage(new GoogleGenAI({
      apiKey,
      httpOptions: { timeout: GEMINI_TIMEOUT_MS, retryOptions: TRANSIENT_RETRY },
    }))
    cachedApiKey = apiKey
  }

  return cachedClient
}

export function getModelId(): string {
  const model = getSettings().geminiModel.trim()

  if (!model) {
    throw new GeminiError('設定画面で Gemini のモデルを選んでください')
  }

  return model
}

/**
 * 音声の文字起こしに使うモデル。設定が空なら通常のモデルと同じ。
 * 無料枠の上限はモデルごとに別なので、軽いモデルを分けて指定すると上限を分散できる。
 */
export function getSttModelId(): string {
  const model = getSettings().geminiSttModel.trim()
  return model || getModelId()
}
