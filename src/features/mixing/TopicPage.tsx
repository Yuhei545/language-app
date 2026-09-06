import { useState } from 'react'
import { Toast } from '../../components/Toast'
import { useTopicSession } from './useTopicSession'

export function TopicPage({ lang }: { lang: 'en' | 'ko' }) {
  const session = useTopicSession(lang)
  const [showJapanese, setShowJapanese] = useState(false)
  const { phase, turns } = session
  const last = turns[turns.length - 1] ?? null

  return (
    <div>
      <Toast error={session.error} onClose={session.clearError} />

      <p className="text-sm font-bold text-slate-500">
        お題について自分の言葉で話し、相手の質問に答えます。
      </p>

      {phase === 'idle' && turns.length === 0 ? (
        <div className="mt-7 rounded-3xl border border-violet-200 bg-white p-6 text-center shadow-sm">
          <p className="text-6xl" aria-hidden="true">💬</p>
          <h2 className="mt-5 text-xl font-bold text-slate-900">お題で言う</h2>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            お題が読み上げられたら録音が始まります。文の数は目安です。伝わることだけを考えましょう。
          </p>
          <button
            type="button"
            onClick={() => void session.startRecording()}
            className="mt-6 w-full rounded-2xl bg-violet-700 px-5 py-4 font-bold text-white"
          >
            お題をもらう
          </button>
        </div>
      ) : null}

      {session.currentPromptJa && phase !== 'finished' ? (
        <div className="mt-7 rounded-3xl border border-violet-200 bg-gradient-to-b from-violet-50 to-white p-6 shadow-sm">
          <p className="text-center text-xs font-bold tracking-wider text-violet-700">
            {turns.length === 0 ? 'お題' : '相手の質問'}
          </p>
          <h2 className="mt-3 text-center text-xl font-bold leading-8 text-slate-900">
            {session.currentPromptJa}
          </h2>
        </div>
      ) : null}

      {phase === 'recording' ? (
        <div className="mt-5 text-center">
          <button
            type="button"
            onClick={() => void session.stopRecording()}
            className="flex min-h-16 w-full items-center justify-center rounded-2xl bg-amber-500 px-5 text-base font-bold text-white"
          >
            ■ 話し終わった
          </button>
        </div>
      ) : null}

      {phase === 'checking' ? (
        <div className="mt-5 text-center">
          <p className="text-sm font-bold text-slate-500" role="status">相手が聞いています…</p>
          <button
            type="button"
            onClick={session.cancelChecking}
            className="mt-3 text-xs font-bold text-slate-600 underline decoration-slate-300 underline-offset-4"
          >
            やめる
          </button>
        </div>
      ) : null}

      {last && (phase === 'feedback' || phase === 'finished') ? (
        <div className={`mt-5 rounded-3xl border p-5 ${last.result.understood ? 'border-teal-200 bg-teal-50' : 'border-sky-200 bg-sky-50'}`}>
          <p className={`text-sm font-bold ${last.result.understood ? 'text-teal-800' : 'text-sky-800'}`}>
            {last.result.understood ? '伝わりました' : '伝わりませんでした。もう一度どうぞ'}
          </p>

          <p className="mt-4 text-[11px] font-bold tracking-wider text-slate-500">こう聞こえました</p>
          <p className="mt-1 rounded-2xl bg-white/70 px-4 py-3 font-bold text-slate-800">{last.heardText}</p>

          <p className="mt-4 text-[11px] font-bold tracking-wider text-slate-500">
            {last.result.understood ? '相手はこう受け取りました' : '相手の聞き返し'}
          </p>
          <div className="mt-1 flex items-start gap-3 rounded-2xl bg-white p-4 shadow-sm">
            <p className="min-w-0 flex-1 font-bold leading-7 text-slate-900">{last.result.recast}</p>
            <button
              type="button"
              onClick={() => void session.speakText(last.result.recast)}
              className="grid size-10 shrink-0 place-items-center rounded-full bg-teal-50 text-lg"
              aria-label="相手の言葉を聞く"
            >
              🔊
            </button>
          </div>

          <button
            type="button"
            onClick={() => setShowJapanese((current) => !current)}
            className="mt-3 text-xs font-bold text-slate-600 underline decoration-slate-300 underline-offset-4"
          >
            {showJapanese ? '日本語訳を閉じる' : '日本語訳を見る'}
          </button>
          {showJapanese ? (
            <p className="mt-2 rounded-xl bg-white/70 px-3 py-2 text-sm text-slate-700">{last.result.ja}</p>
          ) : null}

          {last.result.follow_up && phase === 'feedback' ? (
            <div className="mt-5 rounded-2xl bg-white p-4 shadow-sm">
              <p className="text-[11px] font-bold tracking-wider text-slate-500">続けて聞かれています</p>
              <div className="mt-1 flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-bold leading-7 text-slate-900">{last.result.follow_up}</p>
                  <p className="mt-1 text-sm text-slate-500">{last.result.follow_up_ja}</p>
                </div>
                <button
                  type="button"
                  onClick={() => void session.speakText(last.result.follow_up)}
                  className="grid size-10 shrink-0 place-items-center rounded-full bg-violet-50 text-lg"
                  aria-label="質問を聞く"
                >
                  🔊
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {phase === 'feedback' ? (
        <button
          type="button"
          onClick={() => void session.startRecording()}
          className="mt-5 w-full rounded-2xl bg-violet-700 px-5 py-4 font-bold text-white"
        >
          {last?.result.follow_up ? '質問に答える' : 'もう一度言う'}
        </button>
      ) : null}

      {phase === 'finished' ? (
        <button
          type="button"
          onClick={session.reset}
          className="mt-5 w-full rounded-2xl bg-violet-700 px-5 py-4 font-bold text-white"
        >
          次のお題へ
        </button>
      ) : null}
    </div>
  )
}
