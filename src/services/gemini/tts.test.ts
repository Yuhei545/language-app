import type { GoogleGenAI } from '@google/genai'
import { describe, expect, it, vi } from 'vitest'
import { GeminiError } from './errors'
import { synthesizeSpeech } from './tts'

function apiError(status: number, message: string): Error & { status: number } {
  return Object.assign(new Error(message), { status })
}

describe('synthesizeSpeech', () => {
  it('TTS 専用モデルがテキストを生成しようとした 400 では次のモデルを試す', async () => {
    const generateContent = vi.fn()
      .mockRejectedValueOnce(apiError(400, 'Model tried to generate text, but it should only be used for TTS.'))
      .mockResolvedValueOnce({
        candidates: [{ content: { parts: [{ inlineData: { data: 'AAA=', mimeType: 'audio/pcm;rate=24000' } }] } }],
      })
    const client = { models: { generateContent } } as unknown as GoogleGenAI

    const audio = await synthesizeSpeech(
      { text: 'Hello.', lang: 'en', voiceName: 'Kore' },
      { client },
    )

    expect(audio.samples).toHaveLength(1)
    expect(audio.sampleRate).toBe(24_000)
    expect(generateContent).toHaveBeenCalledTimes(2)
    expect(generateContent.mock.calls.map(([request]) => request.model)).toEqual([
      'gemini-2.5-flash-preview-tts',
      'gemini-3.1-flash-tts-preview',
    ])
  })

  it('利用上限のエラーでは別のモデルへ切り替えない', async () => {
    const generateContent = vi.fn().mockRejectedValue(new GeminiError('利用上限です', undefined, 'quota'))
    const client = { models: { generateContent } } as unknown as GoogleGenAI

    await expect(synthesizeSpeech(
      { text: 'Hello.', lang: 'en', voiceName: 'Kore' },
      { client },
    )).rejects.toMatchObject({ kind: 'quota' })
    expect(generateContent).toHaveBeenCalledTimes(1)
  })
})
