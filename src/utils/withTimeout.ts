/**
 * Promise に期限を付ける。
 *
 * ブラウザの音声まわり(MediaRecorder の onstop、AudioContext の close/resume、
 * 文字起こしの通信)は、まれに完了通知が来ないまま止まる。そのまま await すると
 * 画面のボタンが灰色のまま二度と戻らないので、必ず期限を付けて呼ぶ。
 *
 * - 期限内に決着すれば結果をそのまま返す(成功・失敗どちらも)
 * - 期限を過ぎたら `message` の Error で失敗させ、`onTimeout` があれば1回だけ呼ぶ
 *   (後片付け用。例: 録音機を止める)
 */
export function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  message: string,
  onTimeout?: () => void,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false

    const timer = setTimeout(() => {
      if (settled) {
        return
      }
      settled = true
      try {
        onTimeout?.()
      } catch (cleanupError) {
        console.error('withTimeout の後片付けで例外が発生しました', cleanupError)
      }
      reject(new Error(message))
    }, ms)

    promise.then(
      (value) => {
        if (settled) {
          return
        }
        settled = true
        clearTimeout(timer)
        resolve(value)
      },
      (error: unknown) => {
        if (settled) {
          return
        }
        settled = true
        clearTimeout(timer)
        reject(error)
      },
    )
  })
}
