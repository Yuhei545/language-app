import { useEffect, useRef } from 'react'
import type { VocabItemRow } from '../../services/supabase/types'
import type { Grade } from './srs'
import type { CardPhase } from './useCardSession'

type FlashcardProps = {
  card: VocabItemRow
  isFirstEncounter: boolean
  phase: CardPhase
  /** 音読して「言ってみた」を押したあと。語・例文・意味を見せる。 */
  answerVisible: boolean
  hintVisible: boolean
  hintSaving: boolean
  onListen: () => Promise<void>
  onSaidIt: () => void
  onShowHint: () => Promise<void>
  onGrade: (grade: Grade) => Promise<void>
}

export function Flashcard({
  card,
  isFirstEncounter,
  phase,
  answerVisible,
  hintVisible,
  hintSaving,
  onListen,
  onSaidIt,
  onShowHint,
  onGrade,
}: FlashcardProps) {
  const autoPlayedCardId = useRef<string | null>(null)
  const replayedForCardId = useRef<string | null>(null)
  const isBusy = phase === 'speaking' || phase === 'saving'

  useEffect(() => {
    if (autoPlayedCardId.current === card.id) {
      return
    }

    autoPlayedCardId.current = card.id
    void onListen()
  }, [card.id, onListen])

  // 答えを見せたとき、文字を見ながらもう一度聞く
  useEffect(() => {
    if (!answerVisible || replayedForCardId.current === card.id) {
      return
    }

    replayedForCardId.current = card.id
    void onListen()
  }, [answerVisible, card.id, onListen])

  return (
    <article className="overflow-hidden rounded-[2rem] border border-teal-900/10 bg-white shadow-[0_18px_50px_rgba(15,118,110,0.10)]">
      <div className="bg-gradient-to-b from-teal-50 to-white px-5 pb-7 pt-8 text-center">
        <p className="text-[5rem] leading-none" aria-label="単語を表す絵文字">{card.emoji || '💭'}</p>

        {!answerVisible && isFirstEncounter ? (
          <div className="mt-7">
            <p className="text-sm font-bold text-teal-900">
              はじめての言葉です。意味を確かめてから声に出しましょう
            </p>
            <p className="mt-4 text-3xl font-bold tracking-tight text-slate-900">{card.text}</p>
            <p className="mx-auto mt-3 max-w-sm text-base leading-7 text-slate-600">
              {card.example || card.text}
            </p>
            <p className="mx-auto mt-4 max-w-sm rounded-2xl bg-sky-50 px-4 py-3 text-sm leading-6 text-slate-700">
              {card.hint_ja || '日本語の意味はまだ登録されていません'}
            </p>
          </div>
        ) : !answerVisible ? (
          <div className="mt-7">
            <p className="text-sm font-bold text-teal-900">絵と音を、そのまま結びつけてみましょう</p>
            <p className="mt-2 text-xs leading-5 text-slate-500">
              聞こえた音を声に出したら「言ってみた」を押してください。答えが出ます。
            </p>
          </div>
        ) : (
          <div className="mt-7" aria-live="polite">
            <p className="text-3xl font-bold tracking-tight text-slate-900">{card.text}</p>
            <p className="mx-auto mt-3 max-w-sm text-base leading-7 text-slate-600">{card.example || card.text}</p>
            <p className="mx-auto mt-4 max-w-sm rounded-2xl bg-sky-50 px-4 py-3 text-sm leading-6 text-slate-700">
              {card.hint_ja || '日本語の意味はまだ登録されていません'}
            </p>
          </div>
        )}
      </div>

      <div className="border-t border-slate-100 px-5 py-5">
        <div className={`grid gap-3 ${(isFirstEncounter && !answerVisible) || answerVisible ? 'grid-cols-1' : 'grid-cols-2'}`}>
          <button
            type="button"
            onClick={() => void onListen()}
            disabled={isBusy}
            className="rounded-2xl border border-teal-200 bg-teal-50 px-3 py-3 text-sm font-bold text-teal-800 transition-colors hover:bg-teal-100 disabled:opacity-40"
          >
            🔊 聞く
          </button>
          {(isFirstEncounter && !answerVisible) || answerVisible ? null : (
            <button
              type="button"
              onClick={() => void onShowHint()}
              disabled={hintVisible || hintSaving || isBusy}
              className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-bold text-slate-700 transition-colors hover:bg-slate-100 disabled:opacity-40"
            >
              {hintSaving ? '保存中…' : '🇯🇵 ヒント'}
            </button>
          )}
        </div>

        {hintVisible && !answerVisible ? (
          <div className="mt-3 rounded-2xl bg-sky-50 px-4 py-3 text-center" aria-live="polite">
            <p className="text-xs font-bold text-sky-700">日本語ヒント</p>
            <p className="mt-1 text-sm leading-6 text-slate-700">
              {card.hint_ja || 'ヒントはまだ登録されていません'}
            </p>
          </div>
        ) : null}

        {!answerVisible ? (
          <div className="mt-5 text-center">
            <button
              type="button"
              onClick={onSaidIt}
              disabled={isBusy}
              className="mx-auto flex min-h-16 w-full items-center justify-center rounded-2xl bg-teal-700 px-5 text-base font-bold text-white shadow-sm transition-transform hover:bg-teal-800 active:scale-[0.98] disabled:opacity-45"
            >
              🗣️ 言ってみた
            </button>
            <p className="mt-2 text-[11px] text-slate-500">声に出してから押します</p>
          </div>
        ) : (
          <div className="mt-5 border-t border-slate-100 pt-5">
            <p className="text-center text-xs font-bold text-slate-500">声に出した感覚で選んでください</p>
            <div className="mt-3 grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => void onGrade('again')}
                disabled={isBusy || hintSaving}
                className="rounded-2xl bg-slate-100 px-2 py-3 text-sm font-bold text-slate-700 disabled:opacity-40"
              >
                まだ
              </button>
              <button
                type="button"
                onClick={() => void onGrade('hard')}
                disabled={isBusy || hintSaving}
                className="rounded-2xl bg-amber-100 px-2 py-3 text-sm font-bold text-amber-900 disabled:opacity-40"
              >
                あやしい
              </button>
              <button
                type="button"
                onClick={() => void onGrade('good')}
                disabled={isBusy || hintSaving}
                className="rounded-2xl bg-teal-700 px-2 py-3 text-sm font-bold text-white disabled:opacity-40"
              >
                言えた
              </button>
            </div>
            {phase === 'saving' ? (
              <p className="mt-3 text-center text-xs font-bold text-teal-700" role="status">記録しています…</p>
            ) : null}
          </div>
        )}
      </div>
    </article>
  )
}
