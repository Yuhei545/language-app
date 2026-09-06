import { Toast } from '../../components/Toast'
import { QUICK_ROUNDS, useQuickSession } from './useQuickSession'

function seconds(milliseconds: number | null): string {
  return milliseconds === null ? '—' : `${(milliseconds / 1000).toFixed(1)}秒`
}

export function QuickPage({ lang }: { lang: 'en' | 'ko' }) {
  const session = useQuickSession(lang)
  const { phase, current, summary } = session
  const selfCheck = session.checkMode === 'self'

  return (
    <div>
      <Toast error={session.error} onClose={session.clearError} />

      <p className="text-sm font-bold text-slate-500">
        {phase === 'cue' || phase === 'answering' || phase === 'recording'
          ? `${session.roundIndex + 1}周目 ・ ${session.index + 1}/${session.questions.length} ・ 目標 ${session.targetSeconds}秒`
          : '同じ 8 問を 3 周。だんだん速く答えます。'}
      </p>

      {phase === 'idle' ? (
        <div className="mt-7 rounded-3xl border border-violet-200 bg-white p-6 text-center shadow-sm">
          <p className="text-6xl" aria-hidden="true">⏱️</p>
          <h2 className="mt-5 text-xl font-bold text-slate-900">即答</h2>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            質問が終わったらすぐ答えます。短くて構いません。長さより速さです。
            {selfCheck
              ? ' 言い終わったら「答えた」を押します。速さだけを記録し、Gemini は質問づくりの 1 回だけ使います。'
              : ' 言い終わったらボタンを押すと、3 周分をまとめて確かめます。'}
          </p>
          <button
            type="button"
            onClick={() => void session.start()}
            className="mt-6 w-full rounded-2xl bg-violet-700 px-5 py-4 font-bold text-white"
          >
            はじめる
          </button>
        </div>
      ) : null}

      {phase === 'preparing' ? (
        <p className="mt-7 rounded-2xl bg-white px-5 py-8 text-center text-sm font-bold text-slate-500" role="status">
          今日の質問を用意しています…
        </p>
      ) : null}

      {current && (phase === 'cue' || phase === 'answering' || phase === 'recording') ? (
        <div className="mt-7 rounded-3xl border border-violet-200 bg-gradient-to-b from-violet-50 to-white p-6 shadow-sm">
          <p className="text-center text-xs font-bold tracking-wider text-violet-700">質問</p>
          <h2 className="mt-3 text-center text-2xl font-bold leading-9 text-slate-900">{current.q}</h2>
          <p className="mt-2 text-center text-sm text-slate-500">{current.ja}</p>
        </div>
      ) : null}

      {phase === 'cue' ? (
        <p className="mt-5 text-center text-sm font-bold text-slate-500" role="status">質問を読み上げています…</p>
      ) : null}

      {phase === 'answering' ? (
        <button
          type="button"
          onClick={session.answered}
          className="mt-5 flex min-h-16 w-full items-center justify-center rounded-2xl bg-teal-600 px-5 text-base font-bold text-white"
        >
          答えた
        </button>
      ) : null}

      {phase === 'recording' ? (
        <button
          type="button"
          onClick={() => void session.stopRecording()}
          className="mt-5 flex min-h-16 w-full items-center justify-center rounded-2xl bg-amber-500 px-5 text-base font-bold text-white"
        >
          ■ 答え終わった
        </button>
      ) : null}

      {phase === 'judging' ? (
        <p className="mt-7 rounded-2xl bg-white px-5 py-8 text-center text-sm font-bold text-slate-500" role="status">
          {QUICK_ROUNDS} 周分をまとめて確かめています…
        </p>
      ) : null}

      {phase !== 'idle' && phase !== 'finished' ? (
        <button
          type="button"
          onClick={session.stop}
          className="mt-3 w-full text-xs font-bold text-slate-600 underline decoration-slate-300 underline-offset-4"
        >
          やめる
        </button>
      ) : null}

      {phase === 'finished' && summary ? (
        <div className="mt-7 rounded-3xl border border-violet-200 bg-white p-6 shadow-sm">
          <p className="text-center text-5xl" aria-hidden="true">⏱️</p>
          <h2 className="mt-4 text-center text-xl font-bold text-slate-900">3 周終わりました</h2>

          <div className="mt-6 rounded-2xl bg-slate-50 p-4 text-center">
            <p className="text-lg font-bold tabular-nums text-violet-900">
              {summary.roundLatencyMs.map((latency) => seconds(latency)).join(' → ')}
            </p>
            <p className="mt-1 text-xs font-bold text-slate-500">答え始めるまでの平均</p>
          </div>

          {summary.total > 0 ? (
            <p className="mt-3 rounded-2xl bg-teal-50 px-4 py-3 text-center font-bold text-teal-900">
              伝わった {summary.understood}/{summary.total}
            </p>
          ) : (
            <p className="mt-3 text-center text-xs text-slate-500">
              自分で判定のときは速さだけを記録します。通じたかを確かめたいときは「録音で確かめる」にしてください。
            </p>
          )}

          <div className="mt-6 space-y-3">
            {summary.answers.map((answer, position) => {
              const judgment = summary.judgments[position]
              const question = session.questions[answer.index]
              if (!judgment?.better) {
                return null
              }
              return (
                <div key={`${answer.round}-${answer.index}`} className="rounded-2xl bg-slate-50 px-4 py-3">
                  <p className="text-xs font-bold text-slate-500">{question?.ja}</p>
                  <p className="mt-1 text-sm text-slate-700">あなた: {answer.heardText}</p>
                  <p className="mt-1 font-bold text-slate-900">より自然に: {judgment.better}</p>
                </div>
              )
            })}
          </div>

          <button
            type="button"
            onClick={() => void session.start()}
            className="mt-6 w-full rounded-2xl bg-violet-700 px-5 py-4 font-bold text-white"
          >
            もう一度
          </button>
        </div>
      ) : null}
    </div>
  )
}
