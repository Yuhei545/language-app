import { GoogleGenAI, type HttpRetryOptions } from '@google/genai'
import { getSettings } from '../settings'
import { GeminiError } from './errors'
import { scheduleGeminiRequest } from './throttle'
import { recordGeminiRequest } from './usage'

let cachedApiKey: string | null = null
let cachedClient: GoogleGenAI | null = null

// 通信が止まったまま画面を待機させないためのSDK全体の上限。
// 注意: SDK はこの値を X-Server-Timeout ヘッダー(秒)としても送るため、サーバー側がこの時間で
// 生成を打ち切り 504 DEADLINE_EXCEEDED を返す。短い応答(文字起こし・会話の返事)向けの値。
export const GEMINI_TIMEOUT_MS = 30_000
// 会話レッスンの生成のように出力が長い呼び出しは、リクエスト単位でこちらを使う。
export const LONG_GENERATION_TIMEOUT_MS = 120_000

/**
 * 一時的なサーバー障害(500/502/503 = 混雑)だけ、短い待ちで再試行する。
 * SDK の既定(5 回、504 も対象)は、期限切れ 504 をそのまま繰り返して数分固まるので使わない。
 * 429(無料枠)は数秒待っても回復しないので再試行せず、すぐに知らせる。
 */
export const TRANSIENT_RETRY: HttpRetryOptions = {
  attempts: 3,
  initialDelay: 1,
  maxDelay: 8,
  httpStatusCodes: [500, 502, 503],
}

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
