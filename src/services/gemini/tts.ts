import { Modality, type GoogleGenAI } from '@google/genai'
import { decodePcm16Base64, splitBySilence, type SplitOptions } from '../speech/wav'
import { GeminiError, toGeminiError } from './errors'
import { LONG_GENERATION_TIMEOUT_MS, TRANSIENT_RETRY } from './httpOptions'

export const DEFAULT_TTS_MODEL = 'gemini-2.5-flash-preview-tts'
/** 既定のモデルが使えなくなったときに順に試す id。 */
export const TTS_MODEL_FALLBACKS = ['gemini-2.5-flash-preview-tts', 'gemini-3.1-flash-tts-preview'] as const
export const TTS_SAMPLE_RATE = 24_000

// TtsLang 型を定義するためだけに残す。音声合成 API には送信しない。
export const LANGUAGE_CODES = { en: 'en-US', ko: 'ko-KR', ja: 'ja-JP' } as const

export type TtsLang = keyof typeof LANGUAGE_CODES

/**
 * 呼び出しの選択肢。client を渡せば(Node のスクリプトなど)ブラウザの設定に依らずに使える。
 * 省略時はアプリの client(設定の API キー、throttle、回数の記録つき)を使う。
 */
export type TtsRequestOptions = { signal?: AbortSignal; client?: GoogleGenAI }

export type SynthesizedAudio = {
  samples: Float32Array
  sampleRate: number
}

type Part = { inlineData?: { data?: string; mimeType?: string } }

const END_MARK_PATTERN = /[.!?。！？…]\s*$/u

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

async function resolveClient(opts: TtsRequestOptions): Promise<GoogleGenAI> {
  if (opts.client) {
    return opts.client
  }
  // アプリの client は設定(localStorage)に依るので、必要なときだけ読み込む
  const { getGeminiClient } = await import('./client')
  return getGeminiClient()
}

async function request(
  text: string,
  voiceName: string,
  model: string,
  opts: TtsRequestOptions,
): Promise<SynthesizedAudio> {
  let client: GoogleGenAI
  try {
    client = await resolveClient(opts)
  } catch (error) {
    throw toGeminiError(error)
  }

  const generate = async (requestText: string): Promise<SynthesizedAudio> => {
    const response = await client.models.generateContent({
      model,
      contents: [{ role: 'user', parts: [{ text: requestText }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          // languageCode を付けると短い日本語で finishReason OTHER になり、音声が返らないことがある（2026-09 実測）。
          // モデルは本文から言語を判別するため、指定しない。
          voiceConfig: { prebuiltVoiceConfig: { voiceName } },
        },
        abortSignal: opts.signal,
        httpOptions: {
          timeout: LONG_GENERATION_TIMEOUT_MS,
          retryOptions: { ...TRANSIENT_RETRY, attempts: 3, initialDelay: 2, maxDelay: 10 },
        },
      },
    })
    return extractAudio(response)
  }

  try {
    return await generate(text)
  } catch (error) {
    const geminiError = toGeminiError(error)
    if (geminiError.kind !== 'parse' || END_MARK_PATTERN.test(text)) {
      throw geminiError
    }

    // 終わりの記号が無い短い文(go)は finishReason OTHER で音声が返らないことがある(2026-09 実測)。
    // 記号を足すと返るので、API に送る文だけに 1 回だけ足してやり直す。
    const retryText = `${text.trimEnd()}.`
    console.warn(`音声がないため、文末に「.」を足して1回だけやり直します: ${JSON.stringify(text)}`)
    try {
      return await generate(retryText)
    } catch (retryError) {
      throw toGeminiError(retryError)
    }
  }
}

function errorStatus(error: unknown): number | undefined {
  let current = error
  const visited = new Set<unknown>()
  while (typeof current === 'object' && current !== null && !visited.has(current)) {
    visited.add(current)
    const candidate = current as { status?: unknown; statusCode?: unknown; code?: unknown; cause?: unknown }
    const status = candidate.status ?? candidate.statusCode ?? candidate.code
    if (typeof status === 'number') {
      return status
    }
    if (typeof status === 'string' && /^\d+$/.test(status)) {
      return Number(status)
    }
    current = candidate.cause
  }
  return undefined
}

function shouldTryAnotherModel(error: GeminiError): boolean {
  if (error.kind === 'parse') {
    return true
  }
  if (error.kind === 'quota' || error.kind === 'network') {
    return false
  }

  const status = errorStatus(error)
  const message = error.message.toLowerCase()
  return (
    (status === 400 && (message.includes('should only be used for tts') || message.includes('generate text')))
    || status === 404
    || message.includes('not found')
    || message.includes('not_found')
  )
}

/** 1 文を合成する。 */
export async function synthesizeSpeech(
  params: { text: string; lang: TtsLang; voiceName: string; model?: string },
  opts: TtsRequestOptions = {},
): Promise<SynthesizedAudio> {
  const firstModel = params.model ?? DEFAULT_TTS_MODEL
  const models = [firstModel, ...TTS_MODEL_FALLBACKS.filter((model) => model !== firstModel)]
  let lastError: GeminiError | null = null

  for (const model of models) {
    try {
      const audio = await request(params.text, params.voiceName, model, opts)
      if (model !== firstModel) {
        console.warn(`${firstModel} で失敗したため ${model} で作りました`)
      }
      return audio
    } catch (error) {
      const geminiError = toGeminiError(error)
      lastError = geminiError
      if (!shouldTryAnotherModel(geminiError)) {
        throw geminiError
      }
    }
  }

  // 2026-09 の実測で、2.5 TTS は短文を音声ではなくテキストとして生成し HTTP 400 になり、
  // 同じ短文を 3.1 TTS に送ると音声が返った。対象の失敗だけ、利用可能な TTS モデルへ切り替える。
  throw lastError ?? new GeminiError('音声を生成できませんでした', undefined, 'unknown')
}

/** まとめて合成するときの台本。文の間に約 1 秒の無音を入れさせ、指示文は読ませない。 */
export function buildBatchScript(texts: string[]): string {
  return [
    `Read each of the following ${texts.length} lines as a separate utterance. Stay silent for about one second between lines. Do not read this instruction.`,
    '',
    ...texts.flatMap((text) => [text, '']),
  ].join('\n')
}

/**
 * 複数の文を 1 回の呼び出しで合成し、無音で切り分ける。
 * 無料枠の回数を節約するため。切り分けが文の数と合わなければ null を返す(呼び出し側で 1 文ずつに戻す)。
 */
export async function synthesizeBatch(
  params: { texts: string[]; lang: TtsLang; voiceName: string; model?: string },
  opts: TtsRequestOptions & { splitOptions?: Partial<SplitOptions> } = {},
): Promise<SynthesizedAudio[] | null> {
  const texts = params.texts.map((text) => text.trim()).filter((text) => text.length > 0)
  if (texts.length === 0) {
    return []
  }
  if (texts.length === 1) {
    return [await synthesizeSpeech({ ...params, text: texts[0] }, opts)]
  }

  const audio = await request(buildBatchScript(texts), params.voiceName, params.model ?? DEFAULT_TTS_MODEL, opts)
  const segments = splitBySilence(audio.samples, audio.sampleRate, texts.length, opts.splitOptions)
  if (!segments) {
    console.warn('まとめて作った音声を文の数に切り分けられなかったので、1 文ずつ作り直します', { count: texts.length })
    return null
  }
  return segments.map((samples) => ({ samples, sampleRate: audio.sampleRate }))
}
