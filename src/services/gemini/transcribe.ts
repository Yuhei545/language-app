import type { TranscribeAudio } from '../speech/stt'
import { getGeminiClient, getModelId } from './client'
import { GeminiError, toGeminiError } from './errors'
import type { Lang } from './persona'

const languageNames: Record<Lang, string> = {
  en: 'English',
  ko: 'Korean',
}

export const transcribeAudio = (async (
  audio: { base64: string; mimeType: string },
  lang: Lang,
): Promise<string> => {
  try {
    const response = await getGeminiClient().models.generateContent({
      model: getModelId(),
      contents: [{
        role: 'user',
        parts: [
          { inlineData: { mimeType: audio.mimeType, data: audio.base64 } },
          {
            text: `Transcribe this ${languageNames[lang]} speech exactly. Output only the transcription, no explanation.`,
          },
        ],
      }],
    })
    const text = response.text?.trim()

    if (!text) {
      throw new GeminiError('音声を聞き取れませんでした', response.text, 'parse')
    }

    return text
  } catch (error) {
    if (error instanceof GeminiError) {
      throw error
    }

    throw toGeminiError(error)
  }
}) satisfies TranscribeAudio
