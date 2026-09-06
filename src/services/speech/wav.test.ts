import { describe, expect, it } from 'vitest'
import {
  downmixToMono,
  downsampleTo16k,
  detectOnsetSec,
  encodeWavBuffer,
  peakRms,
  trimSilence,
} from './wav'

function getView(buffer: ArrayBuffer): DataView {
  return new DataView(buffer)
}

function readAscii(view: DataView, offset: number, length: number): string {
  return Array.from(
    { length },
    (_, index) => String.fromCharCode(view.getUint8(offset + index)),
  ).join('')
}

describe('encodeWav', () => {
  it('16bit PCMモノラルのWAVヘッダを生成する', async () => {
    const sampleRate = 16_000
    const samples = new Float32Array([0, 0.5, -0.5])
    const view = getView(encodeWavBuffer(samples, sampleRate))

    expect(readAscii(view, 0, 4)).toBe('RIFF')
    expect(view.getUint32(4, true)).toBe(36 + samples.length * 2)
    expect(readAscii(view, 8, 4)).toBe('WAVE')
    expect(readAscii(view, 12, 4)).toBe('fmt ')
    expect(view.getUint32(16, true)).toBe(16)
    expect(view.getUint16(20, true)).toBe(1)
    expect(view.getUint16(22, true)).toBe(1)
    expect(view.getUint32(24, true)).toBe(sampleRate)
    expect(view.getUint32(28, true)).toBe(sampleRate * 2)
    expect(view.getUint16(32, true)).toBe(2)
    expect(view.getUint16(34, true)).toBe(16)
    expect(readAscii(view, 36, 4)).toBe('data')
    expect(view.getUint32(40, true)).toBe(samples.length * 2)
    expect(view.byteLength).toBe(44 + samples.length * 2)
  })

  it('±1を超えるサンプルをクランプする', async () => {
    const view = getView(encodeWavBuffer(new Float32Array([-2, 2]), 16_000))

    expect(view.getInt16(44, true)).toBe(-32_768)
    expect(view.getInt16(46, true)).toBe(32_767)
  })
})

describe('downsampleTo16k', () => {
  it('入力が16000Hzなら同じ配列を返す', () => {
    const input = new Float32Array([0, 0.5, 1])
    expect(downsampleTo16k(input, 16_000)).toBe(input)
  })

  it('48000Hzから16000Hzへ変換すると長さが3分の1になる', () => {
    const input = new Float32Array(480)
    expect(downsampleTo16k(input, 48_000)).toHaveLength(160)
  })
})

describe('downmixToMono', () => {
  it('1チャンネルは同じ内容のコピーを返す', () => {
    const input = new Float32Array([0.1, -0.2, 0.3])
    const output = downmixToMono([input])

    expect(output).not.toBe(input)
    expect(Array.from(output)).toEqual(Array.from(input))
  })

  it('2チャンネルを平均し、短い側の不足部分を0として扱う', () => {
    const output = downmixToMono([
      new Float32Array([0.2, 0.4, 0.6]),
      new Float32Array([0.4, 0.2]),
    ])

    expect(output).toHaveLength(3)
    Array.from(output).forEach((sample) => expect(sample).toBeCloseTo(0.3, 5))
  })

  it('左が無音で右が0.4なら0.2になる', () => {
    const output = downmixToMono([
      new Float32Array(3),
      new Float32Array([0.4, 0.4, 0.4]),
    ])

    Array.from(output).forEach((sample) => expect(sample).toBeCloseTo(0.2, 5))
  })

  it('0チャンネルは空を返す', () => {
    expect(downmixToMono([])).toHaveLength(0)
  })
})

describe('trimSilence', () => {
  it('全て無音なら空の配列を返す', () => {
    expect(trimSilence(new Float32Array(100), 100)).toHaveLength(0)
  })

  it('中央の信号を前後の余白付きで切り出す', () => {
    const samples = new Float32Array(10)
    samples[4] = 0.2
    samples[5] = -0.2

    const trimmed = trimSilence(samples, 10)

    expect(trimmed).toHaveLength(6)
    expect(trimmed[0]).toBe(0)
    expect(trimmed[1]).toBe(0)
    expect(trimmed[2]).toBeCloseTo(0.2)
    expect(trimmed[3]).toBeCloseTo(-0.2)
    expect(trimmed[4]).toBe(0)
    expect(trimmed[5]).toBe(0)
  })

  it('信号が配列の端にあるとき余白を端でクランプする', () => {
    const atStart = new Float32Array(10)
    atStart[0] = 0.2
    const atEnd = new Float32Array(10)
    atEnd[9] = 0.2

    expect(trimSilence(atStart, 10)).toHaveLength(3)
    expect(trimSilence(atEnd, 10)).toHaveLength(3)
  })
})

describe('peakRms', () => {
  it('振幅0.5の正弦波は約0.354になる', () => {
    const sampleRate = 1_000
    const samples = Float32Array.from(
      { length: sampleRate },
      (_, index) => 0.5 * Math.sin(2 * Math.PI * 10 * index / sampleRate),
    )

    expect(peakRms(samples, sampleRate)).toBeCloseTo(0.354, 2)
  })

  it('無音は0になる', () => {
    expect(peakRms(new Float32Array(1_000), 1_000)).toBe(0)
    expect(peakRms(new Float32Array(), 1_000)).toBe(0)
  })

  it('長い無音後の短い信号も端数を含む窓で検出する', () => {
    const samples = new Float32Array(600)
    samples.fill(0.3, 500)

    expect(peakRms(samples, 1_000)).toBeCloseTo(0.3, 5)
  })
})

describe('detectOnsetSec', () => {
  it('RMSがしきい値を超える最初の窓の開始秒を返す', () => {
    const samples = new Float32Array(100)
    samples.fill(0.02, 40, 60)

    expect(detectOnsetSec(samples, 100, 0.01, 0.2)).toBeCloseTo(0.4)
  })

  it('しきい値と同じRMSの窓は音声開始にしない', () => {
    const samples = new Float32Array(20)
    samples.fill(0.01)

    expect(detectOnsetSec(samples, 100, 0.01, 0.2)).toBeNull()
  })

  it('音声がなければ null を返す', () => {
    expect(detectOnsetSec(new Float32Array(100), 100)).toBeNull()
    expect(detectOnsetSec(new Float32Array(), 100)).toBeNull()
  })

  it('不正な引数を拒否する', () => {
    expect(() => detectOnsetSec(new Float32Array(), 0)).toThrow(/サンプルレート/)
    expect(() => detectOnsetSec(new Float32Array(), 100, -1)).toThrow(/しきい値/)
    expect(() => detectOnsetSec(new Float32Array(), 100, 0.01, 0)).toThrow(/窓幅/)
  })
})
