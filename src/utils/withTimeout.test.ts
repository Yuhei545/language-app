import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { withTimeout } from './withTimeout'

describe('withTimeout', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('期限内に解決すれば、その値をそのまま返す', async () => {
    const promise = withTimeout(Promise.resolve('ok'), 1000, '遅い')
    await expect(promise).resolves.toBe('ok')
  })

  it('期限を過ぎたら、指定したメッセージの Error で失敗する', async () => {
    const never = new Promise<string>(() => undefined)
    const promise = withTimeout(never, 1000, '録音を終了できませんでした')
    const assertion = expect(promise).rejects.toThrow('録音を終了できませんでした')
    await vi.advanceTimersByTimeAsync(1000)
    await assertion
  })

  it('元の Promise が失敗したら、そのエラーをそのまま伝える', async () => {
    const failing = Promise.reject(new Error('元のエラー'))
    await expect(withTimeout(failing, 1000, '遅い')).rejects.toThrow('元のエラー')
  })

  it('解決後はタイマーを片付ける(あとで timeout が発火しない)', async () => {
    const onTimeout = vi.fn()
    await withTimeout(Promise.resolve(1), 1000, '遅い', onTimeout)
    await vi.advanceTimersByTimeAsync(2000)
    expect(onTimeout).not.toHaveBeenCalled()
  })

  it('期限切れのときは onTimeout を1回だけ呼ぶ', async () => {
    const onTimeout = vi.fn()
    const never = new Promise<void>(() => undefined)
    const promise = withTimeout(never, 500, '遅い', onTimeout).catch(() => undefined)
    await vi.advanceTimersByTimeAsync(500)
    await promise
    expect(onTimeout).toHaveBeenCalledTimes(1)
  })
})
