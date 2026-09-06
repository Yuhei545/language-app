import { Link } from 'react-router-dom'
import { useLanguage } from '../../app/LanguageContext'
import { Toast } from '../../components/Toast'
import type { DiffToken } from './diff'
import { PLAY_RATES, useDictationSession } from './useDictationSession'

function Token({ token, onPlay }: { token: DiffToken; onPlay: (text: string) => void }) {
  if (token.kind === 'match') {
    return <span className="leading-10 text-slate-900">{token.text}</span>
  }

  const style = token.kind === 'missing'
    ? 'bg-amber-100 text-amber-950'
    : 'bg-slate-100 text-slate-600'
  const label = token.kind === 'missing' ? '抜け' : '余分'

  // 抜けた語はタップでそこだけ聞き直せる
  if (token.kind === 'missing') {
    return (
      <button
        type="button"
        onClick={() => onPlay(token.text)}
        aria-label={`${token.text} だけ聞く`}
        className={`inline-flex items-baseline gap-1 rounded-lg px-2 py-0.5 leading-8 ${style}`}
      >
        <span>{token.text}</span>
        <span className="text-[9px] font-bold">🔊 {label}</span>
      </button>
    )
  }

  return (
    <span className={`inline-flex items-baseline gap-1 rounded-lg px-2 py-0.5 leading-8 ${style}`}>
      <span>{token.text}</span>
      <span className="text-[9px] font-bold">{label}</span>
    </span>
  )
}

