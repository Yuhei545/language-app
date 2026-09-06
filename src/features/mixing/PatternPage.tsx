import { Toast } from '../../components/Toast'
import type { MixingLevel } from '../../services/settings'
import { usePatternSession } from './usePatternSession'

const LEVELS: MixingLevel[] = [1, 2, 3]

function seconds(milliseconds: number | null): string {
  return milliseconds === null ? '—' : `${(milliseconds / 1000).toFixed(1)}秒`
}

export function PatternPage({ lang }: { lang: 'en' | 'ko' }) {
  const session = usePatternSession(lang)
  const { phase, currentItem, summary } = session

  return (
    <div>
      <Toast error={session.error} onClose={session.clearError} />

      <div className="flex items-center justify-between gap-4">
        <p className="text-sm font-bold text-slate-500">
          {session.roundCount > 0
            ? `${session.roundIndex + 1}周目 ・ ${session.itemIndex + 1}/${session.itemCount}`
            : '日本語を聞いて、すぐに言ってみましょう'}
        </p>
        <div className="flex rounded-full bg-slate-100 p-1" aria-label="型のレベル">
          {LEVELS.map((level) => (
            <button
              key={level}
              type="button"
              aria-pressed={session.level === level}
              onClick={() => session.setLevel(level)}
              className={`size-9 rounded-full text-xs font-bold transition-colors ${session.level === level ? 'bg-white text-violet-800 shadow-sm' : 'text-slate-500'}`}
            >
              {level}
            </button>
          ))}
        </div>
      </div>

      {phase === 'loading' ? (
        <p className="mt-7 rounded-2xl bg-white px-5 py-8 text-center text-sm font-bold text-slate-500" role="status">
          成績を読み込んでいます…
        </p>
      ) : null}

      {phase === 'idle' ? (
        <div className="mt-7 rounded-3xl border border-violet-200 bg-white p-6 text-center shadow-sm">
          <p className="text-6xl" aria-hidden="true">⚡</p>
          <h2 className="mt-5 text-xl font-bold text-slate-900">型を回す</h2>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            日本語の合図が終わったら、すぐに録音が始まります。考えこまずに声に出しましょう。
            3 つの型を 4 組ずつ、2 周します。
          </p>
          <button
            type="button"
            onClick={session.start}
            className="mt-6 w-full rounded-2xl bg-violet-700 px-5 py-4 font-bold text-white"
          >
            はじめる
          </button>
        </div>
      ) : null}

      {currentItem && phase !== 'finished' && phase !== 'idle' && phase !== 'loading' ? (
        <div className="mt-7 rounded-3xl border border-violet-200 bg-gradient-to-b from-violet-50 to-white p-6 shadow-sm">
          <p className="text-center text-xs font-bold tracking-wider text-violet-700">こう伝えてください</p>
          <h2 className="mt-3 text-center text-2xl font-bold leading-9 text-slate-900">
            {currentItem.promptJa}
          </h2>

          {session.hint && (phase === 'hint' || phase === 'cue') ? (
            <p className="mt-5 rounded-2xl bg-sky-50 px-4 py-3 text-center font-bold text-sky-900">
              💡 {session.hint.textJa}
            </p>
          ) : null}

          {phase === 'model' ? (
            <div className="mt-5 space-y-3">
              {session.heardText ? (
                <div>
                  <p className="text-[11px] font-bold tracking-wider text-slate-500">こう聞こえました</p>
                  <p className="mt-1 rounded-2xl bg-white/70 px-4 py-3 font-bold text-slate-800">
                    {session.heardText}
                  </p>
                </div>
              ) : null}
              <div>
                <p className="text-[11px] font-bold tracking-wider text-slate-500">ひとつの言い方</p>
                <p className="mt-1 rounded-2xl bg-white px-4 py-3 text-lg font-bold text-slate-900 shadow-sm">
                  {currentItem.answer}
                </p>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {phase === 'cue' ? (
        <p className="mt-5 text-center text-sm font-bold text-slate-500" role="status">
          合図を読み上げています…
        </p>
      ) : null}

      {phase === 'recording' ? (
        <div className="mt-5 text-center">
          <button
            type="button"
            onClick={() => void session.stopRecording()}
            className="flex min-h-16 w-full items-center justify-center rounded-2xl bg-amber-500 px-5 text-base font-bold text-white"
          >
            ■ 言い終わった
          </button>
          <p className="mt-2 text-[11px] text-slate-500">
            聞いています。言い終えたらタップ
            {session.sttEngine ? `（音声入力：${session.sttEngine === 'webspeech' ? 'ブラウザ' : 'Gemini'}）` : ''}
          </p>
        </div>
      ) : null}

      {phase === 'checking' ? (
        <p className="mt-5 text-center text-sm font-bold text-slate-500" role="status">
          確かめています…
        </p>
      ) : null}

      {phase === 'hint' ? (
        <button
          type="button"
          onClick={session.retry}
          className="mt-5 w-full rounded-2xl bg-violet-700 px-5 py-4 font-bold text-white"
        >
          もう一度言う
        </button>
      ) : null}

      {phase === 'model' ? (
        <button
          type="button"
          onClick={session.next}
          className="mt-5 w-full rounded-2xl bg-violet-700 px-5 py-4 font-bold text-white"
        >
          次へ
        </button>
      ) : null}

      {phase !== 'idle' && phase !== 'loading' && phase !== 'finished' ? (
        <button
          type="button"
          onClick={session.stop}
          className="mt-3 w-full text-xs font-bold text-slate-600 underline decoration-slate-300 underline-offset-4"
        >
          やめる
        </button>
      ) : null}

      {phase === 'finished' && summary ? (
        <div className="mt-7 rounded-3xl border border-violet-200 bg-white p-6 text-center shadow-sm">
          <p className="text-5xl" aria-hidden="true">⚡</p>
          <h2 className="mt-4 text-xl font-bold text-slate-900">2 周終わりました</h2>
          <div className="mt-6 grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-2xl font-bold tabular-nums text-violet-900">
                {summary.firstTry}/{summary.total}
              </p>
              <p className="mt-1 text-xs font-bold text-slate-500">一度で言えた</p>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-lg font-bold tabular-nums text-violet-900">
                {summary.roundLatencyMs.map((latency) => seconds(latency)).join(' → ')}
              </p>
              <p className="mt-1 text-xs font-bold text-slate-500">言い出すまでの平均</p>
            </div>
          </div>
          {summary.nextLevel ? (
            <p className="mt-5 rounded-2xl bg-teal-50 px-4 py-3 font-bold text-teal-900">
              今のレベルの型は十分できています。レベル {summary.nextLevel} に上げてみましょう
            </p>
          ) : null}
          <button
            type="button"
            onClick={session.start}
            className="mt-6 w-full rounded-2xl bg-violet-700 px-5 py-4 font-bold text-white"
          >
            もう一度
          </button>
        </div>
      ) : null}
    </div>
  )
}
