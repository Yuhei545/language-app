import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CoreFrame, CoreVocab, CoreWord } from '../../content/coreSchema'
import { loadCore } from '../../content/coreSchema'
import { collectClips, isLessonAudioReady, type AudioManifest, type BundledClipRef } from '../../content/lessonAudio'
import type { BundledLesson } from '../../content/lessonSchema'
import { loadAudioManifest, loadLessons } from '../../content/lessons'
import { generateDialogue } from '../../services/gemini/dialogue'
import {
  hasVoiceFor,
  prefetchSpeech,
  speak,
  stopSpeaking,
  unlockAudio,
} from '../../services/speech'
import { AudioSuspendedError } from '../../services/speech/audioPlayer'
import { findBundledClip, prefetchBundledClips } from '../../services/speech/bundledAudio'
import { getSettings, subscribe, type Settings } from '../../services/settings'
import { getSession } from '../../services/supabase/auth'
import {
  ensureCurriculumDialogue,
  getLanguageProgress,
  getVocabProgress,
  listCurriculumProgress,
  listMixingProgress,
  listPrepEvents,
  listVocabItems,
  markDialogueCompleted,
  saveLessonDialogue,
  upsertVocabItems,
} from '../../services/supabase/db'
import type {
  CurriculumProgressRow,
  LessonDialogueRow,
  MixingProgressRow,
  PrepEventRow,
} from '../../services/supabase/types'
import { selectDueCards, type SrsState } from '../cards/srs'
import type { EncounterEntry } from '../chunks/ledger'
import { recordEncounters, reportLedgerFailure } from '../chunks/record'
import { chunksIn } from '../chunks/registry'
import { loadChunkContext, type ChunkContext } from '../chunks/targetsStore'
import { describeError, toError } from '../../utils/errorMessage'
import { comboKey } from '../mixing/deal'
import { slotPool } from '../mixing/combinations'
import {
  accuracyFromReport,
  lessonAfter,
  lessonStatuses,
  PASS_THRESHOLD,
  selectNextLesson,
  toCurriculumProgress,
  type CurriculumProgress,
  type CurriculumStatus,
  type SelfReport,
} from './curriculum'
import { buildDialogueLesson, PROMPT_ITEM_PREFIX, type DialogueLessonStep } from './dialoguePlan'
import { estimateActionsMs } from './estimate'
import type { LessonDialogue } from './lessonDialogueSchema'
import {
  buildSections,
  sectionIndexOf,
  stepAtOffset,
  stepStartsMs,
  type RunnableLessonStep,
} from './navigation'
import { buildLessonItems } from './material'
import { planStep, type LessonAction } from './plan'
import { buildSchedule } from './schedule'
import type { LessonStep } from './types'

export type LessonStatus = 'loading' | 'choosing' | 'generating' | 'ready' | 'preparing' | 'running' | 'finished'
/** words: 単語だけの復習 / dialogue: 自由な場面(Gemini 生成) / curriculum: 同梱レッスン */
export type LessonMode = 'words' | 'dialogue' | 'curriculum'
export type CurrentLessonAction = 'cue' | 'pause' | 'answer' | null
export type CurrentLessonSpeaker = 'A' | 'B' | 'you' | null

export type LessonRecallResult = {
  itemId: string
  stage: LessonStep['stage']
  matched: boolean
}

export type CurriculumOverview = {
  statuses: CurriculumStatus[]
  next: CurriculumStatus | null
  total: number
}

export const CURRICULUM_MIGRATION_HINT =
  'レッスンの進み具合を保存できません。Supabase の SQL Editor で supabase/migrations/007_curriculum.sql を実行してください。'
  + '練習はこのまま続けられます'

function curriculumDbError(error: unknown): Error {
  if (/curriculum_id|best_prompt_accuracy|last_prompt_accuracy|schema cache/i.test(describeError(error))) {
    return new Error(CURRICULUM_MIGRATION_HINT, { cause: error })
  }
  return toError(error)
}

type ProgressIdentity = {
  frameId: string
  verbText: string
  nounText: string
}

function identityKey(identity: ProgressIdentity): string {
  return JSON.stringify([identity.frameId, identity.verbText, identity.nounText])
}

function progressIdentity(
  core: CoreVocab,
  frame: CoreFrame,
  words: CoreWord[],
): ProgressIdentity {
  const verbTexts = new Set([
    ...core.verbs.map((word) => word.text),
    ...core.phrasal.map((word) => word.text),
  ])
  const nounTexts = new Set(core.nouns.map((word) => word.text))
  const verbIndex = words.findIndex((word, index) => (
    verbTexts.has(word.text)
    && (frame.slots[index]?.startsWith('verb:') || frame.slots[index]?.startsWith('phrasal:'))
  ))
  const verbSlot = verbIndex >= 0 ? frame.slots[verbIndex] : ''
  const verbTakes = verbSlot.includes(':') ? verbSlot.split(':')[1] : ''
  let nounIndex = frame.slots.findIndex((slot, index) => (
    slot === `noun:${verbTakes}` && nounTexts.has(words[index]?.text ?? '')
  ))
  if (nounIndex < 0) {
    nounIndex = words.findIndex((word, index) => (
      nounTexts.has(word.text) && frame.slots[index]?.startsWith('noun:')
    ))
  }

  return {
    frameId: frame.id,
    verbText: verbIndex >= 0 ? words[verbIndex].text : '',
    nounText: nounIndex >= 0 ? words[nounIndex].text : '',
  }
}

