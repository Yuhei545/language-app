import { useEffect, useRef, useState } from 'react'
import { useLanguage } from '../../app/LanguageContext'
import { Toast } from '../../components/Toast'
import type { MessageRow } from '../../services/supabase/types'
import { RecastReview } from './RecastReview'
import { useTalkSession, type TalkPhase } from './useTalkSession'

const phaseLabels: Record<TalkPhase, string> = {
  ready: '話したくなったら、マイクをタップ',
  starting: '会話を準備しています…',
  recording: '聞いています。自分のペースでどうぞ',
  transcribing: '声を言葉にしています…',
  thinking: 'ペアレントが受け取っています…',
  speaking: 'ペアレントが話しています…',
  ending: '会話をまとめています…',
  'shadow-speaking': 'まずペアレントの声を聞いてください…',
  'shadow-recording': 'まねした声を聞いています…',
  'shadow-transcribing': '声の近さを確かめています…',
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

function ParentBubble({
  message,
  parentName,
  phase,
  shadowingMessageId,
  onSpeak,
  onToggleShadow,
}: {
  message: MessageRow
  parentName: string
  phase: TalkPhase
  shadowingMessageId: string | null
  onSpeak: (text: string, rate?: number) => Promise<void>
  onToggleShadow: (message: MessageRow) => Promise<void>
}) {
  const [showSimpler, setShowSimpler] = useState(false)
  const [japaneseCount, setJapaneseCount] = useState(0)
  const isShadowingThis = shadowingMessageId === message.id
  const canStartAction = phase === 'ready'
  const canStopShadow = isShadowingThis && phase === 'shadow-recording'

  const showAndPlaySimpler = () => {
    setShowSimpler(true)
    void onSpeak(message.simpler || message.text)
  }

  return (
    <article className="mr-8 self-start">
      <p className="mb-1 ml-2 text-[11px] font-bold text-teal-700">{parentName}</p>
      <div className="rounded-[1.4rem] rounded-tl-md border border-teal-900/10 bg-white px-4 py-3 shadow-sm">
        <p className="leading-7 text-slate-800">{message.text}</p>

        {showSimpler ? (
          <div className="mt-3 rounded-xl bg-teal-50 px-3 py-2">
            <p className="text-[11px] font-bold text-teal-700">やさしい言い方</p>
            <p className="mt-1 text-sm leading-6 text-slate-700">{message.simpler || message.text}</p>
          </div>
        ) : null}

        {japaneseCount > 0 ? (
          <div className="mt-3 rounded-xl bg-sky-50 px-3 py-2">
            <p className="text-[11px] font-bold text-sky-700">日本語</p>
            <p className="mt-1 text-sm leading-6 text-slate-700">{message.ja}</p>
          </div>
        ) : null}

        {message.shadow_score !== null ? (
          <div className="mt-3 rounded-xl bg-amber-50 px-3 py-2">
            <p className="text-sm font-bold text-amber-900">声の近さ {message.shadow_score}%</p>
            <p className="mt-1 text-xs leading-5 text-amber-800">いい調子です。声に出した一歩が、話す力になっています。</p>
          </div>
        ) : null}

        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => void onSpeak(message.text, 0.7)}
            disabled={!canStartAction}
            className="rounded-xl bg-slate-100 px-2 py-2 text-xs font-bold text-slate-700 disabled:opacity-45"
          >
            🐢 ゆっくり
          </button>
          <button
            type="button"
            onClick={showAndPlaySimpler}
            disabled={!canStartAction}
            className="rounded-xl bg-slate-100 px-2 py-2 text-xs font-bold text-slate-700 disabled:opacity-45"
          >
            💬 やさしく
          </button>
          <button
            type="button"
            onClick={() => setJapaneseCount((count) => count + 1)}
            className="rounded-xl bg-slate-100 px-2 py-2 text-xs font-bold text-slate-700"
          >
            🇯🇵 日本語 {japaneseCount > 0 ? `(${japaneseCount})` : ''}
          </button>
          <button
            type="button"
            onClick={() => void onToggleShadow(message)}
            disabled={!canStartAction && !canStopShadow}
            className={`rounded-xl px-2 py-2 text-xs font-bold disabled:opacity-45 ${canStopShadow ? 'bg-amber-500 text-white' : 'bg-teal-100 text-teal-800'}`}
          >
            {canStopShadow ? '⏹ 録音を止める' : '🎤 真似る'}
          </button>
        </div>
      </div>
    </article>
  )
}

