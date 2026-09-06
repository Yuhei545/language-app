import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CoreFrame, CoreVocab, CoreWord } from '../../content/coreSchema'
import { loadCore } from '../../content/coreSchema'
import { generateDialogue } from '../../services/gemini/dialogue'
import {
  hasVoiceFor,
  prefetchSpeech,
  speak,
  stopSpeaking,
} from '../../services/speech'
import { getSettings, subscribe, type Settings } from '../../services/settings'
import { getSession } from '../../services/supabase/auth'
import {
  getLanguageProgress,
  getVocabProgress,
  listMixingProgress,
  listPrepEvents,
  listVocabItems,
  markDialogueCompleted,
  saveLessonDialogue,
  upsertVocabItems,
} from '../../services/supabase/db'
import type {
  LessonDialogueRow,
  MixingProgressRow,
  PrepEventRow,
} from '../../services/supabase/types'
import { selectDueCards, type SrsState } from '../cards/srs'
import { comboKey } from '../mixing/deal'
import { slotPool } from '../mixing/combinations'
import { buildDialogueLesson, PROMPT_ITEM_PREFIX, type DialogueLessonStep } from './dialoguePlan'
import { estimateActionsMs } from './estimate'
import type { LessonDialogue } from './lessonDialogueSchema'
import { buildLessonItems } from './material'
import { planStep, type LessonAction } from './plan'
import { buildSchedule } from './schedule'
import type { LessonStep } from './types'

export type LessonStatus = 'loading' | 'choosing' | 'generating' | 'ready' | 'running' | 'finished'
export type LessonMode = 'words' | 'dialogue'
export type CurrentLessonAction = 'cue' | 'pause' | 'answer' | null
export type CurrentLessonSpeaker = 'A' | 'B' | 'you' | null
type RunnableLessonStep = LessonStep | DialogueLessonStep

export type LessonRecallResult = {
  itemId: string
  stage: LessonStep['stage']
  matched: boolean
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
  const [recallResults, setRecallResults] = useState<LessonRecallResult[]>([])
  const [error, setError] = useState<unknown>(null)
  const [warnings, setWarnings] = useState<string[]>([])
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

  const currentStep = steps[currentIndex] ?? null

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

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      cancelActive()
    }
  }, [cancelActive])

  useEffect(() => {
    let active = true
    cancelActive()
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
        const [vocabProgress, prepGroups] = await Promise.all([
          getVocabProgress(userId, vocabItems.map((item) => item.id)),
          Promise.all(upcomingEvents.map(
            (event) => listVocabItems(userId, lang, { prepEventId: event.id }),
          )),
        ])
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
        ]))

        if (active) {
          userIdRef.current = userId
          currentWeekRef.current = currentWeek
          knownWordsRef.current = knownWords
          wordStepsRef.current = nextSteps
          setUpcomingPrepEvents(upcomingEvents)

          if (initialDialogue) {
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
          } else {
            setSteps([])
            setStatus('choosing')
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
    }
  }, [cancelActive, initialDialogue, lang])

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
    const runId = lessonRunRef.current

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
          if (action.lang === 'ja' && !japaneseVoiceAvailableRef.current) {
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
                speaker: action.voice === 'B' ? 'B' : 'A',
              })
              consecutiveSpeechFailuresRef.current = 0
            } catch (speechError) {
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
    currentStep,
    lang,
    paused,
    settings.lessonPauseSeconds,
    settings.lessonRecording,
    status,
    steps.length,
    updateElapsed,
    wait,
  ])

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

  const selectWordLesson = useCallback(() => {
    cancelActive()
    setMode('words')
    setDialogue(null)
    dialogueIdRef.current = null
    setSteps(wordStepsRef.current)
    setCurrentIndex(0)
    setCurrentAction(null)
    setCurrentSpokenText(null)
    setCurrentSpeaker(null)
    setError(null)
    setStatus('ready')
  }, [cancelActive])

  const startDialogueLesson = useCallback(async (sceneJa: string) => {
    const userId = userIdRef.current
    const scene = sceneJa.trim()
    if (!userId || !scene || status === 'generating') {
      return
    }

    cancelActive()
    const controller = new AbortController()
    generationAbortRef.current = controller
    setMode('dialogue')
    setDialogue(null)
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
  }, [cancelActive, lang, status])

  const chooseDifferentScene = useCallback(() => {
    cancelActive()
    setMode('dialogue')
    setDialogue(null)
    dialogueIdRef.current = null
    setSteps([])
    setCurrentIndex(0)
    setCurrentAction(null)
    setCurrentSpokenText(null)
    setCurrentSpeaker(null)
    setError(null)
    setStatus('choosing')
  }, [cancelActive])

  const start = useCallback(() => {
    if (status !== 'ready' && status !== 'finished') {
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
    setSteps(nextSteps)
    const japaneseVoiceAvailable = hasVoiceFor('ja')
    japaneseVoiceAvailableRef.current = japaneseVoiceAvailable
    const nextWarnings: string[] = []
    if (!japaneseVoiceAvailable) {
      nextWarnings.push('日本語の読み上げ音声が見つかりません。問いは画面の文字で確認してください')
    }
    if (!hasVoiceFor(lang)) {
      nextWarnings.push(`${lang === 'en' ? '英語' : '韓国語'}の読み上げ音声が見つかりません`)
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
    setError(null)
    setPaused(false)
    startedAtRef.current = Date.now()
    setStatus('running')
  }, [cancelActive, dialogue, lang, mode, status, steps])

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
    generationRef.current += 1
    setError(null)
    setPaused(false)
  }, [paused, status])

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

  // Gemini の声のとき、今のステップで読む文を先に作っておく(キャッシュ済みなら何もしない)
  useEffect(() => {
    if (status !== 'running' || !currentStep || !isDialogueStep(currentStep)) {
      return
    }
    const items = currentStep.actions.flatMap((action) => (
      action.type === 'speak' && action.lang !== 'ja'
        ? [{ text: action.text, lang: action.lang, speaker: (action.voice === 'B' ? 'B' : 'A') as 'A' | 'B' }]
        : []
    ))
    void prefetchSpeech(items)
  }, [currentStep, status])

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

  return {
    mode,
    status,
    steps,
    currentIndex,
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
    selectWordLesson,
    startDialogueLesson,
    chooseDifferentScene,
    start,
    pause,
    resume,
    skip,
    stop,
    recallResults,
    promptAccuracy,
    warnings,
    error,
    clearError: () => setError(null),
  }
}
