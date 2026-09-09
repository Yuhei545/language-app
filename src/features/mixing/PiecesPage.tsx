import { Toast } from '../../components/Toast'
import { ACQUIRED } from '../chunks/ledger'
import type { PieceStage, PieceStatus } from './piecesSession'
import { usePiecesSession, type PieceListEntry } from './usePiecesSession'

const STAGES: { id: PieceStage; label: string; hint: string }[] = [
  { id: 'fit', label: 'はめる', hint: 'ピースにかたまりをはめる' },
  { id: 'link', label: 'つなぐ', hint: 'ピースに文をつなげて長くする' },
]

function statusText(status: PieceStatus): string {
  if (status.acquired) {
    return '身についた'
  }
  if (status.seen === 0) {
    return 'まだ'
  }
  return `出会い ${status.seen}/${ACQUIRED.seen} ・ 言えた ${status.said}/${ACQUIRED.said}`
}

function PieceList({ entries, onPick }: { entries: PieceListEntry[]; onPick: (id: string) => void }) {
  return (
    <ul className="mt-3 space-y-1.5">
      {entries.map(({ piece, status }) => (
        <li key={piece.id}>
          <button
            type="button"
            onClick={() => onPick(piece.id)}
            className="flex w-full items-center gap-3 rounded-xl bg-white px-3 py-2 text-left shadow-sm"
          >
            <span className="w-7 shrink-0 text-[11px] font-bold tabular-nums text-slate-400">{String(piece.no).padStart(2, '0')}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-bold text-slate-900">{piece.display}</span>
              <span className="block truncate text-xs text-slate-500">{piece.ja}</span>
            </span>
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${status.acquired ? 'bg-teal-50 text-teal-800' : 'bg-slate-100 text-slate-500'}`}>
              {statusText(status)}
            </span>
          </button>
        </li>
      ))}
    </ul>
  )
}

export function PiecesPage({ lang }: { lang: 'en' | 'ko' }) {
  const session = usePiecesSession(lang)
  const { phase, stage, currentPiece, currentItem, summary } = session

  if (!session.supported) {
    return (
      <p className="mt-7 rounded-2xl bg-white px-5 py-8 text-center text-sm leading-6 text-slate-500">
        ピースをつなぐは、まず英語で作っています。韓国語は後で足します。
      </p>
    )
  }

  const stageInfo = STAGES.find((item) => item.id === stage) ?? STAGES[0]
  const head = currentItem ? (currentItem.variant?.text ?? currentItem.piece.text) : ''
  const headJa = currentItem ? (currentItem.variant?.ja ?? currentItem.piece.ja) : ''

  return (
    <div>
      <Toast error={session.error} onClose={session.clearError} />

      <div className="flex items-center justify-between gap-4">
        <p className="text-sm font-bold text-slate-500">
          {phase === 'intro' || phase === 'thinking' || phase === 'model'
            ? `ピース ${session.pieceIndex + 1}/${session.pieceCount} ・ ${Math.min(session.itemIndex + 1, session.itemCount)}/${session.itemCount}`
            : stageInfo.hint}
        </p>
        <div className="flex rounded-full bg-slate-100 p-1" aria-label="段階">
          {STAGES.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={stage === item.id}
              disabled={phase !== 'idle' && phase !== 'finished'}
              onClick={() => session.setStage(item.id)}
              className={`rounded-full px-3 py-2 text-xs font-bold transition-colors disabled:opacity-60 ${stage === item.id ? 'bg-white text-violet-800 shadow-sm' : 'text-slate-500'}`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {phase === 'loading' ? (
        <p className="mt-7 rounded-2xl bg-white px-5 py-8 text-center text-sm font-bold text-slate-500" role="status">
          表現の台帳を読み込んでいます…
        </p>
      ) : null}

      {phase === 'idle' ? (
        <div className="mt-7 rounded-3xl border border-violet-200 bg-white p-6 shadow-sm">
          <div className="text-center">
            <p className="text-6xl" aria-hidden="true">🧩</p>
            <h2 className="mt-5 text-xl font-bold text-slate-900">ピースをつなぐ</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              {stage === 'fit'
                ? '1 つのピース(I can 〜)に、かたまりを 5 つ続けてはめます。同じ頭で言い続けると、口が形を覚えます。'
                : 'ピース(I didn\'t know that 〜)の後ろに、先に見せる文をつなげます。短い文が、そのまま長い文になります。'}
              {' '}ピースは 3 つ。言えたかどうかは自分で押します。
            </p>
          </div>
          {session.upcoming.length > 0 ? (
            <div className="mt-4 rounded-2xl bg-violet-50 px-4 py-3">
              <p className="text-xs font-bold tracking-wider text-violet-700">今回のピース</p>
              <ul className="mt-2 flex flex-wrap gap-2">
                {session.upcoming.map((piece) => (
                  <li key={piece.id} className="rounded-full bg-white px-3 py-1 text-xs font-bold text-violet-900 shadow-sm">
                    {piece.display}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <button
            type="button"
            onClick={() => session.start()}
            className="mt-6 w-full rounded-2xl bg-violet-700 px-5 py-4 font-bold text-white"
          >
            はじめる
          </button>
          <details className="mt-4 rounded-2xl bg-slate-50 px-4 py-3">
            <summary className="cursor-pointer text-xs font-bold tracking-wider text-slate-600">
              ピース一覧({session.list.length})。押すとそのピースから始めます
            </summary>
            <PieceList entries={session.list} onPick={(id) => session.start(id)} />
          </details>
        </div>
      ) : null}

      {phase === 'intro' && currentPiece ? (
        <div className="mt-7 rounded-3xl border border-violet-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-bold tracking-wider text-violet-700">
            {stage === 'fit' ? 'このピースにはめます' : 'このピースにつなぎます'}
          </p>
          <p className="mt-3 rounded-2xl bg-violet-50 px-4 py-3 text-center text-lg font-bold text-violet-950">
            {currentPiece.display}
          </p>
          <p className="mt-1 text-center text-sm font-bold text-slate-700">{currentPiece.ja}</p>
          {currentPiece.note_ja ? (
            <p className="mt-3 text-sm leading-6 text-slate-700">{currentPiece.note_ja}</p>
          ) : null}
          <p className="mt-5 text-xs font-bold tracking-wider text-slate-500">例文</p>
          <div className="mt-2 flex items-start gap-3 rounded-2xl bg-slate-50 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="font-bold text-slate-900">{currentPiece.example.text}</p>
              <p className="mt-1 text-sm text-slate-500">{currentPiece.example.ja}</p>
            </div>
            <button
              type="button"
              onClick={() => session.say(currentPiece.example.text)}
              className="grid size-10 shrink-0 place-items-center rounded-full bg-white text-lg shadow-sm"
              aria-label={`${currentPiece.example.text} を聞く`}
            >
              🔊
            </button>
          </div>
          <button
            type="button"
            onClick={session.beginItems}
            className="mt-6 w-full rounded-2xl bg-violet-700 px-5 py-4 font-bold text-white"
          >
            このピースで練習する
          </button>
        </div>
      ) : null}

      {currentItem && (phase === 'thinking' || phase === 'model') ? (
        <div className="mt-7 rounded-3xl border border-violet-200 bg-gradient-to-b from-violet-50 to-white p-6 shadow-sm">
          {stage === 'fit' ? (
            <>
              <p className="text-center text-xs font-bold tracking-wider text-violet-700">これをはめて言う</p>
              <h2 className="mt-3 text-center text-2xl font-bold leading-9 text-slate-900">「{currentItem.cueJa}」</h2>
              <p className="mt-2 text-center text-sm text-slate-600">
                <span className="font-bold text-violet-900">{head} 〜</span>
                <span className="ml-2 text-xs text-slate-500">({headJa})</span>
              </p>
              {currentItem.fromSmall ? (
                <p className="mt-1 text-center text-[11px] font-bold text-slate-400">日常のかたまりから</p>
              ) : null}
            </>
          ) : (
            <>
              <p className="text-center text-xs font-bold tracking-wider text-violet-700">この文をつなぐ</p>
              <div className="mt-3 flex items-center gap-3 rounded-2xl bg-white px-4 py-3 shadow-sm">
                <p className="min-w-0 flex-1 text-lg font-bold text-slate-900">{currentItem.inner}</p>
                <button
                  type="button"
                  onClick={() => session.say(currentItem.inner ?? '')}
                  className="grid size-9 shrink-0 place-items-center rounded-full bg-violet-50 text-base"
                  aria-label="中の文を聞く"
                >
                  🔊
                </button>
              </div>
              <p className="mt-3 text-center text-sm text-slate-600">
                <span className="font-bold text-violet-900">→ {currentItem.piece.display}</span>
                <span className="ml-2 text-xs text-slate-500">({currentItem.piece.ja})</span>
              </p>
              <p className="mt-1 text-center text-sm text-slate-500">「{currentItem.cueJa}」</p>
            </>
          )}

          {phase === 'thinking' ? (
            <div className="mt-5 text-center">
              <p className="text-sm font-bold text-slate-600">声に出して言ってください</p>
              <p className="mt-2 text-4xl font-bold tabular-nums text-violet-800" aria-live="polite">
                あと {Math.max(0, session.secondsLeft)} 秒
              </p>
            </div>
          ) : null}

          {phase === 'model' ? (
            <div className="mt-5">
              <p className="text-center text-sm font-bold text-slate-600">声に出せましたか?</p>
              <p className="mt-3 text-[11px] font-bold tracking-wider text-slate-500">答え</p>
              <div className="mt-1 flex items-start gap-3 rounded-2xl bg-white px-4 py-3 shadow-sm">
                <p className="min-w-0 flex-1 text-lg font-bold text-slate-900">{currentItem.answer}</p>
                <button
                  type="button"
                  onClick={() => session.say(currentItem.answer)}
                  className="grid size-10 shrink-0 place-items-center rounded-full bg-violet-50 text-lg"
                  aria-label="答えを聞く"
                >
                  🔊
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {phase === 'thinking' ? (
        <button
          type="button"
          onClick={session.reveal}
          className="mt-5 w-full rounded-2xl bg-violet-700 px-5 py-4 font-bold text-white"
        >
          答えを見る
        </button>
      ) : null}

      {phase === 'model' ? (
        <div className="mt-5 grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => session.judgeSelf(true)}
            className="rounded-2xl bg-teal-600 px-4 py-4 font-bold text-white"
          >
            言えた
          </button>
          <button
            type="button"
            onClick={() => session.judgeSelf(false)}
            className="rounded-2xl border border-slate-300 bg-white px-4 py-4 font-bold text-slate-700"
          >
            言えなかった
          </button>
        </div>
      ) : null}

      {phase === 'intro' || phase === 'thinking' || phase === 'model' ? (
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
          <p className="text-center text-5xl" aria-hidden="true">🧩</p>
          <h2 className="mt-4 text-center text-xl font-bold text-slate-900">3 ピース終わりました</h2>
          <div className="mt-6 rounded-2xl bg-slate-50 p-4 text-center">
            <p className="text-2xl font-bold tabular-nums text-violet-900">{summary.said}/{summary.total}</p>
            <p className="mt-1 text-xs font-bold text-slate-500">言えた</p>
          </div>
          <ul className="mt-4 space-y-2">
            {summary.pieces.map(({ piece, status }) => (
              <li key={piece.id} className="flex items-center gap-3 rounded-xl bg-white px-3 py-2 shadow-sm">
                <span className="min-w-0 flex-1 truncate text-sm font-bold text-slate-900">{piece.display}</span>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${status.acquired ? 'bg-teal-50 text-teal-800' : 'bg-slate-100 text-slate-500'}`}>
                  {statusText(status)}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-center text-xs leading-5 text-slate-500">
            出会い {ACQUIRED.seen} 回・言えた {ACQUIRED.said} 回で「身についた」。ホームの台帳にも数えられます。
          </p>
          <button
            type="button"
            onClick={() => session.start()}
            className="mt-6 w-full rounded-2xl bg-violet-700 px-5 py-4 font-bold text-white"
          >
            次の 3 ピース
          </button>
        </div>
      ) : null}
    </div>
  )
}
