import { afterEach, describe, expect, it } from 'vitest'
import {
  MIN_REQUEST_INTERVAL_MS,
  scheduleGeminiRequest,
  setThrottleClockForTest,
} from './throttle'

/** 進んだ時間を記録するだけの時計。実際には待たない。 */
function fakeClock() {
  let current = 1_000_000
  const slept: number[] = []
  return {
    slept,
    clock: {
      now: () => current,
      sleep: async (ms: number) => {
        slept.push(ms)
        current += ms
      },
    },
    advance: (ms: number) => {
      current += ms
    },
  }
}

afterEach(() => {
  setThrottleClockForTest(null)
})

describe('scheduleGeminiRequest', () => {
  it('続けて呼ぶと、2 回目以降は最低間隔だけ待つ', async () => {
    const fake = fakeClock()
    setThrottleClockForTest(fake.clock)

    const order: number[] = []
    await Promise.all([
      scheduleGeminiRequest(async () => {
        order.push(1)
      }),
      scheduleGeminiRequest(async () => {
        order.push(2)
      }),
      scheduleGeminiRequest(async () => {
        order.push(3)
      }),
    ])

    expect(order).toEqual([1, 2, 3])
    expect(fake.slept).toEqual([MIN_REQUEST_INTERVAL_MS, MIN_REQUEST_INTERVAL_MS])
  })

  it('前の呼び出しから十分に時間が空いていれば待たない', async () => {
    const fake = fakeClock()
    setThrottleClockForTest(fake.clock)

    await scheduleGeminiRequest(async () => undefined)
    fake.advance(MIN_REQUEST_INTERVAL_MS + 1)
    await scheduleGeminiRequest(async () => undefined)

    expect(fake.slept).toEqual([])
  })

  it('途中で失敗しても列は止まらない', async () => {
    const fake = fakeClock()
    setThrottleClockForTest(fake.clock)

    const failure = scheduleGeminiRequest(async () => {
      throw new Error('失敗')
    })
    const after = scheduleGeminiRequest(async () => 'ok')

    await expect(failure).rejects.toThrow('失敗')
    await expect(after).resolves.toBe('ok')
  })

  it('結果をそのまま返す', async () => {
    setThrottleClockForTest(fakeClock().clock)
    await expect(scheduleGeminiRequest(async () => 42)).resolves.toBe(42)
  })
})
