import { GeminiError } from '../services/gemini/errors'

/** 日本語の説明の下に、原因になった生のエラー(HTTP 状態と本文の先頭)を小さく添える。報告に使えるように。 */
function describeCause(error: unknown): string | null {
  if (!(error instanceof GeminiError) || error.cause === undefined || error.cause === null) {
    return null
  }
  const cause = error.cause as { status?: unknown; message?: unknown }
  const status = typeof cause.status === 'number' ? `HTTP ${cause.status} ` : ''
  const raw = cause instanceof Error
    ? cause.message
    : typeof cause.message === 'string'
      ? cause.message
      : typeof error.cause === 'string' ? error.cause : ''
  const text = `${status}${raw}`.trim()
  if (text.length === 0 || text === error.message) {
    return null
  }
  return text.length > 200 ? `${text.slice(0, 200)}…` : text
}

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
  const detail = describeCause(error)
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
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold leading-6">{message}</p>
        {detail ? (
          <p className="mt-1 break-all font-mono text-[11px] leading-4 opacity-80">{detail}</p>
        ) : null}
      </div>
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
