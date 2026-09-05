import { Link } from 'react-router-dom'
import { useLanguage } from '../../app/LanguageContext'
import { Toast } from '../../components/Toast'
import type { PrepEventRow } from '../../services/supabase/types'
import { useHomeData } from './useHomeData'

function eventDateLabel(event: PrepEventRow): string {
  if (!event.event_date) {
    return ''
  }

  const [year, month, day] = event.event_date.split('-').map(Number)
  return new Date(year, month - 1, day).toLocaleDateString('ja-JP', {
    month: 'short',
    day: 'numeric',
  })
}

export function HomePage() {
  const { language } = useLanguage()
  const {
    data,
    loading,
    error,
    advancing,
    reload,
    advanceWeek,
    clearError,
  } = useHomeData(language)

  if (loading) {
    return (
      <section>
        <Toast error={error} onClose={clearError} />
        <p className="text-sm font-bold text-teal-700">TODAY</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">今日の学習</h1>
        <p className="mt-8 rounded-2xl bg-white px-5 py-8 text-center text-sm font-bold text-slate-500" role="status">
          今日の進み具合をまとめています…
        </p>
      </section>
    )
  }

  if (!data) {
    return (
      <section>
        <Toast error={error} onClose={clearError} />
        <p className="text-sm font-bold text-teal-700">TODAY</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">今日の学習</h1>
        <button
          type="button"
          onClick={reload}
          className="mt-7 w-full rounded-2xl bg-teal-700 px-5 py-4 font-bold text-white"
        >
          もう一度読み込む
        </button>
      </section>
    )
  }

  const knownPercent = Math.min(100, (data.knownWordCount / 1000) * 100)
  const masteryPercent = Math.round(data.masteryRatio * 100)

  return (
    <section>
      <Toast error={error} onClose={clearError} />
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-bold text-teal-700">TODAY</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-900">
            第{data.week}週・Day {data.day}
          </h1>
        </div>
        <div className="shrink-0 rounded-full bg-amber-50 px-3 py-2 text-sm font-bold text-amber-800">
          🔥 {data.streak}日
        </div>
      </div>

      <div className="mt-3">
        <div className="flex items-center justify-between gap-3 text-xs font-bold text-slate-500">
          <p>今週の言葉 {data.masteredWeekWordCount}/{data.weekWordCount} を言えた</p>
          <p className="tabular-nums">{masteryPercent}%</p>
        </div>
        <div
          className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200"
          role="progressbar"
          aria-label="今週の言葉の習得率"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={masteryPercent}
        >
          <div className="h-full rounded-full bg-teal-600" style={{ width: `${masteryPercent}%` }} />
        </div>
      </div>

      {data.canAdvance && data.week < 26 ? (
        <button
          type="button"
          onClick={() => void advanceWeek()}
          disabled={advancing}
          className="mt-4 w-full rounded-2xl border border-teal-300 bg-teal-50 px-5 py-3 text-sm font-bold text-teal-900 disabled:opacity-50"
        >
          {advancing ? '次の週へ進んでいます…' : `第${data.week + 1}週へ進む`}
        </button>
      ) : null}

      <Link
        to="/talk"
        className="group mt-7 block overflow-hidden rounded-[1.75rem] bg-teal-700 px-6 py-7 text-white shadow-[0_18px_45px_rgba(15,118,110,0.24)] transition-transform active:scale-[0.99]"
      >
        <p className="text-xs font-bold tracking-[0.16em] text-teal-100">LANGUAGE PARENT</p>
        <div className="mt-3 flex items-end justify-between gap-4">
          <div>
            <p className="text-3xl font-bold">会話する</p>
            <p className="mt-2 text-sm leading-6 text-teal-50/80">短いひとことから、今日の言葉を始めましょう。</p>
          </div>
          <span className="mb-1 text-3xl transition-transform group-hover:translate-x-1" aria-hidden="true">→</span>
        </div>
      </Link>

      <section className="mt-8">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900">今日のタスク</h2>
          <p className="text-xs font-bold text-slate-400">3つ</p>
        </div>
        <div className="mt-3 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <Link to="/cards" className="flex items-center gap-3 border-b border-slate-100 px-4 py-4">
            <span className={`grid size-7 place-items-center rounded-full text-sm font-bold ${data.dueCardCount === 0 ? 'bg-teal-600 text-white' : 'border-2 border-slate-300 text-transparent'}`}>
              {data.dueCardCount === 0 ? '✓' : '•'}
            </span>
            <span className="flex-1 font-bold text-slate-700">単語カード</span>
            <span className="text-sm font-bold text-slate-500">
              {data.dueCardCount === 0 ? '完了' : `${data.dueCardCount}枚`}
            </span>
          </Link>
          <Link to="/talk" className="flex items-center gap-3 border-b border-slate-100 px-4 py-4">
            <span className={`grid size-7 place-items-center rounded-full text-sm font-bold ${data.conversationComplete ? 'bg-teal-600 text-white' : 'border-2 border-slate-300 text-transparent'}`}>
              {data.conversationComplete ? '✓' : '•'}
            </span>
            <span className="flex-1 font-bold text-slate-700">会話</span>
            <span className="text-sm font-bold text-slate-500">
              {data.conversationComplete ? '完了' : '1回'}
            </span>
          </Link>
          <Link to="/dictation" className="flex items-center gap-3 px-4 py-4">
            <span className={`grid size-7 place-items-center rounded-full text-sm font-bold ${data.dictationComplete ? 'bg-teal-600 text-white' : 'border-2 border-slate-300 text-transparent'}`}>
              {data.dictationComplete ? '✓' : '・'}
            </span>
            <span className="flex-1 font-bold text-slate-700">聞いて書く</span>
            <span className="text-sm font-bold text-slate-500">
              {data.dictationComplete ? '完了' : '5文'}
            </span>
          </Link>
        </div>
      </section>

      <Link
        to="/mixing"
        className="mt-4 flex items-center gap-4 rounded-2xl border border-violet-200 bg-violet-50 p-4"
      >
        <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-white text-2xl" aria-hidden="true">🧩</span>
        <span className="min-w-0 flex-1">
          <span className="block font-bold text-slate-900">文をつくる</span>
          <span className="mt-1 block text-sm leading-5 text-slate-600">知っている言葉を組み合わせて話す</span>
        </span>
        <span className="text-xl text-violet-700" aria-hidden="true">→</span>
      </Link>

      <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-xs font-bold tracking-wider text-slate-400">KNOWN WORDS</p>
            <h2 className="mt-1 font-bold text-slate-800">使える言葉</h2>
          </div>
          <p className="text-lg font-bold tabular-nums text-teal-800">{data.knownWordCount} <span className="text-xs text-slate-400">/ 1000</span></p>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-label="既知語の進捗" aria-valuemin={0} aria-valuemax={1000} aria-valuenow={Math.min(1000, data.knownWordCount)}>
          <div className="h-full rounded-full bg-teal-600" style={{ width: `${knownPercent}%` }} />
        </div>
      </section>

      {data.upcomingEvents.length > 0 ? (
        <section className="mt-8">
          <h2 className="text-lg font-bold text-slate-900">近づいている予定</h2>
          <div className="mt-3 space-y-3">
            {data.upcomingEvents.map(({ event, daysRemaining }) => (
              <article key={event.id} className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-amber-700">{eventDateLabel(event)}</p>
                    <h3 className="mt-1 truncate font-bold text-slate-900">{event.title}</h3>
                    <p className="mt-1 text-sm text-amber-900">{event.title}まで残り{daysRemaining}日</p>
                  </div>
                  <Link
                    to={`/cards?prep=${encodeURIComponent(event.id)}`}
                    className="shrink-0 rounded-full bg-white px-3 py-2 text-xs font-bold text-amber-900 shadow-sm"
                  >
                    カード練習
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <Link
        to="/prep"
        className="mt-8 flex w-full items-center justify-center rounded-2xl border border-teal-300 bg-white px-5 py-4 font-bold text-teal-800"
      >
        予定を準備する
      </Link>
    </section>
  )
}
