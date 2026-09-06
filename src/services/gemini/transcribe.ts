import type { TranscribeAudio } from '../speech/stt'
import { getGeminiClient, getSttModelId } from './client'
import { GeminiError, toGeminiError } from './errors'
import type { Lang } from './persona'
import { buildTranscribePrompt } from './prompts'

export const transcribeAudio = (async (
  audio: { base64: string; mimeType: string },
  lang: Lang,
  opts?: { signal?: AbortSignal },
): Promise<string> => {
  try {
    const response = await getGeminiClient().models.generateContent({
      model: getSttModelId(),
      contents: [{
        role: 'user',
        parts: [
          { inlineData: { mimeType: audio.mimeType, data: audio.base64 } },
          { text: buildTranscribePrompt(lang) },
        ],
      }],
      config: {
        temperature: 0,
        maxOutputTokens: 96,
        abortSignal: opts?.signal,
      },
    })
    const text = response.text?.trim()

    if (!text) {
      throw new GeminiError('音声を聞き取れませんでした', response.text, 'parse')
    }

    if (/NO_SPEECH/i.test(text)) {
      throw new GeminiError(
        '声が聞こえませんでした。もう少し近くで話してみてください',
        response.text,
        'parse',
      )
    }

    return text
  } catch (error) {
    if (error instanceof GeminiError) {
      throw error
    }

    throw toGeminiError(error)
  }
}) satisfies TranscribeAudio
