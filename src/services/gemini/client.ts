import { GoogleGenAI } from '@google/genai'
import { getSettings } from '../settings'
import { GeminiError } from './errors'

let cachedApiKey: string | null = null
let cachedClient: GoogleGenAI | null = null

// 通信が止まったまま画面を待機させないためのSDK全体の上限。
export const GEMINI_TIMEOUT_MS = 30_000

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
