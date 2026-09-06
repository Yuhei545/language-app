import { useEffect, useState } from 'react'
import { applyUpdate, subscribeUpdate } from '../app/pwaUpdate'

/** 新しい版があるときだけ出す。押すまで切り替えない。 */
export function UpdateBanner() {
  const [available, setAvailable] = useState(false)
  const [applying, setApplying] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => subscribeUpdate(setAvailable), [])

  if (!available) {
    return null
  }

  const update = async () => {
    setApplying(true)
    setFailed(false)
    try {
      await applyUpdate()
    } catch (error) {
      console.error('新しい版に切り替えられませんでした', error)
      setFailed(true)
      setApplying(false)
    }
  }

  return (
    <div
      className="fixed inset-x-0 top-0 z-40 mx-auto flex max-w-[480px] items-center justify-between gap-3 bg-teal-700 px-4 py-2 text-xs font-bold leading-5 text-white shadow-md"
      role="status"
      aria-live="polite"
    >
      <span>{failed ? '切り替えに失敗しました。もう一度押してください' : '新しい版があります'}</span>
      <button
        type="button"
        onClick={() => void update()}
        disabled={applying}
        className="shrink-0 rounded-full bg-white px-3 py-1 text-xs font-bold text-teal-800 disabled:opacity-60"
      >
        {applying ? '更新中…' : '更新'}
      </button>
    </div>
  )
}
