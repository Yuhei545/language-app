import { Link, useSearchParams } from 'react-router-dom'
import { useLanguage } from '../../app/LanguageContext'
import { Toast } from '../../components/Toast'
import { Flashcard } from './Flashcard'
import { useCardSession } from './useCardSession'

export function CardsPage() {
  const { language } = useLanguage()
  const [searchParams] = useSearchParams()
  const prepEventId = searchParams.get('prepEventId') || undefined
  const session = useCardSession(language, prepEventId)

  if (session.loading) {
    return (
      <section>
        <Toast error={session.error} onClose={session.clearError} />
        <p className="text-sm font-bold text-teal-700">DIRECT CONNECT</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">声で覚えるカード</h1>
        <p className="mt-8 rounded-2xl bg-white px-5 py-8 text-center text-sm font-bold text-slate-500" role="status">
          今日のカードを選んでいます…
        </p>
      </section>
    )
  }

  if (session.totalCards === 0) {
    return (
      <section>
        <Toast error={session.error} onClose={session.clearError} />
        <p className="text-sm font-bold text-teal-700">ALL CAUGHT UP</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">今日の復習は終わりました</h1>
        <div className="mt-7 rounded-3xl border border-teal-900/10 bg-white px-5 py-8 text-center shadow-sm">
          <p className="text-5xl" aria-hidden="true">🌿</p>
          <p className="mt-4 text-sm leading-7 text-slate-600">声に出す練習を続けたい日は、ペアレントと少し話してみましょう。</p>
          <Link
            to="/talk"
            className="mt-6 inline-flex rounded-full bg-teal-700 px-6 py-3 text-sm font-bold text-white hover:bg-teal-800"
          >
            会話へ行く
          </Link>
        </div>
      </section>
    )
  }

  if (!session.started) {
    return (
      <section>
        <Toast error={session.error} onClose={session.clearError} />
        <p className="text-sm font-bold text-teal-700">DIRECT CONNECT</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">
          {prepEventId ? '予定に向けたカード' : '今日の声トレ'}
        </h1>
        <div className="mt-7 overflow-hidden rounded-3xl border border-teal-900/10 bg-white shadow-sm">
          <div className="bg-teal-50 px-5 py-8 text-center">
            <p className="text-6xl" aria-hidden="true">👂</p>
            <p className="mt-5 text-lg font-bold text-teal-950">絵を見て、音を聞いて、声に出す</p>
            <p className="mt-2 text-sm leading-6 text-teal-900/65">文字に頼らず、{session.totalCards}枚を自分のペースで進めます。</p>
          </div>
          <div className="p-5">
            <button
              type="button"
              onClick={session.beginSession}
              className="w-full rounded-2xl bg-teal-700 px-5 py-4 font-bold text-white shadow-sm hover:bg-teal-800"
            >
              カードを始める
            </button>
          </div>
        </div>
      </section>
    )
  }

  if (session.finished) {
    return (
      <section>
        <Toast error={session.error} onClose={session.clearError} />
        <p className="text-sm font-bold text-teal-700">SESSION COMPLETE</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">声の練習、おつかれさまでした</h1>
        <div className="mt-7 rounded-3xl border border-teal-900/10 bg-white p-5 shadow-sm">
          <p className="text-center text-5xl" aria-hidden="true">✨</p>
          <div className="mt-6 grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-teal-50 px-3 py-5 text-center">
              <p className="text-3xl font-bold text-teal-800">{session.todayLearnedCount}</p>
              <p className="mt-1 text-xs font-bold text-teal-900/70">今日覚えた語</p>
            </div>
            <div className="rounded-2xl bg-amber-50 px-3 py-5 text-center">
              <p className="text-3xl font-bold text-amber-800">{session.tomorrowCount}</p>
              <p className="mt-1 text-xs font-bold text-amber-900/70">明日また出る語</p>
            </div>
          </div>
          <Link
            to="/talk"
            className="mt-6 flex w-full items-center justify-center rounded-2xl border border-teal-200 bg-teal-50 px-5 py-3 text-sm font-bold text-teal-800"
          >
            会話でも使ってみる
          </Link>
        </div>
      </section>
    )
  }

  if (!session.currentCard) {
    return null
  }

  return (
    <section>
      <Toast error={session.error} onClose={session.clearError} />
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-bold tracking-[0.16em] text-teal-700">DIRECT CONNECT</p>
          <h1 className="mt-1 text-xl font-bold text-slate-900">声で覚えるカード</h1>
        </div>
        <p className="text-sm font-bold tabular-nums text-slate-500">
          {session.currentIndex + 1} / {session.totalCards}
        </p>
      </div>

      <div
        className="mt-4 h-2 overflow-hidden rounded-full bg-slate-200"
        role="progressbar"
        aria-label="カードの進捗"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={session.progressPercent}
      >
        <div
          className="h-full rounded-full bg-teal-600 transition-[width] duration-300"
          style={{ width: `${session.progressPercent}%` }}
        />
      </div>

      <div className="mt-6">
        <Flashcard
          key={session.currentCard.id}
          card={session.currentCard}
          phase={session.phase}
          attempt={session.attempt}
          hintVisible={session.hintVisible}
          hintSaving={session.hintSaving}
          sttEngine={session.sttEngine}
          onListen={session.playExample}
          onStartRecording={session.startRecording}
          onStopRecording={session.stopRecording}
          onShowHint={session.showHint}
          onGrade={session.gradeCard}
        />
      </div>
    </section>
  )
}
