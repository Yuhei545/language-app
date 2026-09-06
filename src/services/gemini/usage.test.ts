import { beforeEach, describe, expect, it } from 'vitest'
import { getGeminiUsage, recordGeminiRequest, resetGeminiUsage } from './usage'

const NOON = new Date('2026-09-06T12:00:00').getTime()

beforeEach(() => {
  localStorage.clear()
})

describe('Gemini の利用回数', () => {
  it('呼び出すたびに今日の回数と直近 1 分の回数が増える', () => {
    recordGeminiRequest(NOON)
    recordGeminiRequest(NOON + 1000)

    expect(getGeminiUsage(NOON + 2000)).toEqual({ today: 2, lastMinute: 2 })
  })

  it('1 分より古い呼び出しは、直近 1 分の数から外れる', () => {
    recordGeminiRequest(NOON)
    recordGeminiRequest(NOON + 70_000)

    expect(getGeminiUsage(NOON + 71_000)).toEqual({ today: 2, lastMinute: 1 })
  })

  it('日付が変わったら 0 に戻る', () => {
    recordGeminiRequest(NOON)
    const nextDay = new Date('2026-09-07T09:00:00').getTime()

    expect(getGeminiUsage(nextDay)).toEqual({ today: 0, lastMinute: 0 })
  })

  it('壊れた保存値は 0 として扱う', () => {
    localStorage.setItem('lla.gemini.usage', '{壊れています')

    expect(getGeminiUsage(NOON)).toEqual({ today: 0, lastMinute: 0 })
  })

  it('消すと 0 に戻る', () => {
    recordGeminiRequest(NOON)
    resetGeminiUsage()

    expect(getGeminiUsage(NOON)).toEqual({ today: 0, lastMinute: 0 })
  })
})
