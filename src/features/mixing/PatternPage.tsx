import { Toast } from '../../components/Toast'
import { getSettings, type MixingLevel } from '../../services/settings'
import { speak } from '../../services/speech'
import { usePatternSession } from './usePatternSession'

const LEVELS: MixingLevel[] = [1, 2, 3]

function seconds(milliseconds: number | null): string {
  return milliseconds === null ? '—' : `${(milliseconds / 1000).toFixed(1)}秒`
}

export function PatternPage({ lang }: { lang: 'en' | 'ko' }) {
  const session = usePatternSession(lang)
  const { phase, currentItem, summary, checkMode } = session
  const selfCheck = checkMode === 'self'

  const say = (text: string) => {
    const settings = getSettings()
    void speak(text, { lang, rate: settings.ttsRate, voiceURI: settings.ttsVoice[lang] })
      .catch((error) => console.error('読み上げに失敗しました', error))
  }

  return (
    <div>
      <Toast error={session.error} onClose={session.clearError} />

      <div className="flex items-center justify-between gap-4">
        <p className="text-sm font-bold text-slate-500">
          {session.roundCount > 0 && phase !== 'idle' && phase !== 'loading'
            ? `${session.roundIndex + 1}周目 ・ ${session.itemIndex + 1}/${session.itemCount}`
            : '日本語を見て、すぐ声に出す練習です'}
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

      <div className="mt-3 flex items-center gap-2" role="group" aria-label="確かめ方">
        <button
          type="button"
          aria-pressed={selfCheck}
          onClick={() => session.setCheckMode('self')}
          className={`rounded-full px-3 py-1.5 text-xs font-bold transition-colors ${selfCheck ? 'bg-violet-700 text-white' : 'bg-white text-slate-600'}`}
        >
          👆 自分で判定
        </button>
        <button
          type="button"
          aria-pressed={!selfCheck}
          onClick={() => session.setCheckMode('record')}
          className={`rounded-full px-3 py-1.5 text-xs font-bold transition-colors ${!selfCheck ? 'bg-violet-700 text-white' : 'bg-white text-slate-600'}`}
        >
          🎙 録音で確かめる
        </button>
        <span className="text-[11px] text-slate-500">
          {selfCheck
            ? 'Gemini は使いません'
            : session.webSpeechAvailable ? 'ブラウザの音声認識' : 'この端末では Gemini を使います'}
        </span>
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
            型ごとに、意味と例文を先に見せます。そのあと日本語が出たら、すぐ声に出してください。
            {selfCheck
              ? ' 数秒後に答えが出るので、言えたかどうかを自分で押します。'
              : ' 言い終わったらボタンを押すと、聞き取った文を答えと照らします。'}
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

      {phase === 'intro' && currentItem ? (
        <div className="mt-7 rounded-3xl border border-violet-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-bold tracking-wider text-violet-700">これから使う型</p>
          <p className="mt-3 rounded-2xl bg-violet-50 px-4 py-3 text-center text-lg font-bold text-violet-950">
            {currentItem.frame.pattern}
          </p>
          <p className="mt-3 text-sm leading-6 text-slate-700">{currentItem.frame.note_ja}</p>

          <p className="mt-5 text-xs font-bold tracking-wider text-slate-500">例文</p>
          <div className="mt-2 space-y-2">
            {currentItem.frame.examples.map((example) => (
              <div key={example.text} className="flex items-start gap-3 rounded-2xl bg-slate-50 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-slate-900">{example.text}</p>
                  <p className="mt-1 text-sm text-slate-500">{example.ja}</p>
                </div>
                <button
                  type="button"
                  onClick={() => say(example.text)}
                  className="grid size-10 shrink-0 place-items-center rounded-full bg-white text-lg shadow-sm"
                  aria-label={`${example.text} を聞く`}
                >
                  🔊
                </button>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={session.beginItems}
            className="mt-6 w-full rounded-2xl bg-violet-700 px-5 py-4 font-bold text-white"
          >
            この型で練習する
          </button>
        </div>
      ) : null}

      {currentItem && (phase === 'starting' || phase === 'thinking' || phase === 'recording' || phase === 'checking' || phase === 'hint' || phase === 'model') ? (
        <div className="mt-7 rounded-3xl border border-violet-200 bg-gradient-to-b from-violet-50 to-white p-6 shadow-sm">
          <p className="text-center text-xs font-bold tracking-wider text-violet-700">こう伝えてください</p>
          <h2 className="mt-3 text-center text-2xl font-bold leading-9 text-slate-900">
            {currentItem.promptJa}
          </h2>
          <p className="mt-2 text-center text-xs text-slate-500">{currentItem.frame.pattern}</p>

          {phase === 'thinking' ? (
            <div className="mt-5 text-center">
              <p className="text-sm font-bold text-slate-600">声に出して言ってください</p>
              <p className="mt-2 text-4xl font-bold tabular-nums text-violet-800" aria-live="polite">
                あと {Math.max(0, session.secondsLeft)} 秒
              </p>
            </div>
          ) : null}

          {session.hint && phase === 'hint' ? (
            <p className="mt-5 rounded-2xl bg-sky-50 px-4 py-3 text-center font-bold text-sky-900">
              💡 {session.hint.textJa}
            </p>
          ) : null}

          {phase === 'model' ? (
            <div className="mt-5 space-y-3">
              {selfCheck ? (
                <p className="text-center text-sm font-bold text-slate-600">声に出せましたか?</p>
              ) : (
                <p className={`text-center text-sm font-bold ${session.matched ? 'text-teal-700' : 'text-slate-600'}`}>
                  {session.matched ? '言えました' : 'ひとつの言い方を見てみましょう'}
                </p>
              )}
              {!selfCheck && session.heardText ? (
                <div>
                  <p className="text-[11px] font-bold tracking-wider text-slate-500">こう聞こえました</p>
                  <p className="mt-1 rounded-2xl bg-white/70 px-4 py-3 font-bold text-slate-800">
                    {session.heardText}
                  </p>
                </div>
              ) : null}
              <div>
                <p className="text-[11px] font-bold tracking-wider text-slate-500">答え</p>
                <div className="mt-1 flex items-start gap-3 rounded-2xl bg-white px-4 py-3 shadow-sm">
                  <p className="min-w-0 flex-1 text-lg font-bold text-slate-900">{currentItem.answer}</p>
                  <button
                    type="button"
                    onClick={() => say(currentItem.answer)}
                    className="grid size-10 shrink-0 place-items-center rounded-full bg-violet-50 text-lg"
                    aria-label="答えを聞く"
                  >
                    🔊
                  </button>
                </div>
              </div>
              <details className="rounded-2xl bg-white/70 px-4 py-3">
                <summary className="cursor-pointer text-xs font-bold text-slate-600">この型をもう一度見る</summary>
                <p className="mt-2 text-sm leading-6 text-slate-700">{currentItem.frame.note_ja}</p>
                <div className="mt-2 space-y-1">
                  {currentItem.frame.examples.map((example) => (
                    <p key={example.text} className="text-sm text-slate-600">
                      {example.text}
                      <span className="ml-2 text-xs text-slate-400">{example.ja}</span>
                    </p>
                  ))}
                </div>
              </details>
            </div>
          ) : null}
        </div>
      ) : null}

      {phase === 'starting' ? (
        <p className="mt-5 text-center text-sm font-bold text-slate-500" role="status">
          録音の準備をしています…
        </p>
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

      {phase === 'model' && selfCheck ? (
        <div className="mt-5 grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => void session.judgeSelf(true)}
            className="rounded-2xl bg-teal-600 px-4 py-4 font-bold text-white"
          >
            言えた
          </button>
          <button
            type="button"
            onClick={() => void session.judgeSelf(false)}
            className="rounded-2xl border border-slate-300 bg-white px-4 py-4 font-bold text-slate-700"
          >
            言えなかった
          </button>
        </div>
      ) : null}

      {phase === 'model' && !selfCheck ? (
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
              <p className="mt-1 text-xs font-bold text-slate-500">{selfCheck ? '言えた' : '一度で言えた'}</p>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-lg font-bold tabular-nums text-violet-900">
                {selfCheck ? '—' : summary.roundLatencyMs.map((latency) => seconds(latency)).join(' → ')}
              </p>
              <p className="mt-1 text-xs font-bold text-slate-500">
                {selfCheck ? '応答時間は録音のときだけ' : '言い出すまでの平均'}
              </p>
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
