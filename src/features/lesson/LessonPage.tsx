import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLanguage } from '../../app/LanguageContext'
import { Toast } from '../../components/Toast'
import { unlockAudio } from '../../services/speech'
import { getSettings, setSettings, subscribe, type Settings } from '../../services/settings'
import type { LessonStage } from './types'
import { useLesson } from './useLesson'

const STAGE_LABELS: Record<LessonStage, string> = {
  0: 'はじめて',
  1: '5秒後',
  2: '25秒後',
  3: '2分後',
  4: '10分後',
}

function formatElapsed(milliseconds: number): string {
  const totalSeconds = Math.floor(milliseconds / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}分${String(seconds).padStart(2, '0')}秒`
}

export function LessonPage() {
  const { language } = useLanguage()
  const lesson = useLesson(language)
  const [settings, setSettingsState] = useState<Settings>(getSettings)
  const [pageError, setPageError] = useState<unknown>(null)

  useEffect(() => subscribe(setSettingsState), [])

  const itemCount = useMemo(
    () => new Set(lesson.steps.map((step) => step.item.id)).size,
    [lesson.steps],
  )
  const matchedCount = lesson.recallResults.filter(({ matched }) => matched).length
  const progress = lesson.steps.length === 0
    ? 0
    : Math.round((lesson.currentIndex / lesson.steps.length) * 100)

  const updateSettings = (partial: Partial<Settings>) => {
    try {
      setSettings(partial)
      setPageError(null)
    } catch (settingsError) {
      setPageError(settingsError)
    }
  }

  const startLesson = () => {
    try {
      unlockAudio()
      setPageError(null)
      lesson.start()
    } catch (startError) {
      setPageError(startError)
    }
  }

  const visibleError = pageError ?? lesson.error
  const clearError = () => {
    setPageError(null)
    lesson.clearError()
  }

  return (
    <section>
      <Toast error={visibleError} onClose={clearError} />

      <p className="text-sm font-bold text-indigo-700">AUDIO LESSON</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">音声レッスン</h1>

      {lesson.status === 'loading' ? (
        <p className="mt-8 rounded-2xl bg-white px-5 py-8 text-center text-sm font-bold text-slate-500" role="status">
          今日のレッスンを組み立てています…
        </p>
      ) : lesson.status === 'ready' ? (
        <div className="mt-7 space-y-5">
          <div className="rounded-3xl border border-indigo-200 bg-gradient-to-b from-indigo-50 to-white p-6 text-center shadow-sm">
            <p className="text-6xl" aria-hidden="true">🎧</p>
            <h2 className="mt-5 text-xl font-bold text-slate-900">
              今日のレッスン {itemCount} 項目・約 {lesson.estimatedMinutes} 分
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              問いを聞いたら、模範が流れる前に声に出してみましょう。
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <label htmlFor="lesson-pause" className="flex items-center justify-between gap-4 text-sm font-bold text-slate-800">
              <span>答える間の秒数</span>
              <output htmlFor="lesson-pause" className="tabular-nums text-indigo-700">
                {settings.lessonPauseSeconds}秒
              </output>
            </label>
            <input
              id="lesson-pause"
              type="range"
              min="2"
              max="8"
              step="1"
              value={settings.lessonPauseSeconds}
              onChange={(event) => updateSettings({ lessonPauseSeconds: Number(event.target.value) })}
              className="mt-4 w-full accent-indigo-700"
            />

            <label className="mt-6 flex cursor-pointer items-start gap-3 rounded-2xl bg-slate-50 p-4">
              <input
                type="checkbox"
                checked={settings.lessonRecording}
                onChange={(event) => updateSettings({ lessonRecording: event.target.checked })}
                className="mt-0.5 size-5 rounded accent-indigo-700"
              />
              <span>
                <span className="block text-sm font-bold text-slate-800">
                  聞いた後に自分の声を録音して確かめる
                </span>
                <span className="mt-1 block text-xs leading-5 text-slate-500">
                  終了時に、声に出せた回数だけをまとめます。
                </span>
              </span>
            </label>
          </div>

          <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
            iPhone では画面を消すと止まります。画面を点けたまま使ってください。
          </p>

          <button
            type="button"
            onClick={startLesson}
            disabled={lesson.steps.length === 0}
            className="w-full rounded-2xl bg-indigo-700 px-5 py-5 text-lg font-bold text-white shadow-[0_16px_36px_rgba(67,56,202,0.24)] disabled:opacity-45"
          >
            はじめる
          </button>
        </div>
      ) : lesson.status === 'running' && lesson.currentStep ? (
        <div className="mt-6">
          <div className="flex items-center justify-between gap-4 text-xs font-bold text-slate-500">
            <p>{lesson.currentIndex + 1}/{lesson.steps.length}</p>
            <p className="rounded-full bg-indigo-50 px-3 py-1 text-indigo-800">
              {STAGE_LABELS[lesson.currentStep.stage]}
            </p>
          </div>
          <div
            className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200"
            role="progressbar"
            aria-label="音声レッスンの進捗"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress}
          >
            <div className="h-full rounded-full bg-indigo-600" style={{ width: `${progress}%` }} />
          </div>

          <div className="mt-7 rounded-3xl border border-indigo-200 bg-white p-6 text-center shadow-sm">
            <p className="text-xs font-bold tracking-wider text-indigo-700">この場面で言ってみましょう</p>
            <h2 className="mt-4 text-2xl font-bold leading-10 text-slate-900">
              {lesson.currentStep.item.cueJa}
            </h2>
            <div className="mt-7 min-h-24 rounded-2xl bg-indigo-50 px-4 py-6">
              {lesson.currentAction === 'answer' ? (
                <p className="text-xl font-bold leading-8 text-indigo-950">
                  {lesson.currentStep.item.answer}
                </p>
              ) : (
                <p className="text-3xl font-bold tracking-[0.3em] text-indigo-300" aria-label="答えを待っています">…</p>
              )}
            </div>

            {lesson.currentAction === 'pause' ? (
              <div className="mt-5 rounded-2xl bg-amber-50 px-4 py-4 text-sm font-bold text-amber-900" role="status">
                {settings.lessonRecording ? (
                  <span className="inline-flex items-center gap-2"><span aria-hidden="true">🎤</span> 声を聞いています</span>
                ) : (
                  '声に出してみましょう'
                )}
              </div>
            ) : null}
          </div>

          <button
            type="button"
            onClick={lesson.paused ? lesson.resume : lesson.pause}
            className="mt-5 w-full rounded-2xl bg-indigo-700 px-5 py-4 text-base font-bold text-white"
          >
            {lesson.paused ? '▶ 再開' : 'Ⅱ 一時停止'}
          </button>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={lesson.skip}
              className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700"
            >
              スキップ
            </button>
            <button
              type="button"
              onClick={lesson.stop}
              className="rounded-2xl border border-slate-300 bg-slate-100 px-4 py-3 text-sm font-bold text-slate-800"
            >
              終了
            </button>
          </div>
        </div>
      ) : lesson.status === 'finished' ? (
        <div className="mt-8 rounded-3xl border border-indigo-200 bg-white p-6 text-center shadow-sm">
          <p className="text-5xl" aria-hidden="true">🎧</p>
          <h2 className="mt-4 text-xl font-bold text-slate-900">今日のレッスンを終えました</h2>
          <div className="mt-6 grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-2xl font-bold tabular-nums text-indigo-900">{itemCount}</p>
              <p className="mt-1 text-xs font-bold text-slate-500">項目</p>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-lg font-bold tabular-nums text-indigo-900">{formatElapsed(lesson.elapsedMs)}</p>
              <p className="mt-1 text-xs font-bold text-slate-500">経過時間</p>
            </div>
          </div>
          {settings.lessonRecording ? (
            <p className="mt-5 rounded-2xl bg-teal-50 px-4 py-3 font-bold text-teal-900">
              言えた {matchedCount}/{lesson.recallResults.length}
            </p>
          ) : null}
          <button
            type="button"
            onClick={startLesson}
            className="mt-6 w-full rounded-2xl bg-indigo-700 px-5 py-4 font-bold text-white"
          >
            もう一度
          </button>
          <Link
            to="/practice"
            className="mt-3 flex w-full items-center justify-center rounded-2xl border border-indigo-200 bg-white px-5 py-4 font-bold text-indigo-800"
          >
            練習へ戻る
          </Link>
        </div>
      ) : null}
    </section>
  )
}
