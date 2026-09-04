import { GoogleGenAI } from '@google/genai'
import { getSettings } from '../settings'
import { GeminiError } from './errors'

let cachedApiKey: string | null = null
let cachedClient: GoogleGenAI | null = null

export function getGeminiClient(): GoogleGenAI {
  const apiKey = getSettings().geminiApiKey.trim()

  if (!apiKey) {
    throw new GeminiError('設定画面で Gemini の APIキーを入力してください', undefined, 'auth')
  }

  if (!cachedClient || cachedApiKey !== apiKey) {
    cachedClient = new GoogleGenAI({ apiKey })
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
