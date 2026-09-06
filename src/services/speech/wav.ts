const TARGET_SAMPLE_RATE = 16_000
const WAV_HEADER_BYTES = 44

function writeAscii(view: DataView, offset: number, value: string): void {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index))
  }
}

/**
 * WAVバイト列を ArrayBuffer として返す。
 * Blob を経由しないので、jsdom を含むどの環境からも中身を検証できる。
 */
export function encodeWavBuffer(samples: Float32Array, sampleRate: number): ArrayBuffer {
  if (!Number.isFinite(sampleRate) || sampleRate <= 0) {
    throw new RangeError('サンプルレートは正の数で指定してください')
  }

  const dataBytes = samples.length * 2
  const buffer = new ArrayBuffer(WAV_HEADER_BYTES + dataBytes)
  const view = new DataView(buffer)

  writeAscii(view, 0, 'RIFF')
  view.setUint32(4, 36 + dataBytes, true)
  writeAscii(view, 8, 'WAVE')
  writeAscii(view, 12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  writeAscii(view, 36, 'data')
  view.setUint32(40, dataBytes, true)

  for (let index = 0; index < samples.length; index += 1) {
    const clamped = Math.max(-1, Math.min(1, samples[index]))
    const pcm = clamped < 0
      ? Math.round(clamped * 0x8000)
      : Math.round(clamped * 0x7fff)
    view.setInt16(WAV_HEADER_BYTES + index * 2, pcm, true)
  }

  return buffer
}

export function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  return new Blob([encodeWavBuffer(samples, sampleRate)], { type: 'audio/wav' })
}

export function downmixToMono(channels: Float32Array[]): Float32Array {
  if (channels.length === 0) {
    return new Float32Array()
  }
  if (channels.length === 1) {
    return channels[0].slice()
  }

  const outputLength = channels.reduce(
    (longest, channel) => Math.max(longest, channel.length),
    0,
  )
  const output = new Float32Array(outputLength)

  channels.forEach((channel) => {
    for (let index = 0; index < channel.length; index += 1) {
      output[index] += channel[index] / channels.length
    }
  })

  return output
}

export function downsampleTo16k(input: Float32Array, inputRate: number): Float32Array {
  if (!Number.isFinite(inputRate) || inputRate <= 0) {
    throw new RangeError('入力サンプルレートは正の数で指定してください')
  }

  if (inputRate === TARGET_SAMPLE_RATE) {
    return input
  }

  if (input.length === 0) {
    return new Float32Array()
  }

  const outputLength = Math.round(input.length * TARGET_SAMPLE_RATE / inputRate)
  const output = new Float32Array(outputLength)
  const sourceStep = inputRate / TARGET_SAMPLE_RATE

  for (let index = 0; index < outputLength; index += 1) {
    const sourcePosition = index * sourceStep
    const leftIndex = Math.min(Math.floor(sourcePosition), input.length - 1)
    const rightIndex = Math.min(leftIndex + 1, input.length - 1)
    const fraction = sourcePosition - leftIndex
    output[index] = input[leftIndex] * (1 - fraction) + input[rightIndex] * fraction
  }

  return output
}

export function trimSilence(
  samples: Float32Array,
  sampleRate: number,
  opts: { threshold?: number; paddingSec?: number } = {},
): Float32Array {
  if (!Number.isFinite(sampleRate) || sampleRate <= 0) {
    throw new RangeError('サンプルレートは正の数で指定してください')
  }

  const threshold = opts.threshold ?? 0.01
  const paddingSec = opts.paddingSec ?? 0.2
  if (!Number.isFinite(threshold) || threshold < 0) {
    throw new RangeError('無音判定のしきい値は0以上で指定してください')
  }
  if (!Number.isFinite(paddingSec) || paddingSec < 0) {
    throw new RangeError('前後の余白は0秒以上で指定してください')
  }

  let firstSignal = -1
  let lastSignal = -1

  for (let index = 0; index < samples.length; index += 1) {
    if (Math.abs(samples[index]) > threshold) {
      if (firstSignal === -1) {
        firstSignal = index
      }
      lastSignal = index
    }
  }

  if (firstSignal === -1) {
    return new Float32Array()
  }

  const paddingSamples = Math.round(paddingSec * sampleRate)
  const start = Math.max(0, firstSignal - paddingSamples)
  const end = Math.min(samples.length, lastSignal + paddingSamples + 1)
  return samples.slice(start, end)
}

export function peakRms(
  samples: Float32Array,
  sampleRate: number,
  windowSec = 0.1,
): number {
  if (!Number.isFinite(sampleRate) || sampleRate <= 0) {
    throw new RangeError('サンプルレートは正の数で指定してください')
  }
  if (!Number.isFinite(windowSec) || windowSec <= 0) {
    throw new RangeError('RMSの窓幅は正の秒数で指定してください')
  }
  if (samples.length === 0) {
    return 0
  }

  const windowSamples = Math.max(1, Math.round(windowSec * sampleRate))
  let maximum = 0

  for (let start = 0; start < samples.length; start += windowSamples) {
    const end = Math.min(samples.length, start + windowSamples)
    let sumSquares = 0

    for (let index = start; index < end; index += 1) {
      sumSquares += samples[index] * samples[index]
    }

    maximum = Math.max(maximum, Math.sqrt(sumSquares / (end - start)))
  }

  return maximum
}

