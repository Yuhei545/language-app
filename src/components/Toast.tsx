import { GeminiError } from '../services/gemini/errors'

export function Toast({ error, onClose }: { error: unknown; onClose: () => void }) {
  if (error === null || error === undefined) {
    return null
  }

  const message = error instanceof Error
    ? error.message
    : typeof error === 'object' && error !== null && 'message' in error
      ? String((error as { message: unknown }).message)
      : String(error)
  const kind = error instanceof GeminiError ? error.kind : undefined
  const color = kind === 'quota'
    ? 'border-amber-300 bg-amber-100 text-amber-950'
    : kind === 'auth'
      ? 'border-red-300 bg-red-100 text-red-950'
      : 'border-slate-300 bg-slate-800 text-white'

  return (
    <div
      className={`fixed inset-x-3 top-3 z-50 mx-auto flex max-w-[448px] items-start gap-3 rounded-2xl border px-4 py-3 shadow-xl ${color}`}
      role="alert"
    >
      <p className="min-w-0 flex-1 text-sm font-bold leading-6">{message}</p>
      <button
        type="button"
        onClick={onClose}
        className="shrink-0 rounded-lg px-2 py-1 text-sm font-bold hover:bg-black/10"
        aria-label="通知を閉じる"
      >
        閉じる
      </button>
    </div>
  )
}
