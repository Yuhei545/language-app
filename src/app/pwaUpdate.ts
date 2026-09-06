/**
 * 新版の通知。サービスワーカーが新しい版を取り込んでも勝手に切り替えず、
 * 「更新」を押したときだけ切り替える(練習の途中で画面が消えないように)。
 * virtual:pwa-register はここでは import しない(テストで差し替えられるよう、登録関数を受け取る)。
 */
export type RegisterSwOptions = {
  immediate?: boolean
  onNeedRefresh?: () => void
  onOfflineReady?: () => void
  onRegisteredSW?: (swUrl: string, registration: ServiceWorkerRegistration | undefined) => void
  onRegisterError?: (error: unknown) => void
}

export type RegisterSw = (options?: RegisterSwOptions) => (reloadPage?: boolean) => Promise<void>

/** 新版があるかを、この間隔で確かめる。 */
export const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000

type Listener = (available: boolean) => void

let updateAvailable = false
let updateServiceWorker: ((reloadPage?: boolean) => Promise<void>) | null = null
const listeners = new Set<Listener>()

function notify(): void {
  listeners.forEach((listener) => listener(updateAvailable))
}

export function initServiceWorker(
  register: RegisterSw,
  opts: { intervalMs?: number } = {},
): void {
  const intervalMs = opts.intervalMs ?? UPDATE_CHECK_INTERVAL_MS
  updateServiceWorker = register({
    onNeedRefresh() {
      updateAvailable = true
      notify()
    },
    onRegisteredSW(_swUrl, registration) {
      if (!registration) {
        return
      }
      const check = () => {
        // オフラインや取り込み中は確かめない
        if ((typeof navigator !== 'undefined' && navigator.onLine === false) || registration.installing) {
          return
        }
        registration.update().catch((error: unknown) => {
          console.error('新しい版の確認に失敗しました', error)
        })
      }
      setInterval(check, intervalMs)
      if (typeof document !== 'undefined') {
        // スマホで開き直したときにも確かめる
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') {
            check()
          }
        })
      }
    },
    onRegisterError(error) {
      console.error('サービスワーカーの登録に失敗しました', error)
    },
  })
}

export function subscribeUpdate(listener: Listener): () => void {
  listeners.add(listener)
  listener(updateAvailable)
  return () => {
    listeners.delete(listener)
  }
}

export function isUpdateAvailable(): boolean {
  return updateAvailable
}

/** 新版に切り替える(待機中のサービスワーカーを有効にして再読み込み)。 */
export async function applyUpdate(): Promise<void> {
  if (!updateServiceWorker) {
    throw new Error('サービスワーカーが登録されていません')
  }
  await updateServiceWorker(true)
}

/** テスト用。 */
export function resetPwaUpdateForTests(): void {
  updateAvailable = false
  updateServiceWorker = null
  listeners.clear()
}
