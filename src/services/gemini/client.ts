import { GoogleGenAI } from '@google/genai'
import { getSettings } from '../settings'
import { GeminiError } from './errors'

let cachedApiKey: string | null = null
let cachedClient: GoogleGenAI | null = null

// 通信が止まったまま画面を待機させないためのSDK全体の上限。
// 注意: SDK はこの値を X-Server-Timeout ヘッダー(秒)としても送るため、サーバー側がこの時間で
// 生成を打ち切り 504 DEADLINE_EXCEEDED を返す。短い応答(文字起こし・会話の返事)向けの値。
export const GEMINI_TIMEOUT_MS = 30_000
// 会話レッスンの生成のように出力が長い呼び出しは、リクエスト単位でこちらを使う。
export const LONG_GENERATION_TIMEOUT_MS = 120_000

export function getGeminiClient(): GoogleGenAI {
  const apiKey = getSettings().geminiApiKey.trim()

  if (!apiKey) {
    throw new GeminiError('設定画面で Gemini の APIキーを入力してください', undefined, 'auth')
  }

  if (!cachedClient || cachedApiKey !== apiKey) {
    cachedClient = new GoogleGenAI({
      apiKey,
      httpOptions: { timeout: GEMINI_TIMEOUT_MS },
    })
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
