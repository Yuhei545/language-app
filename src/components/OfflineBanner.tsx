import { useEffect, useState } from 'react'

export function OfflineBanner() {
  const [online, setOnline] = useState(() => (
    typeof navigator === 'undefined' ? true : navigator.onLine
  ))

  useEffect(() => {
    const handleOnline = () => setOnline(true)
    const handleOffline = () => setOnline(false)

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  if (online) {
    return null
  }

  return (
    <div
      className="fixed inset-x-0 top-0 z-40 mx-auto max-w-[480px] bg-amber-400 px-4 py-2 text-center text-xs font-bold leading-5 text-amber-950 shadow-md"
      role="status"
      aria-live="polite"
    >
      オフラインです。会話と単語の保存はオンラインに戻ってから行われます
    </div>
  )
}