export function detectOnsetSec(
  samples: Float32Array,
  sampleRate: number,
  threshold = 0.01,
  windowSec = 0.02,
): number | null {
  if (!Number.isFinite(sampleRate) || sampleRate <= 0) {
    throw new RangeError('サンプルレートは正の数で指定してください')
  }
  if (!Number.isFinite(threshold) || threshold < 0) {
    throw new RangeError('音声開始判定のしきい値は0以上で指定してください')
  }
  if (!Number.isFinite(windowSec) || windowSec <= 0) {
    throw new RangeError('音声開始判定の窓幅は正の秒数で指定してください')
  }

  const windowSamples = Math.max(1, Math.round(windowSec * sampleRate))
  for (let start = 0; start < samples.length; start += windowSamples) {
    const end = Math.min(samples.length, start + windowSamples)
    let sumSquares = 0

    for (let index = start; index < end; index += 1) {
      sumSquares += samples[index] * samples[index]
    }

    if (Math.sqrt(sumSquares / (end - start)) > threshold) {
      return start / sampleRate
    }
  }

  return null
}

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        reject(new Error('音声データをbase64へ変換できませんでした'))
        return
      }

      const separatorIndex = reader.result.indexOf(',')
      resolve(separatorIndex >= 0 ? reader.result.slice(separatorIndex + 1) : reader.result)
    }
    reader.onerror = () => {
      reject(reader.error ?? new Error('音声データをbase64へ変換できませんでした'))
    }
    reader.readAsDataURL(blob)
  })
}

/** Gemini TTS が返す 16bit PCM(base64、リトルエンディアン)を -1〜1 のサンプルにする。 */
export function decodePcm16Base64(base64: string): Float32Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  const usable = bytes.byteLength - (bytes.byteLength % 2)
  const view = new DataView(bytes.buffer, bytes.byteOffset, usable)
  const samples = new Float32Array(usable / 2)
  for (let index = 0; index < samples.length; index += 1) {
    samples[index] = view.getInt16(index * 2, true) / 32768
  }
  return samples
}

export type SplitOptions = {
  /** これ未満の窓 RMS を無音とみなす。 */
  threshold: number
  /** 境目とみなす無音の最短の長さ(秒)。 */
  minGapSec: number
  windowSec: number
  /** 切り出した音声の前後に残す無音(秒)。 */
  paddingSec: number
}

export const DEFAULT_SPLIT_OPTIONS: SplitOptions = {
  threshold: 0.01,
  minGapSec: 0.45,
  windowSec: 0.02,
  paddingSec: 0.08,
}

/**
 * まとめて合成した音声を、無音で count 個に切り分ける。
 * 無音区間(minGapSec 以上続く)のうち長い順に count-1 個を境目にし、各区間の前後の無音を落とす。
 * ちょうど count 個に分けられないときは null(呼び出し側は 1 文ずつ作り直す)。
 */
export function splitBySilence(
  samples: Float32Array,
  sampleRate: number,
  count: number,
  opts: Partial<SplitOptions> = {},
): Float32Array[] | null {
  const options = { ...DEFAULT_SPLIT_OPTIONS, ...opts }
  if (count < 1 || samples.length === 0) {
    return null
  }
  const windowSize = Math.max(1, Math.round(sampleRate * options.windowSec))
  const windowCount = Math.ceil(samples.length / windowSize)
  const loud: boolean[] = []
  for (let window = 0; window < windowCount; window += 1) {
    const start = window * windowSize
    const end = Math.min(samples.length, start + windowSize)
    let sum = 0
    for (let index = start; index < end; index += 1) {
      sum += samples[index] * samples[index]
    }
    loud.push(Math.sqrt(sum / (end - start)) >= options.threshold)
  }

  // 音のある範囲(先頭と末尾の無音は境目にしない)
  const firstLoud = loud.indexOf(true)
  const lastLoud = loud.lastIndexOf(true)
  if (firstLoud < 0) {
    return null
  }

  const gaps: Array<{ start: number; end: number }> = []
  let gapStart: number | null = null
  for (let window = firstLoud; window <= lastLoud; window += 1) {
    if (!loud[window]) {
      gapStart ??= window
    } else if (gapStart !== null) {
      gaps.push({ start: gapStart, end: window })
      gapStart = null
    }
  }
  const minGapWindows = Math.ceil(options.minGapSec / options.windowSec)
  const longGaps = gaps
    .filter((gap) => gap.end - gap.start >= minGapWindows)
    .sort((left, right) => (right.end - right.start) - (left.end - left.start))
    .slice(0, count - 1)
    .sort((left, right) => left.start - right.start)
  if (longGaps.length !== count - 1) {
    return null
  }

  const padding = Math.round(options.paddingSec * sampleRate)
  const boundaries = [firstLoud * windowSize, ...longGaps.map((gap) => Math.round(((gap.start + gap.end) / 2) * windowSize)), (lastLoud + 1) * windowSize]
  const segments: Float32Array[] = []
  for (let index = 0; index < count; index += 1) {
    let start = boundaries[index]
    let end = Math.min(samples.length, boundaries[index + 1])
    // 区間の中の先頭・末尾の無音を落とす
    while (start < end && Math.abs(samples[start]) < options.threshold) start += 1
    while (end > start && Math.abs(samples[end - 1]) < options.threshold) end -= 1
    start = Math.max(0, start - padding)
    end = Math.min(samples.length, end + padding)
    if (end - start < sampleRate * 0.15) {
      return null
    }
    segments.push(samples.slice(start, end))
  }
  return segments
}
