import { Toast } from '../../components/Toast'
import { VERB_GROUP_LABELS, type TwoWordVerb, type VerbGroup } from '../../content/twoWordSchema'
import type { TwoWordLevel } from '../../services/settings'
import { SET_SIZE, TARGET_SECONDS_PER_SET } from './twoWordSession'
import { useTwoWordSession } from './useTwoWordSession'

const LEVELS: { level: TwoWordLevel; label: string; hint: string }[] = [
  { level: 2, label: '2 語', hint: '動詞 + 目的語' },
  { level: 3, label: '3 語', hint: '主語を足す' },
  { level: 4, label: '4 語', hint: '時や場所を足す' },
]

const GROUP_ORDER: VerbGroup[] = ['action', 'change', 'state', 'emotion', 'transfer', 'thought']

function seconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)} 秒`
}

/** 括弧の中(冠詞・三単現)は薄く見せる。教材の「気にしない」を見た目でも示す。 */
function AnswerText({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\([^)]*\))/g).map((part, index) => (
        part.startsWith('(')
          ? <span key={index} className="font-normal text-slate-400">{part}</span>
          : <span key={index}>{part}</span>
      ))}
    </>
  )
}

function VerbList({ verbs }: { verbs: TwoWordVerb[] }) {
  return (
    <div className="space-y-2">
      {GROUP_ORDER.map((group) => {
        const members = verbs.filter((verb) => verb.group === group)
        if (members.length === 0) {
          return null
        }
        return (
          <div key={group}>
            <p className="text-[11px] font-bold tracking-wider text-slate-500">{VERB_GROUP_LABELS[group]}</p>
            <ul className="mt-1 flex flex-wrap gap-1.5">
              {members.map((verb) => (
                <li key={verb.text} className="rounded-full bg-white px-2.5 py-1 text-xs shadow-sm">
                  <span className="font-bold text-slate-900">{verb.text}</span>
                  <span className="ml-1 text-slate-500">{verb.ja}</span>
                </li>
              ))}
            </ul>
          </div>
        )
      })}
    </div>
  )
}

export function TwoWordPage({ lang }: { lang: 'en' | 'ko' }) {
  const session = useTwoWordSession(lang)
  const { phase, current, round, summary } = session

  if (!session.supported) {
    return (
      <p className="mt-7 rounded-2xl bg-white px-5 py-8 text-center text-sm leading-6 text-slate-500">
        2 語で言うは、まず英語で作っています。韓国語は後で足します。
      </p>
    )
  }

  const overTarget = session.elapsedMs > TARGET_SECONDS_PER_SET * 1000

  return (
    <div>
      <Toast error={session.error} onClose={session.clearError} />

      <div className="flex items-center justify-between gap-4">
        <p className="text-sm font-bold text-slate-500">
          {phase === 'asking' || phase === 'checking'
            ? `セット ${session.roundIndex + 1}/${session.roundCount} ・ ${Math.min(session.questionIndex + 1, SET_SIZE)}/${SET_SIZE}`
            : '動詞 25 語で、短く言う練習です'}
        </p>
        <div className="flex rounded-full bg-slate-100 p-1" aria-label="語数">
          {LEVELS.map((item) => (
            <button
              key={item.level}
              type="button"
              aria-pressed={session.level === item.level}
              onClick={() => session.setLevel(item.level)}
              className={`rounded-full px-3 py-2 text-xs font-bold transition-colors ${session.level === item.level ? 'bg-white text-violet-800 shadow-sm' : 'text-slate-500'}`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {phase === 'idle' ? (
        <div className="mt-7 rounded-3xl border border-violet-200 bg-white p-6 shadow-sm">
          <div className="text-center">
            <p className="text-6xl" aria-hidden="true">🔤</p>
            <h2 className="mt-5 text-xl font-bold text-slate-900">2 語で言う</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              日本語のお題を見て、動詞 25 語から選んで声に出します。{SET_SIZE} 問を {TARGET_SECONDS_PER_SET} 秒で。
              冠詞や三単現の s は気にしません。答えは 1 つではないので、動詞が合っていれば「言えた」です。
            </p>
            <p className="mt-2 text-xs font-bold text-violet-700">
              {LEVELS.find((item) => item.level === session.level)?.label}: {LEVELS.find((item) => item.level === session.level)?.hint}
            </p>
          </div>
          <details className="mt-4 rounded-2xl bg-violet-50 px-4 py-3">
            <summary className="cursor-pointer text-xs font-bold tracking-wider text-violet-700">使う動詞 25 語</summary>
            <div className="mt-3">
              <VerbList verbs={session.verbs} />
            </div>
          </details>
          <button
            type="button"
            onClick={session.start}
            className="mt-6 w-full rounded-2xl bg-violet-700 px-5 py-4 font-bold text-white"
          >
            はじめる
          </button>
        </div>
      ) : null}

      {phase === 'asking' && current && round ? (
        <div className="mt-7 rounded-3xl border border-violet-200 bg-gradient-to-b from-violet-50 to-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold tracking-wider text-violet-700">
              {round.kind === 'scene' ? '相手にこう言われました' : 'こう言ってください'}
            </p>
            <p
              className={`text-sm font-bold tabular-nums ${overTarget ? 'text-rose-600' : 'text-slate-500'}`}
              aria-live="off"
            >
              {seconds(session.elapsedMs)} / {TARGET_SECONDS_PER_SET} 秒
            </p>
          </div>

          {round.kind === 'scene' && current.prompt ? (
            <div className="mt-3 flex items-start gap-3 rounded-2xl bg-white px-4 py-3 shadow-sm">
              <div className="min-w-0 flex-1">
                <p className="text-lg font-bold text-slate-900">{current.prompt}</p>
                <p className="mt-1 text-sm text-slate-500">{current.promptJa}</p>
              </div>
              <button
                type="button"
                onClick={() => session.say(current.prompt ?? '')}
                className="grid size-10 shrink-0 place-items-center rounded-full bg-violet-50 text-lg"
                aria-label="相手の言葉を聞く"
              >
                🔊
              </button>
            </div>
          ) : null}

          <h2 className="mt-4 text-center text-2xl font-bold leading-9 text-slate-900">
            {round.kind === 'scene' ? `${session.level} 語で返してみよう` : current.ja}
          </h2>
          <p className="mt-2 text-center text-xs text-slate-500">
            声に出したら「言った」。答えはセットの終わりに出ます
          </p>
        </div>
      ) : null}

      {phase === 'asking' ? (
        <button
          type="button"
          onClick={session.next}
          className="mt-5 flex min-h-16 w-full items-center justify-center rounded-2xl bg-teal-600 px-5 text-base font-bold text-white"
        >
          言った
        </button>
      ) : null}

      {phase === 'checking' && round ? (
        <div className="mt-7 rounded-3xl border border-violet-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold tracking-wider text-violet-700">答え合わせ</p>
            <p className={`text-sm font-bold tabular-nums ${overTarget ? 'text-rose-600' : 'text-teal-700'}`}>
              {seconds(session.elapsedMs)}
              {overTarget ? '(目標より長い)' : '(目標内)'}
            </p>
          </div>
          <p className="mt-2 text-xs leading-5 text-slate-500">
            動詞が合っていれば言えたことにします。言えなかったものだけ押して直してください。
          </p>
          <ul className="mt-4 space-y-3">
            {round.questions.map((question) => {
              const said = session.marks[question.id] === true
              return (
                <li key={question.id} className="rounded-2xl bg-slate-50 px-4 py-3">
                  <p className="text-sm text-slate-600">
                    {question.kind === 'scene' ? question.prompt : question.ja}
                  </p>
                  <div className="mt-2 space-y-1">
                    {question.answers.map((answer) => (
                      <div key={answer} className="flex items-center gap-3">
                        <p className="min-w-0 flex-1 text-lg font-bold text-slate-900"><AnswerText text={answer} /></p>
                        <button
                          type="button"
                          onClick={() => session.say(answer.replace(/[()]/g, ''))}
                          className="grid size-9 shrink-0 place-items-center rounded-full bg-white text-base shadow-sm"
                          aria-label={`${answer} を聞く`}
                        >
                          🔊
                        </button>
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    aria-pressed={said}
                    onClick={() => session.toggleSaid(question.id)}
                    className={`mt-3 w-full rounded-xl px-3 py-2 text-xs font-bold ${said ? 'bg-teal-600 text-white' : 'border border-slate-300 bg-white text-slate-600'}`}
                  >
                    {said ? '言えた' : '言えなかった'}
                  </button>
                </li>
              )
            })}
          </ul>
          <button
            type="button"
            onClick={session.nextRound}
            className="mt-6 w-full rounded-2xl bg-violet-700 px-5 py-4 font-bold text-white"
          >
            {session.roundIndex + 1 < session.roundCount ? '次のセットへ' : '結果を見る'}
          </button>
        </div>
      ) : null}

      {phase === 'asking' || phase === 'checking' ? (
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
          <p className="text-5xl" aria-hidden="true">🔤</p>
          <h2 className="mt-4 text-xl font-bold text-slate-900">3 セット終わりました</h2>
          <div className="mt-6 grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-2xl font-bold tabular-nums text-violet-900">{summary.said}/{summary.total}</p>
              <p className="mt-1 text-xs font-bold text-slate-500">言えた</p>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-lg font-bold tabular-nums text-violet-900">
                {summary.roundMs.map((ms) => (ms / 1000).toFixed(0)).join(' → ')} 秒
              </p>
              <p className="mt-1 text-xs font-bold text-slate-500">セットごとの時間(目標 {TARGET_SECONDS_PER_SET} 秒)</p>
            </div>
          </div>
          {summary.bestMs !== null ? (
            <p className="mt-3 text-xs text-slate-500">この語数の最短: {seconds(summary.bestMs)}</p>
          ) : null}
          {summary.nextLevel ? (
            <p className="mt-5 rounded-2xl bg-teal-50 px-4 py-3 font-bold text-teal-900">
              2 回続けて目標に届きました。{summary.nextLevel} 語に上げてみましょう
            </p>
          ) : summary.reached ? (
            <p className="mt-5 rounded-2xl bg-teal-50 px-4 py-3 text-sm font-bold text-teal-900">
              目標に届きました。もう 1 回届いたら次の語数へ
            </p>
          ) : (
            <p className="mt-5 text-sm leading-6 text-slate-500">
              速さより「動詞が出る」ことが先です。何度か回すと 45 秒に入ってきます。
            </p>
          )}
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
