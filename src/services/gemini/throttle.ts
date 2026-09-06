/**
 * Gemini の呼び出しを 1 本の列にして、最低の間隔を空けて流す。
 * 無料枠は 1 分あたりの回数に上限があり、まとめて投げると 429 になるため。
 */

/** 呼び出しの最低間隔。1 分あたり 10 回に収まる 6 秒を既定にする。 */
export const MIN_REQUEST_INTERVAL_MS = 6_000

type Clock = {
  now: () => number
  sleep: (ms: number) => Promise<void>
}

const realClock: Clock = {
  now: () => Date.now(),
  sleep: (ms) => new Promise((resolve) => {
    setTimeout(resolve, ms)
  }),
}

let clock = realClock
let lastStartedAt = 0
let queue: Promise<unknown> = Promise.resolve()

/** テスト用。時計を差し替え、待ち行列を空にする。 */
export function setThrottleClockForTest(next: Clock | null): void {
  clock = next ?? realClock
  lastStartedAt = 0
  queue = Promise.resolve()
}

/** 次に呼び出せるまでの待ち時間(ミリ秒)。0 ならすぐ呼べる。 */
export function waitTimeMs(now: number = Date.now()): number {
  return Math.max(0, lastStartedAt + MIN_REQUEST_INTERVAL_MS - now)
}

/**
 * run を待ち行列に入れ、前回の開始から最低間隔が空いてから実行する。
 * run が失敗しても列は止めない(次の呼び出しは通常どおり流れる)。
 */
export function scheduleGeminiRequest<T>(run: () => Promise<T>): Promise<T> {
  const scheduled = queue.then(async () => {
    const wait = Math.max(0, lastStartedAt + MIN_REQUEST_INTERVAL_MS - clock.now())
    if (wait > 0) {
      await clock.sleep(wait)
    }
    lastStartedAt = clock.now()
    return run()
  })

  queue = scheduled.then(
    () => undefined,
    () => undefined,
  )
  return scheduled
}