export function DictationPage() {
  const { language } = useLanguage()
  const session = useDictationSession(language)
  const displayNumber = session.status === 'finished'
    ? session.totalSentences
    : Math.min(session.currentIndex + 1, session.totalSentences)
  const progress = session.totalSentences === 0
    ? 0
    : Math.round((displayNumber / session.totalSentences) * 100)
  const cloze = session.cloze

  return (
    <section>
      <Toast error={session.error} onClose={session.clearError} />

      <p className="text-sm font-bold text-sky-700">LISTEN &amp; WRITE</p>
      <div className="mt-2 flex items-end justify-between gap-3">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">
          聞いて書く {displayNumber}/{session.totalSentences || 5}
        </h1>
        {session.status !== 'loading' && session.status !== 'finished' ? (
          <span className={`rounded-full px-3 py-1 text-xs font-bold ${session.stage === 'cloze' ? 'bg-sky-100 text-sky-800' : 'bg-teal-100 text-teal-800'}`}>
            {session.stage === 'cloze' ? '穴埋め' : '全文'}
          </span>
        ) : null}
      </div>
      <div
        className="mt-4 h-2 overflow-hidden rounded-full bg-slate-200"
        role="progressbar"
        aria-label="ディクテーションの進捗"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress}
      >
        <div className="h-full rounded-full bg-sky-600" style={{ width: `${progress}%` }} />
      </div>

      {session.status === 'loading' ? (
        <p className="mt-8 rounded-2xl bg-white px-5 py-8 text-center text-sm font-bold text-slate-500" role="status">
          今日の文を選んでいます…
        </p>
      ) : session.status === 'finished' ? (
        <div className="mt-8 rounded-3xl border border-sky-200 bg-white p-6 text-center shadow-sm">
          <p className="text-5xl" aria-hidden="true">🎧</p>
          <h2 className="mt-4 text-xl font-bold text-slate-900">今日の5文が終わりました</h2>
          <p className="mt-3 text-3xl font-bold tabular-nums text-sky-800">
            {Math.round(session.averageRatio * 100)}%
          </p>
          <p className="mt-1 text-sm text-slate-500">今日の平均</p>

          {session.weakFeatures.length > 0 ? (
            <div className="mt-6 text-left">
              <h3 className="text-sm font-bold text-slate-900">苦手な音</h3>
              <div className="mt-3 space-y-2">
                {session.weakFeatures.map((feature) => (
                  <div key={feature.id} className="rounded-2xl bg-slate-50 px-4 py-3">
                    <p className="flex items-baseline justify-between gap-2">
                      <span className="font-bold text-slate-900">{feature.name_ja}</span>
                      <span className="text-sm font-bold tabular-nums text-slate-500">
                        {Math.round(feature.accuracy * 100)}%
                      </span>
                    </p>
                    <p className="mt-1 text-sm leading-6 text-slate-600">{feature.note_ja}</p>
                    <p className="mt-1 text-xs text-slate-500">{feature.example}</p>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-xs text-slate-500">この音を含む文が、次から先に出ます。</p>
            </div>
          ) : null}

          <p className="mt-5 text-sm font-bold text-slate-700">忘れかけた頃に、同じ文がまた出ます</p>
          <Link
            to="/practice"
            className="mt-6 inline-flex rounded-2xl border border-sky-200 px-5 py-3 font-bold text-sky-800"
          >
            練習メニューへ
          </Link>
        </div>
      ) : session.currentSentence ? (
        <>
          {session.status === 'listening' ? (
            <div className="mt-8 rounded-3xl border border-sky-200 bg-gradient-to-b from-sky-50 to-white p-6 text-center shadow-sm">
              <p className="text-6xl" aria-hidden="true">🎧</p>
              <p className="mt-5 text-sm leading-6 text-slate-500">
                {session.stage === 'cloze'
                  ? '自然な速さを聞いて、聞き取りにくい部分を埋めます。'
                  : '自然な速さを聞いて、全文を書き取ります。'}
              </p>
              <button
                type="button"
                onClick={() => void session.play(1)}
                disabled={session.playsRemaining === 0 || session.isSpeaking}
                className="mt-6 w-full rounded-2xl bg-sky-700 px-5 py-4 font-bold text-white disabled:opacity-45"
              >
                {session.isSpeaking ? '再生しています…' : `🔊 聞く（あと ${session.playsRemaining} 回）`}
              </button>
              <button
                type="button"
                onClick={session.beginTyping}
                className="mt-3 w-full rounded-2xl border border-sky-200 bg-white px-5 py-4 font-bold text-sky-900"
              >
                聞こえた通りに書く
              </button>
            </div>
          ) : null}

          {session.status === 'typing' ? (
            <div className="mt-8 rounded-3xl border border-sky-200 bg-white p-5 shadow-sm">
              {cloze ? (
                <>
                  <p className="text-sm font-bold text-slate-800">聞こえた音を、空欄に入れてください</p>
                  <div className="mt-4 flex flex-wrap items-center gap-x-1 gap-y-3 text-lg leading-10">
                    {cloze.segments.map((segment, index) => (
                      <span key={`segment-${index}`} className="contents">
                        <span className="text-slate-900">{segment}</span>
                        {index < cloze.blanks.length ? (
                          <input
                            type="text"
                            aria-label={`空欄 ${index + 1}`}
                            value={session.blankInputs[index] ?? ''}
                            onChange={(event) => session.setBlankInput(index, event.target.value)}
                            autoCapitalize="off"
                            autoCorrect="off"
                            className="min-w-24 rounded-lg border-b-2 border-sky-400 bg-sky-50 px-2 py-1 text-center outline-none focus:bg-white"
                          />
                        ) : null}
                      </span>
                    ))}
                  </div>
                </>
              ) : (
                <>
                  <label htmlFor="dictation-answer" className="text-sm font-bold text-slate-800">
                    聞こえた通りに入力してください
                  </label>
                  <textarea
                    id="dictation-answer"
                    value={session.typedText}
                    onChange={(event) => session.setTypedText(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
                        event.preventDefault()
                      }
                    }}
                    rows={4}
                    autoCapitalize="sentences"
                    className="mt-3 w-full resize-none rounded-2xl border border-slate-300 px-4 py-3 text-base leading-7 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                  />
                </>
              )}

              <button
                type="button"
                onClick={() => void session.play(1)}
                disabled={session.playsRemaining === 0 || session.isSpeaking}
                className="mt-4 w-full rounded-2xl border border-sky-200 bg-sky-50 px-3 py-3 text-sm font-bold text-sky-900 disabled:opacity-45"
              >
                🔊 もう一度（あと {session.playsRemaining} 回）
              </button>

              <button
                type="button"
                onClick={() => void session.submit(session.typedText)}
                disabled={session.isSubmitting}
                className="mt-4 w-full rounded-2xl bg-slate-900 px-5 py-4 font-bold text-white disabled:opacity-45"
              >
                {session.isSubmitting ? '保存しています…' : '答え合わせ'}
              </button>
            </div>
          ) : null}

          {session.status === 'result' && session.result ? (
            <div className="mt-8 space-y-5">
              <div className="rounded-3xl border border-sky-200 bg-white p-5 shadow-sm">
                <p className="text-xs font-bold tracking-wider text-sky-700">聞こえた音と文字</p>
                <div className="mt-4 flex flex-wrap items-baseline gap-x-2 gap-y-2 text-lg font-bold">
                  {session.result.tokens.map((token, index) => (
                    <Token
                      key={`${token.kind}-${index}-${token.text}`}
                      token={token}
                      onPlay={(text) => void session.play(0.85, text)}
                    />
                  ))}
                </div>
                <p className="mt-2 text-xs text-slate-500">抜けた語はタップすると、そこだけゆっくり聞けます。</p>
                <p className="mt-4 text-xl font-bold text-sky-900">
                  {Math.round(session.result.ratio * 100)}% 聞き取れました
                </p>
              </div>

              {session.featureNotes.length > 0 ? (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                  <h2 className="font-bold text-slate-900">この文の音</h2>
                  <div className="mt-3 space-y-3">
                    {session.featureNotes.map((feature) => (
                      <div key={feature.id}>
                        <p className="flex items-center gap-2 font-bold text-slate-900">
                          <span aria-hidden="true">{feature.correct ? '✅' : '⚠️'}</span>
                          {feature.name_ja}
                        </p>
                        <p className="mt-1 text-sm leading-6 text-slate-600">{feature.note_ja}</p>
                        <p className="mt-1 text-xs text-slate-500">{feature.example}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="rounded-2xl border border-slate-200 bg-white p-5">
                <p className="text-xs font-bold tracking-wider text-slate-500">速さを変えて聞く</p>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {PLAY_RATES.map((rate) => (
                    <button
                      key={rate}
                      type="button"
                      onClick={() => void session.play(rate)}
                      disabled={session.isSpeaking}
                      className="rounded-2xl border border-sky-200 bg-sky-50 px-2 py-3 text-sm font-bold text-sky-900 disabled:opacity-45"
                    >
                      {rate === 1 ? '自然' : `${rate}×`}
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="button"
                onClick={session.next}
                disabled={session.isSpeaking}
                className="w-full rounded-2xl bg-sky-700 px-5 py-4 font-bold text-white disabled:opacity-45"
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
