import { useEffect, useRef } from 'react'
import type { VocabItemRow } from '../../services/supabase/types'
import type { Grade } from './srs'
import type { CardAttempt, CardPhase } from './useCardSession'

type FlashcardProps = {
  card: VocabItemRow
  isFirstEncounter: boolean
  phase: CardPhase
  attempt: CardAttempt | null
  hintVisible: boolean
  hintSaving: boolean
  sttEngine: 'webspeech' | 'gemini' | null
  onListen: () => Promise<void>
  onStartRecording: () => Promise<void>
  onStopRecording: () => Promise<void>
  onShowHint: () => Promise<void>
  onGrade: (grade: Grade) => Promise<void>
}

function engineLabel(engine: 'webspeech' | 'gemini' | null): string {
  if (engine === 'webspeech') {
    return 'Web Speech'
  }

  if (engine === 'gemini') {
    return 'Gemini'
  }

  return '開始後に表示'
}

export function Flashcard({
  card,
  isFirstEncounter,
  phase,
  attempt,
  hintVisible,
  hintSaving,
  sttEngine,
  onListen,
  onStartRecording,
  onStopRecording,
  onShowHint,
  onGrade,
}: FlashcardProps) {
  const autoPlayedCardId = useRef<string | null>(null)
  const replayedAttempt = useRef<CardAttempt | null>(null)
  const answerVisible = attempt !== null
  const isRecording = phase === 'recording'
  const isTranscribing = phase === 'transcribing'
  const isBusy = phase === 'speaking' || isTranscribing || phase === 'saving'

  useEffect(() => {
    if (autoPlayedCardId.current === card.id) {
      return
    }

    autoPlayedCardId.current = card.id
    void onListen()
  }, [card.id, onListen])

  useEffect(() => {
    if (!attempt || replayedAttempt.current === attempt) {
      return
    }

    replayedAttempt.current = attempt
    void onListen()
  }, [attempt, onListen])

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
            <p className="mt-2 text-xs leading-5 text-slate-500">聞こえた音を、声に出すところまでが今日の練習です。</p>
          </div>
        ) : (
          <div className="mt-7" aria-live="polite">
            <p className="text-3xl font-bold tracking-tight text-slate-900">{card.text}</p>
            <p className="mx-auto mt-3 max-w-sm text-base leading-7 text-slate-600">{card.example || card.text}</p>
            <div className={`mx-auto mt-5 rounded-2xl px-4 py-3 ${attempt.unreliable ? 'bg-slate-100 text-slate-800' : attempt.matched ? 'bg-teal-50 text-teal-900' : 'bg-amber-50 text-amber-900'}`}>
              <p className="font-bold">
                {attempt.unreliable
                  ? '聞き取りが不安定でした。もう一度どうぞ'
                  : attempt.matched
                    ? 'その調子です'
                    : 'もう一度声に出してみましょう'}
              </p>
              {attempt.unreliable ? null : (
                <p className="mt-1 text-xs opacity-75">声の近さ {Math.round(attempt.similarity * 100)}%</p>
              )}
              <p className="mt-2 text-xs opacity-75">こう聞こえました：「{attempt.spokenText}」</p>
            </div>
          </div>
        )}
      </div>

      <div className="border-t border-slate-100 px-5 py-5">
        <div className={`grid gap-3 ${isFirstEncounter && !answerVisible ? 'grid-cols-1' : 'grid-cols-2'}`}>
          <button
            type="button"
            onClick={() => void onListen()}
            disabled={isRecording || isBusy}
            className="rounded-2xl border border-teal-200 bg-teal-50 px-3 py-3 text-sm font-bold text-teal-800 transition-colors hover:bg-teal-100 disabled:opacity-40"
          >
            🔊 聞く
          </button>
          {isFirstEncounter && !answerVisible ? null : (
            <button
              type="button"
              onClick={() => void onShowHint()}
              disabled={hintVisible || hintSaving || isRecording || isBusy}
              className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-bold text-slate-700 transition-colors hover:bg-slate-100 disabled:opacity-40"
            >
              {hintSaving ? '保存中…' : '🇯🇵 ヒント'}
            </button>
          )}
        </div>

        {hintVisible ? (
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
              onClick={() => void (isRecording ? onStopRecording() : onStartRecording())}
              disabled={isBusy}
              aria-pressed={isRecording}
              className={`mx-auto flex min-h-16 w-full items-center justify-center rounded-2xl px-5 text-base font-bold text-white shadow-sm transition-transform active:scale-[0.98] disabled:opacity-45 ${isRecording ? 'bg-amber-500' : 'bg-teal-700 hover:bg-teal-800'}`}
            >
              {isRecording ? '■ 録音を止める' : isTranscribing ? '声を言葉にしています…' : '🎤 言ってみる'}
            </button>
            <p className="mt-2 text-[11px] text-slate-500">
              {isRecording ? '聞いています。話し終えたらタップ' : `音声入力：${engineLabel(sttEngine)}`}
            </p>
          </div>
        ) : (
          <div className="mt-5">
            <button
              type="button"
              onClick={() => void onStartRecording()}
              disabled={isBusy}
              className="w-full rounded-2xl border border-teal-300 bg-white px-5 py-3 text-sm font-bold text-teal-800 disabled:opacity-40"
            >
              🔁 もう一度言う
            </button>

            <div className="mt-6 border-t border-slate-100 pt-5">
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
                  className={`relative rounded-2xl bg-teal-700 px-2 py-3 text-sm font-bold text-white disabled:opacity-40 ${attempt.matched ? 'ring-4 ring-teal-100' : ''}`}
                >
                  {attempt.matched ? <span className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-teal-100 px-2 py-0.5 text-[10px] text-teal-800">おすすめ</span> : null}
                  言えた
                </button>
              </div>
              {phase === 'saving' ? (
                <p className="mt-3 text-center text-xs font-bold text-teal-700" role="status">記録しています…</p>
              ) : null}
            </div>
          </div>
        )}
      </div>
    </article>
  )
}
