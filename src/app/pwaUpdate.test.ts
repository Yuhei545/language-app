import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  applyUpdate,
  initServiceWorker,
  isUpdateAvailable,
  resetPwaUpdateForTests,
  subscribeUpdate,
  type RegisterSwOptions,
} from './pwaUpdate'

function fakeRegister() {
  const state: { options: RegisterSwOptions | undefined; updateSW: ReturnType<typeof vi.fn> } = {
    options: undefined,
    updateSW: vi.fn(async () => undefined),
  }
  const register = (options?: RegisterSwOptions) => {
    state.options = options
    return state.updateSW
  }
  return { register, state }
}

beforeEach(() => {
  resetPwaUpdateForTests()
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('pwaUpdate', () => {
  it('新版が来たら購読者に知らせ、勝手には再読み込みしない', () => {
    const { register, state } = fakeRegister()
    const listener = vi.fn()
    initServiceWorker(register)
    subscribeUpdate(listener)

    expect(listener).toHaveBeenLastCalledWith(false)
    state.options?.onNeedRefresh?.()

    expect(isUpdateAvailable()).toBe(true)
    expect(listener).toHaveBeenLastCalledWith(true)
    expect(state.updateSW).not.toHaveBeenCalled()
  })

  it('「更新」で待機中のサービスワーカーを有効にして再読み込みする', async () => {
    const { register, state } = fakeRegister()
    initServiceWorker(register)

    await applyUpdate()

    expect(state.updateSW).toHaveBeenCalledWith(true)
  })

  it('登録前に更新しようとすれば失敗を投げる', async () => {
    await expect(applyUpdate()).rejects.toThrow('登録されていません')
  })

  it('決めた間隔で新版を確かめる。取り込み中は確かめない', () => {
    const { register, state } = fakeRegister()
    const registration = { installing: null, update: vi.fn(async () => undefined) } as unknown as ServiceWorkerRegistration
    initServiceWorker(register, { intervalMs: 1000 })
    state.options?.onRegisteredSW?.('/sw.js', registration)

    vi.advanceTimersByTime(1000)
    expect(registration.update).toHaveBeenCalledTimes(1)

    ;(registration as unknown as { installing: unknown }).installing = {}
    vi.advanceTimersByTime(1000)
    expect(registration.update).toHaveBeenCalledTimes(1)
  })
})
