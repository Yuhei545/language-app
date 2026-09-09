import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useLanguage } from '../../app/LanguageContext'
import { Toast } from '../../components/Toast'
import { unlockAudio } from '../../services/speech'
import { getSettings, setSettings, subscribe, type Settings } from '../../services/settings'
import type { LessonDialogueRow } from '../../services/supabase/types'
import { SELF_REPORT_LABELS, type CurriculumStatus, type SelfReport } from './curriculum'
import type { DialogueLessonStep } from './dialoguePlan'
import type { LessonHistoryRouteState } from './LessonHistoryPage'
import { ScenePicker } from './ScenePicker'
import type { LessonStage } from './types'
import { useLesson } from './useLesson'

const STAGE_LABELS: Record<LessonStage, string> = {
  0: 'はじめて',
  1: '5秒後',
  2: '25秒後',
  3: '2分後',
  4: '10分後',
}

const SELF_REPORT_ORDER: SelfReport[] = ['all', 'most', 'half', 'few']

function formatElapsed(milliseconds: number): string {
  const totalSeconds = Math.floor(milliseconds / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}分${String(seconds).padStart(2, '0')}秒`
}

function isDialogueStep(step: unknown): step is DialogueLessonStep {
  return typeof step === 'object' && step !== null && 'actions' in step
}

function dialogueCue(
  step: DialogueLessonStep,
  dialogue: ReturnType<typeof useLesson>['dialogue'],
  steps: ReturnType<typeof useLesson>['steps'],
  currentIndex: number,
): string {
  if (step.kind === 'closing' && dialogue) {
    const closingIndex = steps.slice(0, currentIndex + 1)
      .filter((candidate) => isDialogueStep(candidate) && candidate.kind === 'closing')
      .length - 1
    return dialogue.turns.filter((turn) => turn.speaker === 'B')[closingIndex]?.ja ?? 'あなたの番です'
  }
  if (step.item) {
    return step.item.cueJa
  }
  const japaneseAction = step.actions.find(
    (action) => action.type === 'speak' && action.lang === 'ja',
  )
  return japaneseAction?.type === 'speak' ? japaneseAction.text : step.label
}

function percent(value: number | null | undefined): string {
  return value === null || value === undefined ? '' : `${Math.round(value * 100)}%`
}

function statusLabel(status: CurriculumStatus): string {
  switch (status.kind) {
    case 'passed':
      return `合格 ${percent(status.progress?.bestPromptAccuracy)}`
    case 'retry':
      return `前回 ${percent(status.progress?.lastPromptAccuracy)}`
    case 'locked':
      return '音声を準備中'
    default:
      return 'まだ'
  }
}

export function LessonPage() {
  const { language } = useLanguage()
  const location = useLocation()
  const historyState = location.state as LessonHistoryRouteState | null
  const initialDialogue: LessonDialogueRow | null = historyState?.dialogue?.lang === language
    ? historyState.dialogue
    : null
  const lesson = useLesson(language, initialDialogue)
  const [settings, setSettingsState] = useState<Settings>(getSettings)
  const [pageError, setPageError] = useState<unknown>(null)
  const [listOpen, setListOpen] = useState(false)

  useEffect(() => subscribe(setSettingsState), [])

  const itemCount = useMemo(
    () => new Set(lesson.steps.flatMap((step) => step.item ? [step.item.id] : [])).size,
    [lesson.steps],
  )
  const warnings = lesson.warnings ?? []
  const progress = lesson.steps.length === 0
    ? 0
    : Math.round((lesson.currentIndex / lesson.steps.length) * 100)
  const dialogueStep = lesson.currentStep && isDialogueStep(lesson.currentStep)
    ? lesson.currentStep
    : null
  const cue = dialogueStep
    ? dialogueCue(dialogueStep, lesson.dialogue, lesson.steps, lesson.currentIndex)
    : lesson.currentStep?.item?.cueJa ?? ''
  const curriculum = lesson.curriculum ?? null
  const current = lesson.currentCurriculumStatus ?? null
  const isCurriculum = lesson.mode === 'curriculum'
  const audioReady = lesson.audioProgress !== null && lesson.audioProgress.done >= lesson.audioProgress.total

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
      void lesson.start()
    } catch (startError) {
      setPageError(startError)
    }
  }

  const pickLesson = (lessonId: string) => {
    setListOpen(false)
    lesson.startCurriculumLesson(lessonId)
  }

  const visibleError = pageError ?? lesson.error
  const clearError = () => {
    setPageError(null)
    lesson.clearError()
  }

  const lessonList = curriculum && curriculum.statuses.length > 0 ? (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <button
        type="button"
        onClick={() => setListOpen((open) => !open)}
        className="flex w-full items-center justify-between text-sm font-bold text-slate-800"
        aria-expanded={listOpen}
      >
        <span>レッスン一覧({curriculum.statuses.filter((item) => item.kind === 'passed').length}/{curriculum.total} 合格)</span>
        <span aria-hidden="true">{listOpen ? '▲' : '▼'}</span>
      </button>
      {listOpen ? (
        <ol className="mt-3 space-y-2">
          {curriculum.statuses.map((item) => (
            <li key={item.lesson.id}>
              <button
                type="button"
                onClick={() => pickLesson(item.lesson.id)}
                disabled={!item.audioReady}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm ${item.lesson.id === lesson.curriculumLesson?.id ? 'bg-indigo-50' : 'bg-slate-50'} disabled:opacity-50`}
              >
                <span className="w-6 shrink-0 text-xs font-bold text-slate-400">{item.index + 1}</span>
                <span className="min-w-0 flex-1 font-bold text-slate-800">{item.lesson.scene_ja}</span>
                <span className={`shrink-0 text-xs font-bold ${item.kind === 'passed' ? 'text-teal-700' : 'text-slate-500'}`}>{statusLabel(item)}</span>
              </button>
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  ) : null

  const alternatives = (
    <div className="grid gap-2">
      <button
        type="button"
        onClick={lesson.chooseFreeScene}
        className="w-full rounded-2xl border border-indigo-200 bg-white px-5 py-3 text-sm font-bold text-indigo-800"
      >
        自由な場面で作る(Gemini)
      </button>
      <button
        type="button"
        onClick={lesson.selectWordLesson}
        className="w-full rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-bold text-slate-700"
      >
        単語だけの復習
      </button>
      <Link to="/lesson/history" className="text-center text-sm font-bold text-indigo-700">
        履歴を見る
      </Link>
    </div>
  )

  return (
    <section>
      <Toast error={visibleError} onClose={clearError} />

      <p className="text-sm font-bold text-indigo-700">AUDIO LESSON</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">音声レッスン</h1>

      {warnings.length > 0 ? (
        <div className="mt-4 space-y-2" aria-live="polite">
          {warnings.map((warning) => (
            <p
              key={warning}
              className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900"
            >
              {warning}
            </p>
          ))}
        </div>
      ) : null}

      {lesson.status === 'loading' ? (
        <p className="mt-8 rounded-2xl bg-white px-5 py-8 text-center text-sm font-bold text-slate-500" role="status">
          今日のレッスンを組み立てています…
        </p>
      ) : lesson.status === 'choosing' || lesson.status === 'generating' ? (
        <div>
          {curriculum?.next ? (
            <button
              type="button"
              onClick={lesson.chooseCurriculum}
              disabled={lesson.status === 'generating'}
              className="mt-5 text-sm font-bold text-slate-500 disabled:opacity-40"
            >
              ← 今日のレッスンに戻る
            </button>
          ) : null}
          <ScenePicker
            interests={settings.interests}
            prepEvents={lesson.upcomingPrepEvents}
            busy={lesson.status === 'generating'}
            onCreate={(sceneJa) => void lesson.startDialogueLesson(sceneJa)}
          />
          {lesson.status !== 'generating' ? (
            <div className="mt-6 space-y-3">
              {lessonList}
              <button
                type="button"
                onClick={lesson.selectWordLesson}
                className="w-full rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-bold text-slate-700"
              >
                単語だけの復習
              </button>
              <Link to="/lesson/history" className="block text-center text-sm font-bold text-indigo-700">
                会話レッスンの履歴を見る
              </Link>
            </div>
          ) : null}
        </div>
      ) : lesson.status === 'ready' || lesson.status === 'preparing' ? (
        <div className="mt-7 space-y-5">
          <div className="rounded-3xl border border-indigo-200 bg-gradient-to-b from-indigo-50 to-white p-6 text-center shadow-sm">
            <p className="text-6xl" aria-hidden="true">🎧</p>
            {isCurriculum && current && curriculum ? (
              <p className="mt-4 text-xs font-bold tracking-wider text-indigo-700">
                {current.kind === 'retry'
                  ? `レッスン ${current.index + 1}/${curriculum.total} ・ 前回 ${percent(current.progress?.lastPromptAccuracy)}。もう一度`
                  : current.kind === 'passed'
                    ? `レッスン ${current.index + 1}/${curriculum.total} ・ 合格済み(復習)`
                    : `今日のレッスン ${current.index + 1}/${curriculum.total}`}
              </p>
            ) : null}
            <h2 className="mt-3 text-xl font-bold text-slate-900">
              {(lesson.mode === 'dialogue' || isCurriculum) && lesson.dialogue
                ? lesson.dialogue.title_ja
                : `今日のレッスン ${itemCount} 項目`}
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              {(lesson.mode === 'dialogue' || isCurriculum) && lesson.dialogue
                ? `${lesson.dialogue.scene_ja} ・ 新しい表現 ${lesson.dialogue.new_expressions.length} 個 ・ 約 ${lesson.estimatedMinutes} 分`
                : `約 ${lesson.estimatedMinutes} 分。問いを聞いたら、模範が流れる前に声に出してみましょう。`}
            </p>
            {isCurriculum && lesson.audioProgress ? (
              <p className="mt-3 text-xs font-bold text-slate-500" role="status">
                {audioReady
                  ? '音声の準備ができました(自然な声・事前合成)'
                  : `音声を準備しています ${lesson.audioProgress.done}/${lesson.audioProgress.total}`}
              </p>
            ) : null}
            {isCurriculum && lesson.error && !audioReady ? (
              <button
                type="button"
                onClick={lesson.retryAudio}
                className="mt-3 rounded-full border border-indigo-200 bg-white px-4 py-2 text-xs font-bold text-indigo-800"
              >
                音声の準備をやり直す
              </button>
            ) : null}
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

          </div>

          <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
            iPhone では画面を消すと止まります。画面を点けたまま使ってください。
          </p>

          <button
            type="button"
            onClick={startLesson}
            disabled={lesson.steps.length === 0 || lesson.status === 'preparing'}
            className="w-full rounded-2xl bg-indigo-700 px-5 py-5 text-lg font-bold text-white shadow-[0_16px_36px_rgba(67,56,202,0.24)] disabled:opacity-45"
          >
            {lesson.status === 'preparing' ? '音声を準備しています…' : 'はじめる'}
          </button>

          {isCurriculum ? (
            <>
              {lessonList}
              {alternatives}
            </>
          ) : curriculum?.next ? (
            <button
              type="button"
              onClick={lesson.chooseCurriculum}
              className="w-full rounded-2xl border border-indigo-200 bg-white px-5 py-3 text-sm font-bold text-indigo-800"
            >
              今日のレッスンに戻る
            </button>
          ) : null}
        </div>
      ) : lesson.status === 'running' && lesson.currentStep ? (
        <div className="mt-6">
          <div className="flex items-center justify-between gap-4 text-xs font-bold text-slate-500">
            <p>{lesson.currentIndex + 1}/{lesson.steps.length}</p>
            <p className="rounded-full bg-indigo-50 px-3 py-1 text-indigo-800">
              {lesson.mode !== 'words'
                ? lesson.currentStepLabel
                : lesson.currentStep.stage !== undefined
                  ? STAGE_LABELS[lesson.currentStep.stage]
                  : ''}
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
            {lesson.mode !== 'words' ? (
              <p className="text-xs font-bold tracking-wider text-indigo-700">
                話しているのは: {lesson.currentSpeaker === 'you'
                  ? 'あなた'
                  : lesson.currentSpeaker ?? 'ナレーター'}
              </p>
            ) : (
              <p className="text-xs font-bold tracking-wider text-indigo-700">この場面で言ってみましょう</p>
            )}
            <h2 className="mt-4 text-2xl font-bold leading-10 text-slate-900">
              {cue}
            </h2>
            <div className="mt-7 min-h-24 rounded-2xl bg-indigo-50 px-4 py-6">
              {lesson.currentAction === 'answer' ? (
                <p className="text-xl font-bold leading-8 text-indigo-950">
                  {lesson.mode !== 'words'
                    ? lesson.currentSpokenText
                    : lesson.currentStep.item?.answer}
                </p>
              ) : (
                <p className="text-3xl font-bold tracking-[0.3em] text-indigo-300" aria-label="答えを待っています">…</p>
              )}
            </div>

            {lesson.currentAction === 'pause' ? (
              <div className="mt-5 rounded-2xl bg-amber-50 px-4 py-4 text-sm font-bold text-amber-900" role="status">
                声に出してみましょう
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
          {lesson.autoPaused ? (
            <p className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900" role="status">
              画面が隠れたので止めました。「▶ 再開」で続きから
            </p>
          ) : null}
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
          <h2 className="mt-4 text-xl font-bold text-slate-900">
            {isCurriculum && current ? `レッスン ${current.index + 1} を終えました` : '今日のレッスンを終えました'}
          </h2>
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

          {isCurriculum ? (
            <div className="mt-6 rounded-2xl border border-indigo-200 bg-indigo-50/60 p-4 text-left" aria-labelledby="self-report-heading">
              <h3 id="self-report-heading" className="text-sm font-bold text-slate-900">
                応用の合図 {lesson.promptCount} 個のうち、言えたのは?
              </h3>
              {lesson.selfReport === null ? (
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {SELF_REPORT_ORDER.map((report) => (
                    <button
                      key={report}
                      type="button"
                      onClick={() => void lesson.reportSelfAssessment(report)}
                      disabled={lesson.reporting}
                      className="rounded-xl bg-white px-3 py-3 text-sm font-bold text-indigo-900 shadow-sm disabled:opacity-50"
                    >
                      {SELF_REPORT_LABELS[report]}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="mt-3 text-sm font-bold leading-6 text-slate-800" role="status">
                  {lesson.passed
                    ? `合格です。${lesson.nextCurriculumStatus ? `次回は ${lesson.nextCurriculumStatus.index + 1}/${curriculum?.total ?? ''}「${lesson.nextCurriculumStatus.lesson.scene_ja}」です` : '次のレッスンの音声ができるまでお待ちください'}`
                    : '8 割に届かなかったので、次回も同じレッスンをもう一度やります(本家も 8 割で次へ進みます)'}
                </p>
              )}
            </div>
          ) : null}

          {(lesson.mode === 'dialogue' || isCurriculum) && lesson.dialogue ? (
            <div className="mt-7 text-left">
              <h3 className="font-bold text-slate-900">会話全文</h3>
              <div className="mt-3 space-y-3">
                {lesson.dialogue.turns.map((turn, index) => (
                  <div key={`${turn.speaker}-${index}`} className="rounded-2xl bg-slate-50 px-4 py-3">
                    <p className="text-xs font-bold text-indigo-700">{turn.speaker}</p>
                    <p className="mt-1 font-bold text-slate-900">{turn.text}</p>
                    <p className="mt-1 text-sm text-slate-500">{turn.ja}</p>
                  </div>
                ))}
              </div>
              <h3 className="mt-6 font-bold text-slate-900">今日の新しい表現</h3>
              <div className="mt-3 space-y-2">
                {lesson.dialogue.new_expressions.map((expression) => (
                  <div key={`${expression.turn_index}-${expression.text}`} className="rounded-2xl bg-indigo-50 px-4 py-3">
                    <p className="font-bold text-indigo-950">{expression.text}</p>
                    <p className="mt-1 text-sm text-slate-600">{expression.ja}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {isCurriculum && lesson.passed && lesson.nextCurriculumStatus ? (
            <button
              type="button"
              onClick={() => pickLesson(lesson.nextCurriculumStatus!.lesson.id)}
              className="mt-6 w-full rounded-2xl bg-indigo-700 px-5 py-4 font-bold text-white"
            >
              次のレッスンへ
            </button>
          ) : null}
          <button
            type="button"
            onClick={startLesson}
            className={`${isCurriculum && lesson.passed && lesson.nextCurriculumStatus ? 'mt-3 border border-indigo-200 bg-white text-indigo-800' : 'mt-6 bg-indigo-700 text-white'} w-full rounded-2xl px-5 py-4 font-bold`}
          >
            もう一度
          </button>
          {isCurriculum ? (
            <div className="mt-3 space-y-3 text-left">
              {lessonList}
              <Link
                to="/"
                className="flex w-full items-center justify-center rounded-2xl border border-slate-200 bg-white px-5 py-4 font-bold text-slate-700"
              >
                ホームへ
              </Link>
            </div>
          ) : lesson.mode === 'dialogue' ? (
            <>
              <button
                type="button"
                onClick={lesson.chooseFreeScene}
                className="mt-3 w-full rounded-2xl border border-indigo-200 bg-white px-5 py-4 font-bold text-indigo-800"
              >
                別の場面で
              </button>
              <Link
                to="/lesson/history"
                className="mt-3 flex w-full items-center justify-center rounded-2xl border border-slate-200 bg-white px-5 py-4 font-bold text-slate-700"
              >
                履歴を見る
              </Link>
            </>
          ) : (
            <Link
              to="/practice"
              className="mt-3 flex w-full items-center justify-center rounded-2xl border border-indigo-200 bg-white px-5 py-4 font-bold text-indigo-800"
            >
              練習へ戻る
            </Link>
          )}
        </div>
      ) : null}
    </section>
  )
}
