import { Link } from 'react-router-dom'
import { useLanguage } from '../../app/LanguageContext'
import { Toast } from '../../components/Toast'
import { useReplaySession } from './useReplaySession'

/** 1 本あたりのおおよその時間(分)。台詞 8 行 × 数秒 + 間。 */
function estimateMinutes(totalTurns: number): number {
  return Math.max(1, Math.round((totalTurns * 5) / 60))
}

export function ReplayPage() {
  const { language } = useLanguage()
  const session = useReplaySession(language)
  const current = session.dialogues[session.dialogueIndex] ?? null

  return (
    <section>
      <Toast error={session.error} onClose={session.clearError} />
      <p className="text-sm font-bold text-sky-700">EXTENSIVE LISTENING</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">今日の聞き流し</h1>
      <p className="mt-3 text-sm leading-6 text-slate-500">
        保存した会話 {session.dialogues.length || 3} 本を、文字なしで通して聞きます。意味を追うだけで構いません。
        聞いた量に比例して聞き取りは伸びます。2 周目は台本を見ながらでも。
      </p>

      {session.status === 'loading' ? (
        <p className="mt-8 rounded-2xl bg-white px-5 py-8 text-center text-sm font-bold text-slate-500" role="status">
          会話を読み込んでいます…
        </p>
      ) : null}

      {session.status !== 'loading' && session.dialogues.length === 0 ? (
        <div className="mt-8 rounded-2xl bg-white px-5 py-8 text-center shadow-sm">
          <p className="text-sm font-bold text-slate-600">まだ保存した会話がありません。</p>
          <Link to="/lesson" className="mt-4 inline-block rounded-2xl bg-sky-700 px-5 py-3 text-sm font-bold text-white">
            会話レッスンを作る
          </Link>
        </div>
      ) : null}

      {session.status === 'idle' && session.dialogues.length > 0 ? (
        <div className="mt-7 rounded-3xl border border-sky-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-bold tracking-wider text-sky-700">聞く会話(約 {estimateMinutes(session.totalTurns)} 分)</p>
          <ol className="mt-3 space-y-2">
            {session.dialogues.map((dialogue, index) => (
              <li key={dialogue.id} className="rounded-2xl bg-slate-50 px-4 py-3">
                <span className="text-xs font-bold text-slate-400">{index + 1}</span>
                <span className="ml-2 font-bold text-slate-900">{dialogue.title_ja}</span>
                <span className="mt-1 block text-xs text-slate-500">{dialogue.scene_ja}・{dialogue.dialogue.length} 行</span>
              </li>
            ))}
          </ol>
          <button
            type="button"
            onClick={() => void session.start()}
            className="mt-6 w-full rounded-2xl bg-sky-700 px-5 py-4 font-bold text-white"
          >
            はじめる
          </button>
        </div>
      ) : null}

      {session.status === 'playing' && current ? (
        <div className="mt-7 rounded-3xl border border-sky-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-bold tracking-wider text-sky-700">
            {session.dialogueIndex + 1} 本目 / {session.dialogues.length}・{session.turnIndex + 1} / {current.dialogue.length} 行
          </p>
          <h2 className="mt-2 text-lg font-bold text-slate-900">{current.title_ja}</h2>
          <p className="mt-1 text-sm text-slate-500">{current.scene_ja}</p>
          <p className="mt-6 text-center text-5xl" aria-hidden="true">🎧</p>

          {session.scriptVisible ? (
            <div className="mt-5 space-y-2" aria-label="台本">
              {current.dialogue.map((turn, index) => (
                <div
                  key={`${turn.speaker}-${index}`}
                  className={`rounded-2xl px-4 py-3 ${index === session.turnIndex ? 'bg-sky-50 ring-2 ring-sky-300' : 'bg-slate-50'}`}
                >
                  <p className="text-xs font-bold text-sky-700">{turn.speaker}</p>
                  <p className="mt-1 font-bold text-slate-900">{turn.text}</p>
                  <p className="mt-1 text-sm text-slate-500">{turn.ja}</p>
                </div>
              ))}
            </div>
          ) : null}

          <div className="mt-6 grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={session.toggleScript}
              className="rounded-2xl border border-sky-200 bg-white px-4 py-3 text-sm font-bold text-sky-800"
            >
              {session.scriptVisible ? '台本を隠す' : '台本を見る'}
            </button>
            <button
              type="button"
              onClick={session.stop}
              className="rounded-2xl bg-slate-100 px-4 py-3 text-sm font-bold text-slate-700"
            >
              止める
            </button>
          </div>
        </div>
      ) : null}

      {session.status === 'finished' ? (
        <div className="mt-7 rounded-3xl border border-sky-200 bg-white p-6 text-center shadow-sm">
          <p className="text-5xl" aria-hidden="true">✨</p>
          <h2 className="mt-4 text-xl font-bold text-slate-900">聞き流し、おつかれさまでした</h2>
          <p className="mt-2 text-sm text-slate-500">{session.dialogues.length} 本・{session.totalTurns} 行を聞きました</p>
          <button
            type="button"
            onClick={() => void session.start()}
            className="mt-6 w-full rounded-2xl bg-sky-700 px-5 py-4 font-bold text-white"
          >
            もう一度聞く
          </button>
          <Link to="/" className="mt-3 block w-full rounded-2xl border border-slate-200 bg-white px-5 py-3 font-bold text-slate-700">
            ホームへ
          </Link>
        </div>
      ) : null}
    </section>
  )
}
