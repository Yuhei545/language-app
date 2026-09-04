import { describe, expect, it } from 'vitest'
import { scorePronunciation } from './scoring'

describe('scorePronunciation', () => {
  describe('韓国語', () => {
    const card = { text: '비싸요', example: '그거 너무 비싸요.' }

    it('単語そのものを言えば一致', () => {
      const result = scorePronunciation('비싸요', card, 'ko')
      expect(result.matched).toBe(true)
      expect(result.similarity).toBe(1)
    })

    it('「聞く」で流れる例文をそのまま繰り返しても一致(単語を含んでいる)', () => {
      const result = scorePronunciation('그거 너무 비싸요', card, 'ko')
      expect(result.matched).toBe(true)
      expect(result.similarity).toBe(1)
    })

    it('文で言って単語部分が少し崩れていても、例文との近さで判定する', () => {
      const result = scorePronunciation('그거 너무 비싸', card, 'ko')
      expect(result.target).toBe('example')
      expect(result.similarity).toBeGreaterThanOrEqual(0.8)
      expect(result.matched).toBe(true)
    })

    it('まったく別の言葉なら低い', () => {
      const result = scorePronunciation('안녕하세요', card, 'ko')
      expect(result.matched).toBe(false)
      expect(result.similarity).toBeLessThan(0.5)
    })

    it('句読点や空白の違いは無視する', () => {
      const result = scorePronunciation('그거, 너무 비싸요!', card, 'ko')
      expect(result.matched).toBe(true)
    })
  })

  describe('英語', () => {
    const card = { text: 'water', example: 'Water, please.' }

    it('文の中に単語があれば一致', () => {
      const result = scorePronunciation('I want water', card, 'en')
      expect(result.matched).toBe(true)
      expect(result.similarity).toBe(1)
    })

    it('大文字小文字は区別しない', () => {
      const result = scorePronunciation('WATER PLEASE', card, 'en')
      expect(result.matched).toBe(true)
    })

    it('別の単語なら一致しない', () => {
      const result = scorePronunciation('coffee', card, 'en')
      expect(result.matched).toBe(false)
    })
  })

  describe('例文がないカード', () => {
    it('単語だけで判定する', () => {
      const result = scorePronunciation('hello', { text: 'hello', example: '' }, 'en')
      expect(result.matched).toBe(true)
      expect(result.target).toBe('text')
    })
  })

  it('聞き取りが空なら一致しない', () => {
    const result = scorePronunciation('', { text: '물', example: '물 주세요.' }, 'ko')
    expect(result.matched).toBe(false)
    expect(result.similarity).toBe(0)
  })
})