function expandFrameWords(core: CoreVocab, frame: CoreFrame): CoreWord[][] {
  return frame.slots.reduce<CoreWord[][]>(
    (combinations, slot) => combinations.flatMap(
      (combination) => slotPool(core, slot).map((word) => [...combination, word]),
    ),
    [[]],
  )
}

function buildMixingHistory(
  core: CoreVocab,
  rows: MixingProgressRow[],
): Map<string, { attempt_count: number; understood_count: number }> {
  const progressByIdentity = new Map(rows.map((row) => [identityKey({
    frameId: row.frame_id,
    verbText: row.verb_text,
    nounText: row.noun_text,
  }), row]))
  const history = new Map<string, { attempt_count: number; understood_count: number }>()

  core.frames.forEach((frame) => {
    expandFrameWords(core, frame).forEach((words) => {
      const progress = progressByIdentity.get(identityKey(progressIdentity(core, frame, words)))
      if (progress) {
        history.set(comboKey(frame.id, words), {
          attempt_count: progress.attempt_count,
          understood_count: progress.understood_count,
        })
      }
    })
  })

  return history
}

function localDateString(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function actionLabel(action: LessonAction): CurrentLessonAction {
  if (action.type === 'pause') {
    return 'pause'
  }
  if (action.type === 'speak') {
    return action.lang === 'ja' ? 'cue' : 'answer'
  }
  return null
}

function isDialogueStep(step: RunnableLessonStep): step is DialogueLessonStep {
  return 'actions' in step
}

function rowToDialogue(row: LessonDialogueRow): LessonDialogue {
  return {
    title_ja: row.title_ja,
    scene_ja: row.scene_ja,
    turns: row.dialogue,
    new_expressions: row.new_expressions,
  }
}

function buildOverview(
  lessons: BundledLesson[],
  manifest: AudioManifest | null,
  rows: CurriculumProgressRow[],
): CurriculumOverview {
  const progress = rows
    .map(toCurriculumProgress)
    .filter((item): item is CurriculumProgress => item !== null)
  const statuses = lessonStatuses(lessons, progress, (id) => isLessonAudioReady(manifest, id))
  return { statuses, next: selectNextLesson(statuses), total: lessons.length }
}

type Prefetch = {
  lessonId: string
  controller: AbortController
  /** 終わったら null、失敗なら Error。 */
  result: Promise<Error | null>
}

export function useLesson(lang: 'en' | 'ko', initialDialogue?: LessonDialogueRow | null) {
  const [settings, setSettingsState] = useState<Settings>(getSettings)
  const settingsRef = useRef(settings)
  const [status, setStatus] = useState<LessonStatus>('loading')
  const [mode, setMode] = useState<LessonMode>('words')
  const [steps, setSteps] = useState<RunnableLessonStep[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [currentAction, setCurrentAction] = useState<CurrentLessonAction>(null)
  const [currentSpokenText, setCurrentSpokenText] = useState<string | null>(null)
  const [currentSpeaker, setCurrentSpeaker] = useState<CurrentLessonSpeaker>(null)
  const [dialogue, setDialogue] = useState<LessonDialogue | null>(null)
  const [upcomingPrepEvents, setUpcomingPrepEvents] = useState<PrepEventRow[]>([])
  const [elapsedMs, setElapsedMs] = useState(0)
  const [paused, setPaused] = useState(false)
  const [autoPaused, setAutoPaused] = useState(false)
  const [recallResults, setRecallResults] = useState<LessonRecallResult[]>([])
  const [error, setError] = useState<unknown>(null)
  const [warnings, setWarnings] = useState<string[]>([])
  /** 同梱カリキュラム。一覧と次のレッスン。 */
  const [curriculum, setCurriculum] = useState<CurriculumOverview | null>(null)
  const [curriculumLesson, setCurriculumLesson] = useState<BundledLesson | null>(null)
  const [audioProgress, setAudioProgress] = useState<{ done: number; total: number } | null>(null)
  const [selfReport, setSelfReport] = useState<SelfReport | null>(null)
  const [passed, setPassed] = useState<boolean | null>(null)
  const [reporting, setReporting] = useState(false)
  const generationRef = useRef(0)
  const actionIndexRef = useRef(0)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const resolveTimeoutRef = useRef<(() => void) | null>(null)
  const startedAtRef = useRef<number | null>(null)
  const lessonRunRef = useRef(0)
  const mountedRef = useRef(true)
  const japaneseVoiceAvailableRef = useRef(true)
  const consecutiveSpeechFailuresRef = useRef(0)
  const userIdRef = useRef<string | null>(null)
  const currentWeekRef = useRef(1)
  const knownWordsRef = useRef<string[]>([])
  const wordStepsRef = useRef<LessonStep[]>([])
  const dialogueIdRef = useRef<string | null>(null)
  const generationAbortRef = useRef<AbortController | null>(null)
  const completionRunRef = useRef<number | null>(null)
  /** 今日の狙いと登録簿。会話の生成に渡し、台詞に含まれるチャンクを台帳に書く。 */
  const chunkContextRef = useRef<ChunkContext | null>(null)
  const pendingRef = useRef<EncounterEntry[]>([])
  const ledgerWarnedRef = useRef({ current: false })
  const lessonsRef = useRef<BundledLesson[]>([])
  const manifestRef = useRef<AudioManifest | null>(null)
  const prefetchRef = useRef<Prefetch | null>(null)

  const currentStep = steps[currentIndex] ?? null
  const sections = useMemo(() => buildSections(steps), [steps])
  const stepStarts = useMemo(() => stepStartsMs(steps, (step) => (
    isDialogueStep(step)
      ? step.actions
      : planStep(step, {
          lang,
          pauseSeconds: settings.lessonPauseSeconds,
        })
  )), [lang, settings.lessonPauseSeconds, steps])

  const updateElapsed = useCallback(() => {
    if (startedAtRef.current !== null) {
      setElapsedMs(Math.max(0, Date.now() - startedAtRef.current))
    }
  }, [])

  const cancelActive = useCallback(() => {
    generationRef.current += 1
    generationAbortRef.current?.abort()
    generationAbortRef.current = null
    stopSpeaking()

    if (timeoutRef.current !== null) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
    const resolveTimeout = resolveTimeoutRef.current
    resolveTimeoutRef.current = null
    resolveTimeout?.()

  }, [])

  const wait = useCallback((milliseconds: number): Promise<void> => (
    new Promise((resolve) => {
      resolveTimeoutRef.current = resolve
      timeoutRef.current = setTimeout(() => {
        timeoutRef.current = null
        resolveTimeoutRef.current = null
        resolve()
      }, milliseconds)
    })
  ), [])

  useEffect(() => subscribe((nextSettings) => {
    settingsRef.current = nextSettings
    setSettingsState(nextSettings)
  }), [])

  /** ためた出会いを台帳にまとめて書く。失敗してもレッスンは止めない。 */
  const flushLedger = useCallback(() => {
    const userId = userIdRef.current
    const entries = pendingRef.current.splice(0)
    if (!userId || entries.length === 0) {
      return
    }
    void recordEncounters(userId, lang, entries).catch((ledgerError: unknown) => {
      reportLedgerFailure(ledgerError, ledgerWarnedRef.current, setError)
    })
  }, [lang])

  /**
   * 終えたステップに含まれるチャンクを台帳にためる。
   * 会話: 台詞・核・思い出し・復習は seen、応用の合図・締めは said。単語レッスン: 1 回目は seen、再出題は said。
   */
  const noteStep = useCallback((step: RunnableLessonStep | undefined) => {
    const registry = chunkContextRef.current?.registry
    if (!step || !registry || registry.length === 0) {
      return
    }
    let kind: EncounterEntry['kind']
    let context: string
    let text: string
    if (isDialogueStep(step)) {
      if (!step.item) {
        return
      }
      if (step.kind === 'prompt' || step.kind === 'closing') {
        kind = 'said'
      } else if (step.kind === 'breakdown' || step.kind === 'line' || step.kind === 'recall' || step.kind === 'review') {
        kind = 'seen'
      } else {
        return
      }
      context = `${dialogueIdRef.current ?? 'dialogue'}:${step.item.id}`
      text = step.item.answer
    } else {
      kind = step.stage === 0 ? 'seen' : 'said'
      context = `words:${step.item.id}`
      text = step.item.answer
    }
    for (const chunk of chunksIn(text, registry, lang)) {
      pendingRef.current.push({ chunkKey: chunk.key, mode: 'lesson', kind, context })
    }
  }, [lang])

  useEffect(() => {
    if (status === 'finished') {
      flushLedger()
    }
  }, [flushLedger, status])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      cancelActive()
    }
  }, [cancelActive])

  const cancelPrefetch = useCallback(() => {
    prefetchRef.current?.controller.abort()
    prefetchRef.current = null
  }, [])

  /** 同梱レッスンを選び、ステップを組んで音声の先読みを始める。 */
  const prepareCurriculumLesson = useCallback((lesson: BundledLesson) => {
    cancelActive()
    cancelPrefetch()
    const built = buildDialogueLesson(lesson.dialogue, {
      lang,
      pauseSeconds: settingsRef.current.lessonPauseSeconds,
      currentWeek: currentWeekRef.current,
      review: lesson.review,
    })
    dialogueIdRef.current = null
    completionRunRef.current = null
    setMode('curriculum')
    setCurriculumLesson(lesson)
    setDialogue(lesson.dialogue)
    setSteps(built.steps)
    setCurrentIndex(0)
    setCurrentAction(null)
    setCurrentSpokenText(null)
    setCurrentSpeaker(null)
    setSelfReport(null)
    setPassed(null)
    setError(null)
    setWarnings([])
    setStatus('ready')

    const refs: BundledClipRef[] = []
    for (const clip of collectClips(lesson, lang)) {
      const ref = findBundledClip(clip.text, clip.lang, clip.voice)
      if (!ref) {
        setAudioProgress(null)
        setError(new Error(`このレッスンの音声はまだ用意されていません(${lesson.scene_ja})`))
        return
      }
      refs.push(ref)
    }
    const controller = new AbortController()
    setAudioProgress({ done: 0, total: refs.length })
    const result = prefetchBundledClips(refs, {
      signal: controller.signal,
      onProgress: (done, total) => {
        if (mountedRef.current && prefetchRef.current?.lessonId === lesson.id) {
          setAudioProgress({ done, total })
        }
      },
    })
      .then(() => null)
      .catch((prefetchError: unknown) => {
        console.error('レッスンの音声を準備できませんでした', prefetchError)
        return prefetchError instanceof Error ? prefetchError : new Error(String(prefetchError))
      })
    prefetchRef.current = { lessonId: lesson.id, controller, result }
  }, [cancelActive, cancelPrefetch, lang])

  const refreshCurriculum = useCallback((rows: CurriculumProgressRow[]) => {
    const overview = buildOverview(lessonsRef.current, manifestRef.current, rows)
    setCurriculum(overview)
    return overview
  }, [])

  useEffect(() => {
    let active = true
    cancelActive()
    cancelPrefetch()
    actionIndexRef.current = 0
    startedAtRef.current = null
    setStatus('loading')
    setSteps([])
    setCurrentIndex(0)
    setCurrentAction(null)
    setCurrentSpokenText(null)
    setCurrentSpeaker(null)
    setElapsedMs(0)
    setPaused(false)
    setRecallResults([])
    setError(null)
    setWarnings([])
    setDialogue(null)
    setUpcomingPrepEvents([])
    setMode('words')
    setCurriculum(null)
    setCurriculumLesson(null)
    setAudioProgress(null)
    setSelfReport(null)
    setPassed(null)
    userIdRef.current = null
    dialogueIdRef.current = null
    completionRunRef.current = null
    consecutiveSpeechFailuresRef.current = 0

    const load = async () => {
      try {
        const authSession = await getSession()
        if (!authSession) {
          throw new Error('ログイン情報を確認できませんでした')
        }

        const userId = authSession.user.id
        const core = loadCore(lang)
        const lessons = loadLessons(lang)
        const manifest = loadAudioManifest(lang)
        const [vocabItems, mixingRows, prepEvents, languageProgress] = await Promise.all([
          listVocabItems(userId, lang),
          listMixingProgress(userId, lang),
          listPrepEvents(userId, lang),
          getLanguageProgress(userId, lang),
        ])
        const currentWeek = languageProgress?.current_week ?? 1
        const upcomingEvents = prepEvents.filter(
          (event) => event.event_date !== null && event.event_date >= localDateString(new Date()),
        )
        const [vocabProgress, prepGroups, chunkContext] = await Promise.all([
          getVocabProgress(userId, vocabItems.map((item) => item.id)),
          Promise.all(upcomingEvents.map(
            (event) => listVocabItems(userId, lang, { prepEventId: event.id }),
          )),
          loadChunkContext({ userId, lang, vocabItems }),
        ])
        // カリキュラムの進み具合。007 が無ければ空で進み、案内を出す
        let progressRows: CurriculumProgressRow[] = []
        let curriculumError: Error | null = null
        try {
          progressRows = await listCurriculumProgress(userId, lang)
        } catch (progressError) {
          console.error('レッスンの進み具合を読めませんでした', progressError)
          curriculumError = curriculumDbError(progressError)
        }
        const srsProgress = new Map<string, SrsState>(vocabProgress.map((progress) => [
          progress.vocab_item_id,
          {
            status: progress.status,
            correct_count: progress.correct_count,
            next_review_at: progress.next_review_at,
          },
        ]))
        const items = buildLessonItems({
          dueCards: selectDueCards(vocabItems, srsProgress, new Date(), 8),
          core,
          mixingHistory: buildMixingHistory(core, mixingRows),
          prepWords: prepGroups.flat(),
        })
        const nextSteps = buildSchedule(items)
        const coreWords = [
          ...core.verbs,
          ...core.nouns,
          ...core.adjectives,
          ...core.phrasal,
        ].map((word) => word.text)
        const knownWords = Array.from(new Set([
          ...vocabItems.filter((item) => (
            item.week === currentWeek
            || vocabProgress.some((progress) => (
              progress.vocab_item_id === item.id && progress.status === 'known'
            ))
          )).map((item) => item.text),
          ...coreWords,
          // 今日の狙いは既知語として数える(型の固定部分・句動詞・表現)
          ...chunkContext.targets.map((chunk) => chunk.display),
        ]))

        if (active) {
          userIdRef.current = userId
          currentWeekRef.current = currentWeek
          knownWordsRef.current = knownWords
          wordStepsRef.current = nextSteps
          chunkContextRef.current = chunkContext
          lessonsRef.current = lessons
          manifestRef.current = manifest
          pendingRef.current = []
          setUpcomingPrepEvents(upcomingEvents)
          const overview = refreshCurriculum(progressRows)
          if (chunkContext.error && !ledgerWarnedRef.current.current) {
            ledgerWarnedRef.current.current = true
            setError(chunkContext.error)
          }

          const replayLesson = initialDialogue?.curriculum_id
            ? lessons.find((lesson) => lesson.id === initialDialogue.curriculum_id) ?? null
            : null
          if (initialDialogue && replayLesson && isLessonAudioReady(manifest, replayLesson.id)) {
            // 履歴からのやり直し。ステップは同梱の JSON から組み、行は進み具合の記録に使う
            prepareCurriculumLesson(replayLesson)
            dialogueIdRef.current = initialDialogue.id
          } else if (initialDialogue) {
            const savedDialogue = rowToDialogue(initialDialogue)
            const built = buildDialogueLesson(savedDialogue, {
              lang,
              pauseSeconds: settingsRef.current.lessonPauseSeconds,
              currentWeek,
            })
            dialogueIdRef.current = initialDialogue.id
            setDialogue(savedDialogue)
            setMode('dialogue')
            setSteps(built.steps)
            setStatus('ready')
          } else if (overview.next) {
            prepareCurriculumLesson(overview.next.lesson)
          } else {
            setSteps([])
            setStatus('choosing')
          }
          if (curriculumError) {
            setError(curriculumError)
          }
        }
      } catch (loadError) {
        if (active) {
          setError(loadError)
        }
      }
    }

    void load()
    return () => {
      active = false
      cancelActive()
      cancelPrefetch()
      // 途中でやめても、ここまでの出会いは書く
      flushLedger()
    }
  }, [cancelActive, cancelPrefetch, flushLedger, initialDialogue, lang, prepareCurriculumLesson, refreshCurriculum])

  useEffect(() => {
    if (status !== 'running' || paused || !currentStep) {
      return undefined
    }

    const generation = generationRef.current
    const actions = isDialogueStep(currentStep)
      ? currentStep.actions
      : planStep(currentStep, {
          lang,
          pauseSeconds: settings.lessonPauseSeconds,
        })
    // 同梱レッスンと Gemini の声では、機械的な声で続けず、読めなかったら止めて知らせる
    const strict = mode === 'curriculum' || settingsRef.current.ttsProvider === 'gemini'

    const runPause = async (action: Extract<LessonAction, { type: 'pause' }>) => {
      // 間は声に出すための時間。録音はしない(自分で音読する)。
      await wait(action.ms)
    }

    const run = async () => {
      for (let index = actionIndexRef.current; index < actions.length; index += 1) {
        if (generationRef.current !== generation) {
          return
        }

        const action = actions[index]
        setCurrentAction(actionLabel(action))
        setCurrentSpokenText(action.type === 'speak' ? action.text : null)
        if (isDialogueStep(currentStep)) {
          setCurrentSpeaker(
            action.type === 'pause'
              ? 'you'
              : action.type === 'speak' && (action.voice === 'A' || action.voice === 'B')
                ? action.voice
                : null,
          )
        } else {
          setCurrentSpeaker(null)
        }

        if (action.type === 'speak') {
          if (action.lang === 'ja' && !strict && !japaneseVoiceAvailableRef.current) {
            await wait(1_500)
          } else {
            try {
              const isFallbackB = action.voice === 'B' && !settingsRef.current.ttsVoiceB[lang]
              const targetVoice = action.voice === 'B'
                ? settingsRef.current.ttsVoiceB[lang] ?? settingsRef.current.ttsVoice[lang]
                : settingsRef.current.ttsVoice[lang]
              await speak(action.text, {
                lang: action.lang,
                rate: isFallbackB
                  ? 0.95
                  : action.rate ?? (action.lang === 'ja' ? undefined : settingsRef.current.ttsRate),
                voiceURI: action.lang === 'ja' ? settingsRef.current.ttsVoiceJa ?? undefined : targetVoice,
                pitch: isFallbackB ? 0.9 : undefined,
                speaker: action.lang === 'ja' ? 'narrator' : (action.voice === 'B' ? 'B' : 'A'),
              })
              consecutiveSpeechFailuresRef.current = 0
            } catch (speechError) {
              if (strict || speechError instanceof AudioSuspendedError) {
                throw speechError
              }
              consecutiveSpeechFailuresRef.current += 1
              console.warn('読み上げに失敗したため次の行動へ進みます', speechError)
              if (consecutiveSpeechFailuresRef.current >= 3) {
                throw new Error('読み上げが連続して失敗しています')
              }
            }
          }
        } else if (action.type === 'pause') {
          await runPause(action)
        } else {
          await wait(action.ms)
        }

        if (generationRef.current !== generation) {
          return
        }
        actionIndexRef.current = index + 1
        updateElapsed()
      }

      if (generationRef.current !== generation) {
        return
      }
      actionIndexRef.current = 0
      setCurrentAction(null)
      setCurrentSpokenText(null)
      setCurrentSpeaker(null)
      noteStep(steps[currentIndex])
      if (currentIndex + 1 >= steps.length) {
        updateElapsed()
        setStatus('finished')
      } else {
        setCurrentIndex((index) => index + 1)
      }
    }

    void run().catch((runError) => {
      if (generationRef.current === generation && mountedRef.current) {
        cancelActive()
        updateElapsed()
        setCurrentAction(null)
        setPaused(true)
        setError(runError)
      }
    })

    return () => {
      if (generationRef.current === generation) {
        cancelActive()
      }
    }
  }, [
    cancelActive,
    currentIndex,
    noteStep,
    currentStep,
    lang,
    mode,
    paused,
    settings.lessonPauseSeconds,
    settings.lessonRecording,
    status,
    steps.length,
    updateElapsed,
    wait,
  ])

  // 自由な場面のレッスンは終わった時点で完了にする(同梱レッスンは自己申告のあと)
  useEffect(() => {
    if (status !== 'finished' || mode !== 'dialogue' || !dialogue) {
      return
    }

    const dialogueId = dialogueIdRef.current
    const userId = userIdRef.current
    const runId = lessonRunRef.current
    if (!dialogueId || !userId || completionRunRef.current === runId) {
      return
    }
    completionRunRef.current = runId

    const complete = async () => {
      try {
        await markDialogueCompleted(dialogueId)
        await upsertVocabItems(dialogue.new_expressions.map((expression) => ({
          user_id: userId,
          lang,
          week: currentWeekRef.current,
          text: expression.text,
          emoji: '💬',
          hint_ja: expression.ja,
          example: dialogue.turns[expression.turn_index]?.text ?? expression.text,
          category: 'dialogue' as const,
          source: 'generated' as const,
        })))
      } catch (completionError) {
        if (mountedRef.current && lessonRunRef.current === runId) {
          setError(completionError)
        }
      }
    }

    void complete()
  }, [dialogue, lang, mode, status])

  /** 同梱レッスンの終了時の自己申告。8 割以上で合格。進み具合と新しい表現のカードを保存する。 */
  const reportSelfAssessment = useCallback(async (report: SelfReport) => {
    const lesson = curriculumLesson
    if (mode !== 'curriculum' || status !== 'finished' || reporting || selfReport !== null || !lesson) {
      return
    }
    const accuracy = accuracyFromReport(report)
    const isPassed = accuracy >= PASS_THRESHOLD
    setSelfReport(report)
    setPassed(isPassed)
    setReporting(true)
    const dialogueId = dialogueIdRef.current
    const userId = userIdRef.current
    try {
      if (!userId) {
        return
      }
      if (!dialogueId) {
        throw new Error(CURRICULUM_MIGRATION_HINT)
      }
      await markDialogueCompleted(dialogueId, { promptAccuracy: accuracy })
      await upsertVocabItems(lesson.dialogue.new_expressions.map((expression) => ({
        user_id: userId,
        lang,
        week: currentWeekRef.current,
        text: expression.text,
        emoji: '💬',
        hint_ja: expression.ja,
        example: lesson.dialogue.turns[expression.turn_index]?.text ?? expression.text,
        category: 'dialogue' as const,
        source: 'bundled' as const,
      })))
      const rows = await listCurriculumProgress(userId, lang)
      if (mountedRef.current) {
        refreshCurriculum(rows)
      }
    } catch (reportError) {
      if (mountedRef.current) {
        setError(curriculumDbError(reportError))
      }
    } finally {
      if (mountedRef.current) {
        setReporting(false)
      }
    }
  }, [curriculumLesson, lang, mode, refreshCurriculum, reporting, selfReport, status])

  const selectWordLesson = useCallback(() => {
    cancelActive()
    cancelPrefetch()
    setMode('words')
    setDialogue(null)
    setCurriculumLesson(null)
    setAudioProgress(null)
    dialogueIdRef.current = null
    setSteps(wordStepsRef.current)
    setCurrentIndex(0)
    setCurrentAction(null)
    setCurrentSpokenText(null)
    setCurrentSpeaker(null)
    setError(null)
    setStatus('ready')
  }, [cancelActive, cancelPrefetch])

  /** 一覧から任意の同梱レッスンを選ぶ。 */
  const startCurriculumLesson = useCallback((lessonId: string) => {
    const lesson = lessonsRef.current.find((item) => item.id === lessonId)
    if (!lesson) {
      setError(new Error(`レッスンが見つかりません: ${lessonId}`))
      return
    }
    if (!isLessonAudioReady(manifestRef.current, lesson.id)) {
      setError(new Error(`「${lesson.scene_ja}」の音声はまだ用意されていません`))
      return
    }
    prepareCurriculumLesson(lesson)
  }, [prepareCurriculumLesson])

  const startDialogueLesson = useCallback(async (sceneJa: string) => {
    const userId = userIdRef.current
    const scene = sceneJa.trim()
    if (!userId || !scene || status === 'generating') {
      return
    }

    cancelActive()
    cancelPrefetch()
    const controller = new AbortController()
    generationAbortRef.current = controller
    setMode('dialogue')
    setDialogue(null)
    setCurriculumLesson(null)
    setAudioProgress(null)
    setSteps([])
    setError(null)
    setStatus('generating')

    try {
      const generated = await generateDialogue({
        lang,
        sceneJa: scene,
        interests: settingsRef.current.interests,
        knownWords: knownWordsRef.current,
        level: lang === 'en' ? 'practical-b1' : 'beginner',
        targets: chunkContextRef.current?.targets ?? [],
      }, { signal: controller.signal })
      const saved = await saveLessonDialogue({
        user_id: userId,
        lang,
        scene_ja: generated.dialogue.scene_ja,
        title_ja: generated.dialogue.title_ja,
        dialogue: generated.dialogue.turns,
        new_expressions: generated.dialogue.new_expressions,
      })

      if (controller.signal.aborted || !mountedRef.current) {
        return
      }

      const built = buildDialogueLesson(generated.dialogue, {
        lang,
        pauseSeconds: settingsRef.current.lessonPauseSeconds,
        currentWeek: currentWeekRef.current,
      })
      dialogueIdRef.current = saved.id
      completionRunRef.current = null
      setDialogue(generated.dialogue)
      setSteps(built.steps)
      setCurrentIndex(0)
      setStatus('ready')
    } catch (generationError) {
      if (!controller.signal.aborted && mountedRef.current) {
        console.error('会話の生成に失敗しました', generationError)
        setError(generationError)
        setStatus('choosing')
      }
    } finally {
      if (generationAbortRef.current === controller) {
        generationAbortRef.current = null
      }
    }
  }, [cancelActive, cancelPrefetch, lang, status])

  /** 自由な場面(Gemini 生成)を選ぶ画面へ。 */
  const chooseFreeScene = useCallback(() => {
    cancelActive()
    cancelPrefetch()
    setMode('dialogue')
    setDialogue(null)
    setCurriculumLesson(null)
    setAudioProgress(null)
    dialogueIdRef.current = null
    setSteps([])
    setCurrentIndex(0)
    setCurrentAction(null)
    setCurrentSpokenText(null)
    setCurrentSpeaker(null)
    setError(null)
    setStatus('choosing')
  }, [cancelActive, cancelPrefetch])

  /** 今日のレッスン(次のレッスン)に戻る。 */
  const chooseCurriculum = useCallback(() => {
    const next = curriculum?.next
    if (next) {
      prepareCurriculumLesson(next.lesson)
    }
  }, [curriculum, prepareCurriculumLesson])

  const beginRun = useCallback((nextSteps: RunnableLessonStep[], checkBrowserVoices: boolean) => {
    setSteps(nextSteps)
    const nextWarnings: string[] = []
    if (checkBrowserVoices) {
      const japaneseVoiceAvailable = hasVoiceFor('ja')
      japaneseVoiceAvailableRef.current = japaneseVoiceAvailable
      if (!japaneseVoiceAvailable) {
        nextWarnings.push('日本語の読み上げ音声が見つかりません。問いは画面の文字で確認してください')
      }
      if (!hasVoiceFor(lang)) {
        nextWarnings.push(`${lang === 'en' ? '英語' : '韓国語'}の読み上げ音声が見つかりません`)
      }
    } else {
      japaneseVoiceAvailableRef.current = true
    }
    setWarnings(nextWarnings)
    consecutiveSpeechFailuresRef.current = 0
    lessonRunRef.current += 1
    actionIndexRef.current = 0
    setCurrentIndex(0)
    setCurrentAction(null)
    setCurrentSpokenText(null)
    setCurrentSpeaker(null)
    setElapsedMs(0)
    setRecallResults([])
    setSelfReport(null)
    setPassed(null)
    setError(null)
    setPaused(false)
    setAutoPaused(false)
    startedAtRef.current = Date.now()
    setStatus('running')
  }, [lang])

  const start = useCallback(async () => {
    if (status !== 'ready' && status !== 'finished') {
      return
    }
    unlockAudio()

    if (mode === 'curriculum') {
      const lesson = curriculumLesson
      if (!lesson) {
        return
      }
      const nextSteps = buildDialogueLesson(lesson.dialogue, {
        lang,
        pauseSeconds: settingsRef.current.lessonPauseSeconds,
        currentWeek: currentWeekRef.current,
        review: lesson.review,
      }).steps
      cancelActive()
      setSteps(nextSteps)
      setError(null)
      setStatus('preparing')

      // 進み具合の行(無くても練習はできる。保存できない旨だけ知らせる)
      const userId = userIdRef.current
      if (userId && !dialogueIdRef.current) {
        try {
          const row = await ensureCurriculumDialogue({
            user_id: userId,
            lang,
            curriculum_id: lesson.id,
            scene_ja: lesson.dialogue.scene_ja,
            title_ja: lesson.dialogue.title_ja,
            dialogue: lesson.dialogue.turns,
            new_expressions: lesson.dialogue.new_expressions,
          })
          dialogueIdRef.current = row.id
          completionRunRef.current = null
        } catch (dbError) {
          console.error('レッスンの進み具合の行を用意できませんでした', dbError)
          if (mountedRef.current) {
            setError(curriculumDbError(dbError))
          }
        }
      }

      // 音声がすべて端末にそろってから始める(途切れないように)
      const prefetch = prefetchRef.current
      const prefetchError = prefetch && prefetch.lessonId === lesson.id
        ? await prefetch.result
        : new Error('音声の準備が始まっていません。レッスンを選び直してください')
      if (!mountedRef.current) {
        return
      }
      if (prefetchError) {
        setError(prefetchError)
        setStatus('ready')
        return
      }
      beginRun(nextSteps, false)
      return
    }

    const nextSteps = mode === 'dialogue' && dialogue
      ? buildDialogueLesson(dialogue, {
          lang,
          pauseSeconds: settingsRef.current.lessonPauseSeconds,
          currentWeek: currentWeekRef.current,
        }).steps
      : steps
    if (nextSteps.length === 0) {
      return
    }

    cancelActive()
    beginRun(nextSteps, settingsRef.current.ttsProvider !== 'gemini')
  }, [beginRun, cancelActive, curriculumLesson, dialogue, lang, mode, status, steps])

  /** 音声の準備をやり直す(取得に失敗したとき)。 */
  const retryAudio = useCallback(() => {
    if (curriculumLesson) {
      prepareCurriculumLesson(curriculumLesson)
    }
  }, [curriculumLesson, prepareCurriculumLesson])

  const pause = useCallback(() => {
    if (status !== 'running' || paused) {
      return
    }
    cancelActive()
    updateElapsed()
    setCurrentAction(null)
    setCurrentSpokenText(null)
    setCurrentSpeaker(null)
    setPaused(true)
  }, [cancelActive, paused, status, updateElapsed])

  const resume = useCallback(() => {
    if (status !== 'running' || !paused) {
      return
    }
    unlockAudio()
    generationRef.current += 1
    setError(null)
    setAutoPaused(false)
    setPaused(false)
  }, [paused, status])

  useEffect(() => {
    if (status !== 'running' || paused) {
      return undefined
    }

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        return
      }
      cancelActive()
      updateElapsed()
      setCurrentAction(null)
      setCurrentSpokenText(null)
      setCurrentSpeaker(null)
      setAutoPaused(true)
      setPaused(true)
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [cancelActive, paused, status, updateElapsed])

  const skip = useCallback(() => {
    if (status !== 'running') {
      return
    }
    cancelActive()
    updateElapsed()
    actionIndexRef.current = 0
    setCurrentAction(null)
    setCurrentSpokenText(null)
    setCurrentSpeaker(null)
    if (currentIndex + 1 >= steps.length) {
      setPaused(false)
      setStatus('finished')
    } else {
      setCurrentIndex((index) => index + 1)
    }
  }, [cancelActive, currentIndex, status, steps.length, updateElapsed])

  const seekTo = useCallback((index: number) => {
    if (status !== 'running' || steps.length === 0) {
      return
    }
    const nextIndex = Math.max(0, Math.min(index, steps.length - 1))
    cancelActive()
    updateElapsed()
    actionIndexRef.current = 0
    setCurrentAction(null)
    setCurrentSpokenText(null)
    setCurrentSpeaker(null)
    setCurrentIndex(nextIndex)
  }, [cancelActive, status, steps.length, updateElapsed])

  const seekBy = useCallback((deltaMs: number) => {
    seekTo(stepAtOffset(stepStarts, currentIndex, deltaMs))
  }, [currentIndex, seekTo, stepStarts])

  const stop = useCallback(() => {
    if (status !== 'running') {
      return
    }
    cancelActive()
    updateElapsed()
    actionIndexRef.current = 0
    setCurrentAction(null)
    setCurrentSpokenText(null)
    setCurrentSpeaker(null)
    setPaused(false)
    setStatus('finished')
  }, [cancelActive, status, updateElapsed])

  // Gemini の声のとき、今のステップで読む文を先に作っておく(同梱レッスンは事前合成済みなので不要)
  useEffect(() => {
    if (status !== 'running' || mode === 'curriculum' || !currentStep || !isDialogueStep(currentStep)) {
      return
    }
    const items = currentStep.actions.flatMap((action) => (
      action.type === 'speak'
        ? [{
            text: action.text,
            lang: action.lang,
            speaker: (action.lang === 'ja' ? 'narrator' : action.voice === 'B' ? 'B' : 'A') as 'A' | 'B' | 'narrator',
          }]
        : []
    ))
    void prefetchSpeech(items)
  }, [currentStep, mode, status])

  const estimatedMinutes = useMemo(() => {
    if (steps.length === 0) {
      return 0
    }
    const seconds = steps.reduce((total, step) => (
      total + ('actions' in step ? estimateActionsMs(step.actions) / 1000 : settings.lessonPauseSeconds * 1.5 + 6)
    ), 0)
    return Math.max(1, Math.ceil(seconds / 60))
  }, [settings.lessonPauseSeconds, steps])

  // 応用の合図(組み替え練習)だけの正答率。Pimsleur の「8 割できたら次へ」の判断に使う。
  const promptResults = recallResults.filter((result) => result.itemId.startsWith(PROMPT_ITEM_PREFIX))
  const promptAccuracy = promptResults.length > 0
    ? { matched: promptResults.filter((result) => result.matched).length, total: promptResults.length }
    : null

  /** 今の同梱レッスンの位置と、合格後に出す次のレッスン。 */
  const currentCurriculumStatus = curriculum && curriculumLesson
    ? curriculum.statuses.find((item) => item.lesson.id === curriculumLesson.id) ?? null
    : null
  const nextCurriculumStatus = curriculum && curriculumLesson
    ? lessonAfter(curriculum.statuses, curriculumLesson.id)
    : null
  const promptCount = curriculumLesson
    ? curriculumLesson.dialogue.turns.reduce((total, turn) => total + (turn.prompts?.length ?? 0), 0)
    : 0
  const currentSectionIndex = sectionIndexOf(sections, currentIndex)

  return {
    mode,
    status,
    steps,
    currentIndex,
    sections,
    currentSectionIndex,
    currentStep,
    currentAction,
    currentSpokenText,
    currentStepLabel: currentStep && isDialogueStep(currentStep)
      ? currentStep.label
      : null,
    currentSpeaker,
    dialogue,
    upcomingPrepEvents,
    estimatedMinutes,
    elapsedMs,
    paused,
    autoPaused,
    curriculum,
    curriculumLesson,
    currentCurriculumStatus,
    nextCurriculumStatus,
    promptCount,
    audioProgress,
    selfReport,
    passed,
    reporting,
    selectWordLesson,
    startCurriculumLesson,
    startDialogueLesson,
    chooseFreeScene,
    chooseDifferentScene: chooseFreeScene,
    chooseCurriculum,
    reportSelfAssessment,
    retryAudio,
    start,
    pause,
    resume,
    seekTo,
    seekBy,
    skip,
    stop,
    recallResults,
    promptAccuracy,
    warnings,
    error,
    clearError: () => setError(null),
  }
}
