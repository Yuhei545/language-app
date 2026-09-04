import { describe, expect, it } from 'vitest'
import { downsampleTo16k, encodeWavBuffer } from './wav'

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
