import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CoreFrame, CoreVocab, CoreWord } from '../../content/coreSchema'
import { loadCore } from '../../content/coreSchema'
import { transcribeAudio } from '../../services/gemini/transcribe'
import {
  createSpeechInput,
  hasVoiceFor,
  speak,
  stopSpeaking,
  type SpeechInput,
} from '../../services/speech'
import { getSettings, subscribe, type Settings } from '../../services/settings'
import { getSession } from '../../services/supabase/auth'
import {
  getVocabProgress,
  listMixingProgress,
  listPrepEvents,
  listVocabItems,
} from '../../services/supabase/db'
import type { MixingProgressRow } from '../../services/supabase/types'
import { scorePronunciation } from '../cards/scoring'
import { selectDueCards, type SrsState } from '../cards/srs'
import { comboKey } from '../mixing/deal'
import { slotPool } from '../mixing/combinations'
import { buildLessonItems } from './material'
import { planStep, type LessonAction } from './plan'
import { buildSchedule } from './schedule'
import type { LessonStep } from './types'

export type LessonStatus = 'loading' | 'ready' | 'running' | 'finished'
export type CurrentLessonAction = 'cue' | 'pause' | 'answer' | null

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

export function useLesson(lang: 'en' | 'ko') {
  const [settings, setSettingsState] = useState<Settings>(getSettings)
  const settingsRef = useRef(settings)
  const [status, setStatus] = useState<LessonStatus>('loading')
  const [steps, setSteps] = useState<LessonStep[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [currentAction, setCurrentAction] = useState<CurrentLessonAction>(null)
  const [elapsedMs, setElapsedMs] = useState(0)
  const [paused, setPaused] = useState(false)
  const [recallResults, setRecallResults] = useState<LessonRecallResult[]>([])
  const [error, setError] = useState<unknown>(null)
  const [warnings, setWarnings] = useState<string[]>([])
  const generationRef = useRef(0)
  const actionIndexRef = useRef(0)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const resolveTimeoutRef = useRef<(() => void) | null>(null)
  const inputRef = useRef<SpeechInput | null>(null)
  const startedAtRef = useRef<number | null>(null)
  const lessonRunRef = useRef(0)
  const mountedRef = useRef(true)
  const japaneseVoiceAvailableRef = useRef(true)
  const consecutiveSpeechFailuresRef = useRef(0)

  const currentStep = steps[currentIndex] ?? null

  const updateElapsed = useCallback(() => {
    if (startedAtRef.current !== null) {
      setElapsedMs(Math.max(0, Date.now() - startedAtRef.current))
    }
  }, [])

  const cancelActive = useCallback(() => {
    generationRef.current += 1
    stopSpeaking()

    if (timeoutRef.current !== null) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
    const resolveTimeout = resolveTimeoutRef.current
    resolveTimeoutRef.current = null
    resolveTimeout?.()

    inputRef.current?.cancel()
    inputRef.current = null
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
    setElapsedMs(0)
    setPaused(false)
    setRecallResults([])
    setError(null)
    setWarnings([])
    consecutiveSpeechFailuresRef.current = 0

    const load = async () => {
      try {
        const authSession = await getSession()
        if (!authSession) {
          throw new Error('ログイン情報を確認できませんでした')
        }

        const userId = authSession.user.id
        const core = loadCore(lang)
        const [vocabItems, mixingRows, prepEvents] = await Promise.all([
          listVocabItems(userId, lang),
          listMixingProgress(userId, lang),
          listPrepEvents(userId, lang),
        ])
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

        if (active) {
          setSteps(nextSteps)
          setStatus('ready')
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
  }, [cancelActive, lang])

  useEffect(() => {
    if (status !== 'running' || paused || !currentStep) {
      return undefined
    }

    const generation = generationRef.current
    const actions = planStep(currentStep, {
      lang,
      pauseSeconds: settings.lessonPauseSeconds,
    })
    const runId = lessonRunRef.current

    const runPause = async (action: Extract<LessonAction, { type: 'pause' }>) => {
      let input: SpeechInput | null = null
      if (action.recordable && settingsRef.current.lessonRecording) {
        try {
          input = createSpeechInput({
            lang,
            engine: settingsRef.current.sttEngine,
            transcribe: transcribeAudio,
          })
          inputRef.current = input
          await input.start()
          if (generationRef.current !== generation) {
            input.cancel()
            return
          }
        } catch (recordingError) {
          inputRef.current?.cancel()
          inputRef.current = null
          input = null
          console.error('音声レッスンの録音を開始できませんでした', recordingError)
        }
      }

      if (generationRef.current !== generation) {
        return
      }
      await wait(action.ms)
      if (generationRef.current !== generation) {
        return
      }

      if (input) {
        inputRef.current = null
        try {
          const transcription = input.stop()
          void transcription.then((result) => {
            const score = scorePronunciation(
              result.text,
              { text: currentStep.item.answer, example: '' },
              lang,
            )
            if (mountedRef.current && lessonRunRef.current === runId) {
              setRecallResults((current) => [...current, {
                itemId: currentStep.item.id,
                stage: currentStep.stage,
                matched: score.matched,
              }])
            }
          }).catch((recordingError) => {
            console.error('音声レッスンの録音を確認できませんでした', recordingError)
          })
        } catch (recordingError) {
          console.error('音声レッスンの録音を停止できませんでした', recordingError)
        }
      }
    }

    const run = async () => {
      for (let index = actionIndexRef.current; index < actions.length; index += 1) {
        if (generationRef.current !== generation) {
          return
        }

        const action = actions[index]
        setCurrentAction(actionLabel(action))

        if (action.type === 'speak') {
          if (action.lang === 'ja' && !japaneseVoiceAvailableRef.current) {
            await wait(1_500)
          } else {
            try {
              await speak(action.text, {
                lang: action.lang,
                rate: action.rate ?? (action.lang === 'ja' ? undefined : settingsRef.current.ttsRate),
                voiceURI: action.lang === 'ja' ? undefined : settingsRef.current.ttsVoice[lang],
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

  const start = useCallback(() => {
    if (status !== 'ready' && status !== 'finished') {
      return
    }
    if (steps.length === 0) {
      return
    }

    cancelActive()
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
    setElapsedMs(0)
    setRecallResults([])
    setError(null)
    setPaused(false)
    startedAtRef.current = Date.now()
    setStatus('running')
  }, [cancelActive, lang, status, steps.length])

  const pause = useCallback(() => {
    if (status !== 'running' || paused) {
      return
    }
    cancelActive()
    updateElapsed()
    setCurrentAction(null)
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
    setPaused(false)
    setStatus('finished')
  }, [cancelActive, status, updateElapsed])

  const estimatedMinutes = useMemo(() => {
    if (steps.length === 0) {
      return 0
    }
    const seconds = steps.length * (settings.lessonPauseSeconds * 1.5 + 6)
    return Math.max(1, Math.ceil(seconds / 60))
  }, [settings.lessonPauseSeconds, steps.length])

  return {
    status,
    steps,
    currentIndex,
    currentStep,
    currentAction,
    estimatedMinutes,
    elapsedMs,
    paused,
    start,
    pause,
    resume,
    skip,
    stop,
    recallResults,
    warnings,
    error,
    clearError: () => setError(null),
  }
}
