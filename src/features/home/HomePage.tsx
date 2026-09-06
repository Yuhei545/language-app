import { Link } from 'react-router-dom'
import { useLanguage } from '../../app/LanguageContext'
import { Toast } from '../../components/Toast'
import type { PrepEventRow } from '../../services/supabase/types'
import type { ChunkKind } from '../chunks/registry'
import { useHomeData, type HomeTarget } from './useHomeData'

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

const KIND_LABEL: Record<ChunkKind, string> = {
  frame: '型',
  phrasal: '句動詞',
  expression: '表現',
}

const KIND_STYLE: Record<ChunkKind, string> = {
  frame: 'bg-violet-100 text-violet-800',
  phrasal: 'bg-amber-100 text-amber-800',
  expression: 'bg-sky-100 text-sky-800',
}

/** 推奨の順番と目安時間。研究の要点: 出す練習を先に、聞く量を足し、会話で締める。 */
const RECOMMENDED_ORDER = '型を回す 6 分 → カード 5 分 → 聞いて書く 5 分 → 聞き流し 4 分 → ChatGPT 10 分。会話レッスンは週 2〜3 回'

function TargetChip({ target }: { target: HomeTarget }) {
  const done = target.seen >= target.goal
  return (
    <li
      className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-bold ${done ? 'border-teal-300 bg-teal-50 text-teal-900' : 'border-slate-200 bg-white text-slate-800'}`}
      title={target.chunk.hintJa}
    >
      <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${KIND_STYLE[target.chunk.kind]}`}>{KIND_LABEL[target.chunk.kind]}</span>
      <span>{target.chunk.display}</span>
      <span className="tabular-nums text-slate-400">{target.seen}/{target.goal}</span>
    </li>
  )
}

function TaskRow({
  to,
  label,
  complete,
  remaining,
  last = false,
}: {
  to: string
  label: string
  complete: boolean
  remaining: string
  last?: boolean
}) {
  return (
    <Link to={to} className={`flex items-center gap-3 px-4 py-4 ${last ? '' : 'border-b border-slate-100'}`}>
      <span className={`grid size-7 place-items-center rounded-full text-sm font-bold ${complete ? 'bg-teal-600 text-white' : 'border-2 border-slate-300 text-transparent'}`}>
        {complete ? '✓' : '•'}
      </span>
      <span className="flex-1 font-bold text-slate-700">{label}</span>
      <span className="text-sm font-bold text-slate-500">{complete ? '完了' : remaining}</span>
    </Link>
  )
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

      <section className="mt-7" aria-labelledby="targets-heading">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-xs font-bold tracking-wider text-slate-400">TODAY&apos;S CHUNKS</p>
            <h2 id="targets-heading" className="mt-1 text-lg font-bold text-slate-900">今日の狙い</h2>
          </div>
          <p className="text-right text-xs font-bold text-slate-500">
            身についた表現 <span className="text-base tabular-nums text-teal-800">{data.acquiredCount}</span>
            {data.acquiredThisWeek > 0 ? <span className="ml-1 text-teal-700">(今週 +{data.acquiredThisWeek})</span> : null}
          </p>
        </div>
        {data.targets.length > 0 ? (
          <>
            <ul className="mt-3 flex flex-wrap gap-2">
              {data.targets.map((target) => (
                <TargetChip key={target.chunk.key} target={target} />
              ))}
            </ul>
            <p className="mt-2 text-xs leading-5 text-slate-500">
              型を回す・カード・聞いて書く・レッスン・ChatGPT に出てきます。数字は出会った回数(8 回・言えた 3 回・2 つの場面で「身についた」)。
            </p>
          </>
        ) : (
          <p className="mt-3 rounded-2xl bg-white px-4 py-4 text-sm text-slate-500">今日の狙いはまだありません。</p>
        )}
      </section>

      <Link
        to="/talk"
        className="group mt-7 block overflow-hidden rounded-[1.75rem] bg-teal-700 px-6 py-7 text-white shadow-[0_18px_45px_rgba(15,118,110,0.24)] transition-transform active:scale-[0.99]"
      >
        <p className="text-xs font-bold tracking-[0.16em] text-teal-100">LANGUAGE PARENT</p>
        <div className="mt-3 flex items-end justify-between gap-4">
          <div>
            <p className="text-3xl font-bold">ChatGPT で会話</p>
            <p className="mt-2 text-sm leading-6 text-teal-50/80">今日の狙いを入れたプロンプトをコピーして、音読しながら会話します。</p>
          </div>
          <span className="mb-1 text-3xl transition-transform group-hover:translate-x-1" aria-hidden="true">→</span>
        </div>
      </Link>

      <section className="mt-8">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900">今日のタスク</h2>
          <p className="text-xs font-bold text-slate-400">4つ</p>
        </div>
        <p className="mt-1 text-xs leading-5 text-slate-500">おすすめの順番: {RECOMMENDED_ORDER}</p>
        <div className="mt-3 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <TaskRow
            to="/cards"
            label="単語カード"
            complete={data.dueCardCount === 0}
            remaining={`${data.dueCardCount}枚`}
          />
          <TaskRow
            to="/dictation"
            label="聞いて書く"
            complete={data.dictationComplete}
            remaining="5文"
          />
          <TaskRow
            to="/replay"
            label="聞き流し"
            complete={data.replayComplete}
            remaining="3本"
          />
          <TaskRow
            to="/talk"
            label="ChatGPT で会話"
            complete={data.conversationComplete}
            remaining="1回"
            last
          />
        </div>
      </section>

      <Link
        to="/mixing"
        className="mt-4 flex items-center gap-4 rounded-2xl border border-violet-200 bg-violet-50 p-4"
      >
        <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-white text-2xl" aria-hidden="true">🧩</span>
        <span className="min-w-0 flex-1">
          <span className="block font-bold text-slate-900">瞬間組み立て</span>
          <span className="mt-1 block text-sm leading-5 text-slate-600">日本語から一瞬で、使える一言へ。今日の狙いの型から始まります</span>
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