export function TalkPage() {
  const { language } = useLanguage()
  const session = useTalkSession(language)
  const messagesEnd = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (session.messages.length === 0) {
      return
    }

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    messagesEnd.current?.scrollIntoView({
      behavior: reducedMotion ? 'auto' : 'smooth',
      block: 'end',
    })
  }, [session.messages.length])

  if (session.status === 'idle') {
    return (
      <section>
        <Toast error={session.error} onClose={session.clearError} />
        <p className="text-sm font-bold text-teal-700">LANGUAGE PARENT</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">今日は何を話す？</h1>
        <p className="mt-3 leading-7 text-slate-600">うまく言えなくても大丈夫。ペアレントが意図を受け取り、会話をつないでくれます。</p>

        <div className="mt-7 space-y-3">
          {session.loadingScenarios ? (
            <p className="rounded-2xl bg-white px-4 py-5 text-center text-sm font-bold text-slate-500" role="status">
              話す場面を準備しています…
            </p>
          ) : session.scenarios.map((scenario) => (
            <article key={scenario.id} className="rounded-2xl border border-teal-900/10 bg-white p-4 shadow-sm">
              {scenario.prepEventId ? (
                <p className="mb-2 text-[11px] font-bold tracking-wider text-amber-700">UPCOMING</p>
              ) : null}
              <div className="flex items-center gap-4">
                <div className="min-w-0 flex-1">
                  <h2 className="font-bold text-slate-800">{scenario.labelJa}</h2>
                  <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{scenario.prompt}</p>
                </div>
                <button
                  type="button"
                  onClick={() => void session.startSession(scenario)}
                  disabled={session.phase !== 'ready'}
                  className="shrink-0 rounded-full bg-teal-700 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-teal-800 disabled:bg-slate-400"
                >
                  話す
                </button>
              </div>
            </article>
          ))}
        </div>

        {session.phase === 'starting' ? (
          <p className="mt-4 text-center text-sm font-bold text-teal-700" role="status">{phaseLabels.starting}</p>
        ) : null}
      </section>
    )
  }

  if (session.status === 'ended') {
    return (
      <section>
        <Toast error={session.error} onClose={session.clearError} />
        <p className="text-sm font-bold text-teal-700">NICE TALKING</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">今日の会話</h1>
        <p className="mt-3 text-sm leading-6 text-slate-500">{session.turnCount}往復、ことばを交わしました。</p>

        <section className="mt-8">
          <h2 className="text-xl font-bold text-slate-900">リキャスト振り返り</h2>
          <p className="mt-2 text-sm leading-6 text-slate-500">伝えたかったことと、自然に返ってきた言い方を並べてみましょう。</p>
          <div className="mt-4">
            <RecastReview messages={session.messages} />
          </div>
        </section>

        <section className="mt-9">
          <h2 className="text-xl font-bold text-slate-900">今日出てきた新しい言葉</h2>
          <p className="mt-2 text-sm leading-6 text-slate-500">残したい言葉をタップすると、カードに加わります。</p>
          {session.newWords.length > 0 ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {session.newWords.map((word) => {
                const saved = session.savedWords.includes(word)
                return (
                  <button
                    key={word}
                    type="button"
                    onClick={() => void session.saveNewWord(word)}
                    disabled={saved}
                    className={`rounded-full border px-4 py-2 text-sm font-bold ${saved ? 'border-teal-200 bg-teal-50 text-teal-700' : 'border-slate-300 bg-white text-slate-700'}`}
                  >
                    {saved ? '✓ 保存済み' : '＋'} {word}
                  </button>
                )
              })}
            </div>
          ) : (
            <p className="mt-4 rounded-2xl bg-white px-4 py-5 text-sm leading-6 text-slate-500">今日は新しい言葉を増やさず、会話そのものを楽しみました。</p>
          )}
        </section>

        <button
          type="button"
          onClick={session.resetSession}
          className="mt-10 w-full rounded-2xl bg-teal-700 px-5 py-4 font-bold text-white hover:bg-teal-800"
        >
          もう一度話す
        </button>
      </section>
    )
  }

  const isRecording = session.phase === 'recording'
  const recordingDisabled = session.phase !== 'ready' && !isRecording

  return (
    <section className="-mx-1 flex min-h-[calc(100dvh-10rem)] flex-col">
      <Toast error={session.error} onClose={session.clearError} />
      <div className="flex items-start justify-between gap-3 border-b border-teal-900/10 pb-4">
        <div className="min-w-0">
          <p className="text-[11px] font-bold tracking-wider text-teal-700">TALKING WITH {session.parentName.toUpperCase()}</p>
          <h1 className="mt-1 truncate text-xl font-bold text-slate-900">{session.selectedScenario?.labelJa}</h1>
          <p className="mt-1 text-[11px] text-slate-500">音声入力：{engineLabel(session.sttEngine)}</p>
        </div>
        <button
          type="button"
          onClick={() => void session.endCurrentSession()}
          disabled={session.phase !== 'ready'}
          className="shrink-0 rounded-full border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-600 disabled:opacity-40"
        >
          会話を終える
        </button>
      </div>

      <div className="flex flex-1 flex-col gap-4 py-5" aria-live="polite">
        {session.messages.length === 0 ? (
          <div className="my-auto rounded-3xl bg-teal-50 px-5 py-8 text-center">
            <p className="text-3xl" aria-hidden="true">☕</p>
            <p className="mt-3 font-bold text-teal-900">最初のひとことをどうぞ</p>
            <p className="mt-2 text-sm leading-6 text-teal-800/70">短くても、途中でも大丈夫です。</p>
          </div>
        ) : session.messages.map((message) => (
          message.role === 'user' ? (
            <article key={message.id} className="ml-8 self-end rounded-[1.4rem] rounded-tr-md bg-teal-700 px-4 py-3 text-white shadow-sm">
              <p className="leading-7">{message.text}</p>
            </article>
          ) : (
            <ParentBubble
              key={message.id}
              message={message}
              parentName={session.parentName}
              phase={session.phase}
              shadowingMessageId={session.shadowingMessageId}
              onSpeak={session.playText}
              onToggleShadow={session.toggleShadowing}
            />
          )
        ))}
        <div ref={messagesEnd} />
      </div>

      <div className="sticky bottom-20 z-10 -mx-4 rounded-t-3xl border border-b-0 border-teal-900/10 bg-[#f8fbfa]/95 px-4 pb-3 pt-4 text-center backdrop-blur">
        <p className="min-h-5 text-xs font-bold text-slate-600" role="status">{phaseLabels[session.phase]}</p>
        <button
          type="button"
          onClick={() => void (isRecording ? session.stopRecording() : session.startRecording())}
          disabled={recordingDisabled}
          aria-pressed={isRecording}
          aria-label={isRecording ? '録音を停止する' : '録音を開始する'}
          className={`mt-3 grid size-20 place-items-center rounded-full border-[6px] shadow-lg transition-transform active:scale-95 disabled:opacity-40 ${isRecording ? 'border-amber-200 bg-amber-500 text-white' : 'border-teal-100 bg-teal-700 text-white'}`}
        >
          <span className="text-3xl" aria-hidden="true">{isRecording ? '■' : '●'}</span>
        </button>
        <p className="mt-2 text-[11px] text-slate-500">{isRecording ? 'タップして止める' : 'タップして話す'}</p>
      </div>
    </section>
  )
}
