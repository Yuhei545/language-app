import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { signIn } from '../../services/supabase/auth'

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'ログインに失敗しました'
}

export function LoginPage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSubmitting(true)
    setError(null)

    try {
      await signIn(email, password)
      navigate('/', { replace: true })
    } catch (signInError) {
      setError(errorMessage(signInError))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="grid min-h-dvh place-items-center bg-teal-50 px-5 py-10">
      <section className="w-full max-w-sm rounded-3xl border border-teal-900/10 bg-white p-6 shadow-xl shadow-teal-950/10">
        <p className="text-xs font-bold tracking-[0.18em] text-teal-700">MY LANGUAGE LAB</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">ログイン</h1>
        <p className="mt-3 text-sm leading-6 text-slate-500">登録済みのメールアドレスで学習を再開します。</p>

        <form className="mt-7 space-y-5" onSubmit={handleSubmit}>
          <label className="block">
            <span className="mb-2 block text-sm font-bold text-slate-700">メールアドレス</span>
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              disabled={submitting}
              className="w-full rounded-xl border border-slate-300 px-3 py-3 disabled:bg-slate-100"
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-bold text-slate-700">パスワード</span>
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              disabled={submitting}
              className="w-full rounded-xl border border-slate-300 px-3 py-3 disabled:bg-slate-100"
            />
          </label>

          {error ? (
            <p className="rounded-xl bg-red-50 px-3 py-3 text-sm font-medium text-red-800" role="alert">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-xl bg-teal-700 px-4 py-3 font-bold text-white transition-colors hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-slate-400"
          >
            {submitting ? 'ログイン中…' : 'ログイン'}
          </button>
        </form>
      </section>
    </main>
  )
}
