import { Modality } from '@google/genai'
import { decodePcm16Base64, splitBySilence } from '../speech/wav'
import { getGeminiClient, LONG_GENERATION_TIMEOUT_MS, TRANSIENT_RETRY } from './client'
import { GeminiError, toGeminiError } from './errors'

export const DEFAULT_TTS_MODEL = 'gemini-2.5-flash-preview-tts'
export const TTS_SAMPLE_RATE = 24_000

const LANGUAGE_CODES = { en: 'en-US', ko: 'ko-KR', ja: 'ja-JP' } as const

export type TtsLang = keyof typeof LANGUAGE_CODES

export type SynthesizedAudio = {
  samples: Float32Array
  sampleRate: number
}

type Part = { inlineData?: { data?: string; mimeType?: string } }

function extractAudio(response: { candidates?: Array<{ content?: { parts?: Part[] } }> }): SynthesizedAudio {
  const part = response.candidates?.[0]?.content?.parts?.find((candidate) => candidate.inlineData?.data)
  const data = part?.inlineData?.data
  if (!data) {
    throw new GeminiError('音声を生成できませんでした(応答に音声がありません)', response, 'parse')
  }
  const rate = /rate=(\d+)/.exec(part?.inlineData?.mimeType ?? '')?.[1]
  return {
    samples: decodePcm16Base64(data),
    sampleRate: rate ? Number(rate) : TTS_SAMPLE_RATE,
  }
}

async function request(
  text: string,
  lang: TtsLang,
  voiceName: string,
  model: string,
  signal: AbortSignal | undefined,
): Promise<SynthesizedAudio> {
  try {
    const response = await getGeminiClient().models.generateContent({
      model,
      contents: [{ role: 'user', parts: [{ text }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          languageCode: LANGUAGE_CODES[lang],
          voiceConfig: { prebuiltVoiceConfig: { voiceName } },
        },
        abortSignal: signal,
        httpOptions: {
          timeout: LONG_GENERATION_TIMEOUT_MS,
          retryOptions: { ...TRANSIENT_RETRY, attempts: 3, initialDelay: 2, maxDelay: 10 },
        },
      },
    })
    return extractAudio(response)
  } catch (error) {
    throw toGeminiError(error)
  }
}

/** 1 文を合成する。 */
export function synthesizeSpeech(
  params: { text: string; lang: TtsLang; voiceName: string; model?: string },
  opts: { signal?: AbortSignal } = {},
): Promise<SynthesizedAudio> {
  return request(params.text, params.lang, params.voiceName, params.model ?? DEFAULT_TTS_MODEL, opts.signal)
}

/**
 * 複数の文を 1 回の呼び出しで合成し、無音で切り分ける。
 * 無料枠の回数を節約するため。切り分けが文の数と合わなければ null を返す(呼び出し側で 1 文ずつに戻す)。
 */
export async function synthesizeBatch(
  params: { texts: string[]; lang: TtsLang; voiceName: string; model?: string },
  opts: { signal?: AbortSignal } = {},
): Promise<SynthesizedAudio[] | null> {
  const texts = params.texts.map((text) => text.trim()).filter((text) => text.length > 0)
  if (texts.length === 0) {
    return []
  }
  if (texts.length === 1) {
    return [await synthesizeSpeech({ ...params, text: texts[0] }, opts)]
  }

  const script = [
    `Read each of the following ${texts.length} lines as a separate utterance. Stay silent for about one second between lines. Do not read this instruction.`,
    '',
    ...texts.flatMap((text) => [text, '']),
  ].join('\n')
  const audio = await request(script, params.lang, params.voiceName, params.model ?? DEFAULT_TTS_MODEL, opts.signal)
  const segments = splitBySilence(audio.samples, audio.sampleRate, texts.length)
  if (!segments) {
    console.warn('まとめて作った音声を文の数に切り分けられなかったので、1 文ずつ作り直します', { count: texts.length })
    return null
  }
  return segments.map((samples) => ({ samples, sampleRate: audio.sampleRate }))
}
