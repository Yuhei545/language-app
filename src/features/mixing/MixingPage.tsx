import { useState } from 'react'
import { useLanguage } from '../../app/LanguageContext'
import { Toast } from '../../components/Toast'
import type { MixingLevel } from '../../services/settings'
import { useMixingSession, type MixingFeedback } from './useMixingSession'

const LEVELS: MixingLevel[] = [1, 2, 3]

function engineLabel(engine: 'webspeech' | 'gemini' | null): string {
  if (engine === 'webspeech') {
    return 'Web Speech'
  }
  if (engine === 'gemini') {
    return 'Gemini'
  }
  return '開始後に表示'
}

/** 結果の見出し。文法の採点はせず、「通じたか」と「模範と同じ言い方だったか」だけを伝える。 */
function verdictLabel(feedback: MixingFeedback): string {
  if (!feedback.understood) {
    return '伝わりませんでした。模範を聞いて、もう一度'
  }
  if (feedback.match?.matched) {
    return '通じました。模範と同じ言い方です'
  }
  return '通じました。模範とは違う言い方でしたが、意味は届いています'
}

function seconds(milliseconds: number): string {
  return (milliseconds / 1000).toFixed(1)
}

export function MixingPage() {
  const { language } = useLanguage()
  const session = useMixingSession(language)
  const [showJapanese, setShowJapanese] = useState(false)

  const goNext = () => {
    setShowJapanese(false)
    session.next()
  }

  const retry = () => {
    setShowJapanese(false)
    void session.startRecording()
  }

  return (
    <section>
      <Toast error={session.error} onClose={session.clearError} />

      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-bold text-violet-700">MIX &amp; SPEAK</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">文をつくる</h1>
        </div>
        <div className="flex rounded-full bg-slate-100 p-1" aria-label="ミキシングのレベル">
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

      <p className="mt-3 text-sm font-bold text-slate-500">
        この {session.totalWords} 語で {session.totalCombinations} 通り
      </p>

      {session.loading ? (
        <p className="mt-8 rounded-2xl bg-white px-5 py-8 text-center text-sm font-bold text-slate-500" role="status">
          組み合わせを準備しています…
        </p>
      ) : session.status === 'idle' ? (
        <div className="mt-7 rounded-3xl border border-violet-200 bg-white p-6 text-center shadow-sm">
          <p className="text-6xl" aria-hidden="true">🧩</p>
          <h2 className="mt-5 text-xl font-bold text-slate-900">知っている言葉で伝えてみる</h2>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            文法を気にせず、並んだ言葉を使って意味を声で届けます。
          </p>
          <button
            type="button"
            onClick={goNext}
            disabled={session.totalCombinations === 0}
            className="mt-6 w-full rounded-2xl bg-violet-700 px-5 py-4 font-bold text-white disabled:opacity-45"
          >
            組み合わせを始める
          </button>
        </div>
      ) : session.currentDeal ? (
        <>
          <div className="mt-7 rounded-3xl border border-violet-200 bg-gradient-to-b from-violet-50 to-white p-5 shadow-sm">
            <p className="text-center text-xs font-bold tracking-wider text-violet-700">伝えたい意味</p>
            <h2 className="mt-3 text-center text-2xl font-bold leading-9 text-slate-900">
              {session.intendedMeaning}
            </h2>

            <div className="mt-6 flex gap-3 overflow-x-auto pb-1">
              {session.currentDeal.words.map((word, index) => (
                <div
                  key={`${session.currentDeal?.key}-${index}`}
                  className="min-w-28 flex-1 rounded-2xl border border-slate-200 bg-white px-3 py-4 text-center"
                >
                  <p className="text-3xl" aria-hidden="true">{word.emoji}</p>
                  <p className="mt-2 font-bold text-slate-900">{word.text}</p>
                  <p className="mt-1 text-[11px] text-slate-500">{word.hint_ja}</p>
                </div>
              ))}
            </div>
          </div>

          {(session.status === 'dealt'
            || session.status === 'recording'
            || session.status === 'checking') ? (
              <div className="mt-5 text-center">
                <button
                  type="button"
                  onClick={() => void (
                    session.status === 'recording'
                      ? session.stopRecording()
                      : session.startRecording()
                  )}
                  disabled={session.status === 'checking' || session.isSpeaking}
                  aria-pressed={session.status === 'recording'}
                  className={`flex min-h-16 w-full items-center justify-center rounded-2xl px-5 text-base font-bold text-white shadow-sm disabled:opacity-45 ${session.status === 'recording' ? 'bg-amber-500' : 'bg-violet-700'}`}
                >
                  {session.status === 'recording'
                    ? '■ 録音を止める'
                    : session.status === 'checking'
                      ? '意味が通じたか確かめています…'
                      : '🎤 声で伝える'}
                </button>
                {session.status === 'checking' ? (
                  <button
                    type="button"
                    onClick={session.cancelChecking}
                    className="mt-3 text-xs font-bold text-slate-600 underline decoration-slate-300 underline-offset-4"
                  >
                    やめる
                  </button>
                ) : null}
                <p className="mt-2 text-[11px] text-slate-500">
                  {session.status === 'recording'
                    ? '聞いています。話し終えたらタップ'
                    : `音声入力：${engineLabel(session.sttEngine)}`}
                </p>
              </div>
            ) : null}

          {session.status === 'feedback' && session.feedback ? (
            <div className="mt-5 space-y-4">
              <div className={`rounded-3xl border p-5 ${session.feedback.understood ? 'border-teal-200 bg-teal-50' : 'border-sky-200 bg-sky-50'}`}>
                <p className={`text-sm font-bold ${session.feedback.understood ? 'text-teal-800' : 'text-sky-800'}`}>
                  {verdictLabel(session.feedback)}
                </p>

                <p className="mt-4 text-[11px] font-bold tracking-wider text-slate-500">こう聞こえました</p>
                <p className="mt-1 rounded-2xl bg-white/70 px-4 py-3 text-base font-bold leading-7 text-slate-800">
                  {session.feedback.learnerText}
                </p>

                {session.feedback.modelText ? (
                  <>
                    <p className="mt-4 text-[11px] font-bold tracking-wider text-slate-500">ひとつの言い方(模範)</p>
                    <div className="mt-1 flex items-start gap-3 rounded-2xl bg-white p-4 shadow-sm">
                      <p className="min-w-0 flex-1 text-lg font-bold leading-8 text-slate-900">
                        {session.feedback.modelText}
                      </p>
                      <button
                        type="button"
                        onClick={() => void session.hearOneWay()}
                        disabled={session.isSpeaking || session.isStartingFluency}
                        className="grid size-10 shrink-0 place-items-center rounded-full bg-violet-50 text-lg disabled:opacity-45"
                        aria-label="模範を聞く"
                      >
                        🔊
                      </button>
                    </div>
                  </>
                ) : null}

                <p className="mt-4 text-[11px] font-bold tracking-wider text-slate-500">
                  {session.feedback.understood ? '相手はこう受け取りました' : '相手の聞き返し'}
                </p>
                <div className="mt-1 flex items-start gap-3 rounded-2xl bg-white p-4 shadow-sm">
                  <p className="min-w-0 flex-1 text-base font-bold leading-7 text-slate-900">
                    {session.feedback.recast}
                  </p>
                  <button
                    type="button"
                    onClick={() => void session.hearRecast()}
                    disabled={session.isSpeaking || session.isStartingFluency}
                    className="grid size-10 shrink-0 place-items-center rounded-full bg-teal-50 text-lg disabled:opacity-45"
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
                  <p className="mt-2 rounded-xl bg-white/70 px-3 py-2 text-sm text-slate-700">
                    {session.feedback.ja}
                  </p>
                ) : null}
              </div>

              {session.feedback.understood ? (
                <button
                  type="button"
                  onClick={() => void session.startFluency()}
                  disabled={session.isSpeaking || session.isStartingFluency}
                  className="w-full rounded-2xl bg-violet-700 px-5 py-4 font-bold text-white disabled:opacity-45"
                >
                  {session.isStartingFluency
                    ? '録音を準備しています…'
                    : 'もう一度、止まらずに言ってみる'}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={retry}
                  disabled={session.isSpeaking}
                  className="w-full rounded-2xl bg-violet-700 px-5 py-4 font-bold text-white disabled:opacity-45"
                >
                  もう一度言う
                </button>
              )}

              <button
                type="button"
                onClick={goNext}
                disabled={session.isSpeaking || session.isStartingFluency}
                className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm font-bold text-slate-700 disabled:opacity-45"
              >
                次へ
              </button>
              <p className="text-center text-[11px] text-slate-500">
                音声入力：{engineLabel(session.sttEngine)}
              </p>
            </div>
          ) : null}

          {session.status === 'fluency-recording' ? (
            <div className="mt-5 text-center">
              <p className="mb-3 text-sm font-bold text-violet-800">止まらずに、もう一度伝えてみましょう</p>
              <button
                type="button"
                onClick={session.stopFluency}
                className="flex min-h-16 w-full items-center justify-center rounded-2xl bg-amber-500 px-5 text-base font-bold text-white"
              >
                ■ 録音を止める
              </button>
            </div>
          ) : null}

          {session.status === 'fluency-done' && session.fluency ? (
            <div className="mt-5 rounded-3xl border border-violet-200 bg-white p-5 text-center shadow-sm">
              <p className="text-xs font-bold tracking-wider text-violet-700">止まらずに言えた時間</p>
              <p className="mt-3 text-2xl font-bold tabular-nums text-slate-900">
                {seconds(session.fluency.previousDurationMs)}秒 → {seconds(session.fluency.currentDurationMs)}秒
              </p>
              <p className="mt-3 text-sm font-bold text-violet-900">
                {session.fluency.faster
                  ? '速くなりました'
                  : '同じくらいです。もう一度でも次でも'}
              </p>
              <button
                type="button"
                onClick={goNext}
                className="mt-5 w-full rounded-2xl bg-violet-700 px-5 py-3 font-bold text-white"
              >
                次へ
              </button>
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  )
}
