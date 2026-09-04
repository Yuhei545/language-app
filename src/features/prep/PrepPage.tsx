import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useLanguage } from '../../app/LanguageContext'
import { Toast } from '../../components/Toast'
import { usePrepEvents, type PrepPhase } from './usePrepEvents'

const phaseMessages: Partial<Record<PrepPhase, string>> = {
  creating: '予定を保存しています…',
  generating: 'その場で使う10個の言い方を考えています…',
  saving: 'できた言い方をカードに保存しています…',
}

function eventDateLabel(value: string | null): string {
  if (!value) {
    return '日付未設定'
  }

  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day).toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export function PrepPage() {
  const { language } = useLanguage()
  const prep = usePrepEvents(language)
  const [title, setTitle] = useState('')
  const [eventDate, setEventDate] = useState('')
  const busy = prep.phase === 'creating' || prep.phase === 'generating' || prep.phase === 'saving'

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    void prep.createPreparation({ title, eventDate })
  }

  return (
    <section>
      <Toast error={prep.error} onClose={prep.clearError} />
      <p className="text-sm font-bold text-teal-700">PREP MODE</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">その日のために準備する</h1>
      <p className="mt-3 text-sm leading-6 text-slate-500">予定をひとつ教えると、その場で使える言い方を10個用意します。</p>

      <form onSubmit={submit} className="mt-7 rounded-3xl border border-teal-900/10 bg-white p-5 shadow-sm">
        <label className="block">
          <span className="mb-2 block text-sm font-bold text-slate-700">予定のタイトル</span>
          <input
            type="text"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            disabled={prep.loading || busy}
            placeholder="例：海外の友人とランチ"
            className="w-full rounded-xl border border-slate-300 px-3 py-3 text-slate-800 disabled:bg-slate-50"
          />
        </label>
        <label className="mt-4 block">
          <span className="mb-2 block text-sm font-bold text-slate-700">日付（任意）</span>
          <input
            type="date"
            value={eventDate}
            onChange={(event) => setEventDate(event.target.value)}
            disabled={prep.loading || busy}
            className="w-full rounded-xl border border-slate-300 px-3 py-3 text-slate-800 disabled:bg-slate-50"
          />
        </label>
        <button
          type="submit"
          disabled={prep.loading || busy || title.trim().length === 0}
          className="mt-5 w-full rounded-2xl bg-teal-700 px-5 py-4 font-bold text-white disabled:opacity-45"
        >
          {busy ? '準備しています…' : '10個の言い方を作る'}
        </button>
        {busy ? (
          <p className="mt-3 text-center text-xs font-bold text-teal-700" role="status">
            {phaseMessages[prep.phase]}
          </p>
        ) : null}
      </form>

      {prep.phase === 'failed' ? (
        <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-bold text-amber-900">準備が途中で止まりました。保存済みの予定を使って続きから試せます。</p>
          <button
            type="button"
            onClick={() => void prep.retry()}
            className="mt-3 rounded-full bg-amber-800 px-4 py-2 text-sm font-bold text-white"
          >
            もう一度試す
          </button>
        </div>
      ) : null}

      {prep.phase === 'complete' && prep.activeEvent ? (
        <section className="mt-8">
          <div className="rounded-3xl bg-teal-700 p-5 text-white">
            <p className="text-xs font-bold tracking-wider text-teal-100">READY</p>
            <h2 className="mt-2 text-2xl font-bold">10個の言い方ができました</h2>
            <Link
              to={`/cards?prep=${encodeURIComponent(prep.activeEvent.id)}`}
              className="mt-5 flex w-full items-center justify-center rounded-2xl bg-white px-5 py-3 font-bold text-teal-800"
            >
              今すぐ練習する
            </Link>
          </div>
          <div className="mt-4 space-y-3">
            {prep.generatedPhrases.map((phrase) => (
              <article key={phrase.text} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex gap-3">
                  <span className="text-3xl" aria-hidden="true">{phrase.emoji}</span>
                  <div className="min-w-0">
                    <h3 className="font-bold text-slate-900">{phrase.text}</h3>
                    <p className="mt-1 text-sm leading-6 text-slate-600">{phrase.example}</p>
                    <p className="mt-2 text-xs text-sky-700">{phrase.hint_ja}</p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <section className="mt-9">
        <h2 className="text-lg font-bold text-slate-900">これまでの予定</h2>
        {prep.loading ? (
          <p className="mt-3 rounded-2xl bg-white px-4 py-6 text-center text-sm font-bold text-slate-500" role="status">予定を読み込んでいます…</p>
        ) : prep.events.length > 0 ? (
          <div className="mt-3 space-y-3">
            {prep.events.map((event) => (
              <article key={event.id} className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="min-w-0 flex-1">
                  <h3 className="truncate font-bold text-slate-800">{event.title}</h3>
                  <p className="mt-1 text-xs text-slate-500">{eventDateLabel(event.event_date)}</p>
                </div>
                <Link
                  to={`/cards?prep=${encodeURIComponent(event.id)}`}
                  className="shrink-0 rounded-full bg-teal-50 px-3 py-2 text-xs font-bold text-teal-800"
                >
                  練習する
                </Link>
              </article>
            ))}
          </div>
        ) : (
          <p className="mt-3 rounded-2xl bg-white px-4 py-6 text-sm leading-6 text-slate-500">予定を登録すると、ここからいつでもカード練習に戻れます。</p>
        )}
      </section>
    </section>
  )
}
