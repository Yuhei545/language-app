import { useCallback, useEffect, useRef, useState } from 'react'
import type { CoreFrame, CoreVocab, CoreWord } from '../../content/coreSchema'
import { loadCore } from '../../content/coreSchema'
import { checkMixingTurn } from '../../services/gemini/parent'
import { transcribeAudio } from '../../services/gemini/transcribe'
import {
  createSpeechInput,
  speak,
  stopSpeaking,
  unlockAudio,
  type SpeechInput,
} from '../../services/speech'
import {
  getSettings,
  setSettings,
  subscribe,
  type MixingLevel,
  type Settings,
} from '../../services/settings'
import { getSession } from '../../services/supabase/auth'
import {
  listMixingProgress,
  upsertMixingProgress,
} from '../../services/supabase/db'
import type { MixingProgressRow } from '../../services/supabase/types'
import { countCombinations, slotPool, wordCount } from './combinations'
import { comboKey, deal, type Deal } from './deal'
import { renderHint, renderPattern } from './particles'

export type MixingStatus =
  | 'idle'
  | 'dealt'
  | 'recording'
  | 'checking'
  | 'feedback'
  | 'fluency-recording'
  | 'fluency-done'

export type MixingFeedback = {
  understood: boolean
  recast: string
  ja: string
  learnerText: string
  durationMs: number
}

export type FluencyResult = {
  previousDurationMs: number
  currentDurationMs: number
  faster: boolean
}

type ProgressIdentity = {
  frameId: string
  verbText: string
  nounText: string
}

function identityKey(identity: ProgressIdentity): string {
  return JSON.stringify([identity.frameId, identity.verbText, identity.nounText])
}

function progressIdentity(core: CoreVocab, frame: CoreFrame, words: CoreWord[]): ProgressIdentity {
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

function buildDealHistory(
  core: CoreVocab,
  progressRows: MixingProgressRow[],
): Map<string, { attempt_count: number; understood_count: number }> {
  const progressByIdentity = new Map(
    progressRows.map((row) => [identityKey({
      frameId: row.frame_id,
      verbText: row.verb_text,
      nounText: row.noun_text,
    }), row]),
  )
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

function microphoneError(error: unknown): Error {
  if (
    error instanceof DOMException
    && (error.name === 'NotAllowedError' || error.name === 'SecurityError')
  ) {
    return new Error('マイクの使用が許可されていません')
  }

  return error instanceof Error ? error : new Error(String(error))
}

export function useMixingSession(lang: 'en' | 'ko') {
  const [settings, setSettingsState] = useState<Settings>(getSettings)
  const settingsRef = useRef(settings)
  const [core, setCore] = useState<CoreVocab | null>(null)
  const [status, setStatus] = useState<MixingStatus>('idle')
  const [currentDeal, setCurrentDeal] = useState<Deal | null>(null)
  const [feedback, setFeedback] = useState<MixingFeedback | null>(null)
  const [fluency, setFluency] = useState<FluencyResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [isStartingFluency, setIsStartingFluency] = useState(false)
  const [sttEngine, setSttEngine] = useState<'webspeech' | 'gemini' | null>(null)
  const [error, setError] = useState<unknown>(null)
  const userIdRef = useRef<string | null>(null)
  const historyRef = useRef(new Map<string, { attempt_count: number; understood_count: number }>())
  const progressRef = useRef(new Map<string, MixingProgressRow>())
  const inputRef = useRef<SpeechInput | null>(null)
  const recordingStartedAtRef = useRef<number | null>(null)
  const fluencyRecorderRef = useRef<MediaRecorder | null>(null)
  const fluencyStreamRef = useRef<MediaStream | null>(null)
  const fluencyStartedAtRef = useRef<number | null>(null)
  const fluencyStartingRef = useRef(false)

  const captureError = useCallback((caught: unknown) => {
    setError(caught ?? new Error('不明なエラーが発生しました'))
  }, [])

  const releaseFluencyRecorder = useCallback((): unknown | null => {
    const recorder = fluencyRecorderRef.current
    let stopError: unknown | null = null
    if (recorder && (recorder.state === 'recording' || recorder.state === 'paused')) {
      try {
        recorder.stop()
      } catch (caught) {
        stopError = caught
        console.error('流暢さ練習の録音を停止できませんでした', caught)
      }
    }
    fluencyStreamRef.current?.getTracks().forEach((track) => track.stop())
    fluencyRecorderRef.current = null
    fluencyStreamRef.current = null
    fluencyStartedAtRef.current = null
    return stopError
  }, [])

  useEffect(() => subscribe((nextSettings) => {
    settingsRef.current = nextSettings
    setSettingsState(nextSettings)
  }), [])

  useEffect(() => {
    let active = true
    inputRef.current?.cancel()
    inputRef.current = null
    releaseFluencyRecorder()
    userIdRef.current = null
    historyRef.current = new Map()
    progressRef.current = new Map()
    setCore(null)
    setStatus('idle')
    setCurrentDeal(null)
    setFeedback(null)
    setFluency(null)
    setIsStartingFluency(false)
    setSttEngine(null)
    setError(null)
    setLoading(true)

    const load = async () => {
      try {
        const loadedCore = loadCore(lang)
        const authSession = await getSession()
        if (!authSession) {
          throw new Error('ログイン情報を確認できませんでした')
        }

        const rows = await listMixingProgress(authSession.user.id, lang)
        if (active) {
          userIdRef.current = authSession.user.id
          progressRef.current = new Map(rows.map((row) => [identityKey({
            frameId: row.frame_id,
            verbText: row.verb_text,
            nounText: row.noun_text,
          }), row]))
          historyRef.current = buildDealHistory(loadedCore, rows)
          setCore(loadedCore)
        }
      } catch (loadError) {
        if (active) {
          captureError(loadError)
        }
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }

    void load()
    return () => {
      active = false
      inputRef.current?.cancel()
      inputRef.current = null
      releaseFluencyRecorder()
    }
  }, [captureError, lang, releaseFluencyRecorder])

  const speakText = useCallback(async (text: string) => {
    setIsSpeaking(true)
    try {
      await speak(text, {
        lang,
        rate: settingsRef.current.ttsRate,
        voiceURI: settingsRef.current.ttsVoice[lang],
      })
    } catch (speechError) {
      captureError(speechError)
    } finally {
      setIsSpeaking(false)
    }
  }, [captureError, lang])

  const next = useCallback(() => {
    if (
      !core
      || loading
      || isSpeaking
      || isStartingFluency
      || fluencyStartingRef.current
      || status === 'recording'
      || status === 'checking'
      || status === 'fluency-recording'
    ) {
      return
    }

    try {
      unlockAudio()
      stopSpeaking()
      const nextDeal = deal({
        core,
        level: settingsRef.current.mixingLevel,
        history: historyRef.current,
        avoidKey: currentDeal?.key,
      })
      setCurrentDeal(nextDeal)
      setFeedback(null)
      setFluency(null)
      setSttEngine(null)
      setError(null)
      setStatus('dealt')
    } catch (dealError) {
      captureError(dealError)
    }
  }, [captureError, core, currentDeal?.key, isSpeaking, isStartingFluency, loading, status])

  const startRecording = useCallback(async () => {
    const canStart = status === 'dealt' || (status === 'feedback' && feedback?.understood === false)
    if (!currentDeal || !canStart || inputRef.current || isSpeaking) {
      return
    }

    const returnStatus = status
    setError(null)
    setStatus('recording')

    try {
      unlockAudio()
      const input = createSpeechInput({
        lang,
        engine: settingsRef.current.sttEngine,
        transcribe: transcribeAudio,
      })
      inputRef.current = input
      setSttEngine(input.engine)
      await input.start()
      recordingStartedAtRef.current = Date.now()
      if (returnStatus === 'feedback') {
        setFeedback(null)
      }
    } catch (recordingError) {
      inputRef.current?.cancel()
      inputRef.current = null
      recordingStartedAtRef.current = null
      captureError(recordingError)
      setStatus(returnStatus)
    }
  }, [captureError, currentDeal, feedback?.understood, isSpeaking, lang, status])

  const stopRecording = useCallback(async () => {
    const input = inputRef.current
    const userId = userIdRef.current
    const startedAt = recordingStartedAtRef.current
    if (!input || !userId || !core || !currentDeal || status !== 'recording' || startedAt === null) {
      return
    }

    const durationMs = Math.max(0, Date.now() - startedAt)
    setStatus('checking')

    try {
      const result = await input.stop()
      inputRef.current = null
      recordingStartedAtRef.current = null
      setSttEngine(result.engine)
      const learnerText = result.text.trim()
      if (!learnerText) {
        throw new Error('音声を聞き取れませんでした。もう一度ゆっくり話してみてください')
      }

      const intendedMeaningJa = renderHint(currentDeal.frame, currentDeal.words)
      const checked = await checkMixingTurn({
        lang,
        personaName: settingsRef.current.parentName[lang],
        intendedMeaningJa,
        learnerText,
      })
      const identity = progressIdentity(core, currentDeal.frame, currentDeal.words)
      const key = identityKey(identity)
      const previous = progressRef.current.get(key)
      const updated = await upsertMixingProgress({
        user_id: userId,
        lang,
        frame_id: identity.frameId,
        verb_text: identity.verbText,
        noun_text: identity.nounText,
        understood_count: (previous?.understood_count ?? 0) + (checked.understood ? 1 : 0),
        attempt_count: (previous?.attempt_count ?? 0) + 1,
        last_at: new Date().toISOString(),
      })
      progressRef.current.set(key, updated)
      historyRef.current = buildDealHistory(core, [...progressRef.current.values()])

      const nextFeedback: MixingFeedback = {
        ...checked,
        learnerText,
        durationMs,
      }
      setFeedback(nextFeedback)
      setFluency(null)
      setStatus('feedback')
      await speakText(nextFeedback.recast)
    } catch (checkError) {
      inputRef.current?.cancel()
      inputRef.current = null
      recordingStartedAtRef.current = null
      captureError(checkError)
      setStatus('dealt')
    }
  }, [captureError, core, currentDeal, lang, speakText, status])

  const hearRecast = useCallback(async () => {
    if (!feedback || (status !== 'feedback' && status !== 'fluency-done') || isSpeaking) {
      return
    }
    await speakText(feedback.recast)
  }, [feedback, isSpeaking, speakText, status])

  const hearOneWay = useCallback(async () => {
    if (!currentDeal || !feedback || (status !== 'feedback' && status !== 'fluency-done') || isSpeaking) {
      return
    }

    try {
      await speakText(renderPattern(currentDeal.frame, currentDeal.words))
    } catch (renderError) {
      captureError(renderError)
    }
  }, [captureError, currentDeal, feedback, isSpeaking, speakText, status])

  const startFluency = useCallback(async () => {
    if (
      status !== 'feedback'
      || !feedback?.understood
      || !currentDeal
      || isSpeaking
      || fluencyStartingRef.current
    ) {
      return
    }

    setError(null)
    fluencyStartingRef.current = true
    setIsStartingFluency(true)

    try {
      unlockAudio()
      stopSpeaking()
      if (
        typeof navigator === 'undefined'
        || !navigator.mediaDevices?.getUserMedia
        || typeof MediaRecorder === 'undefined'
      ) {
        throw new Error('この端末では録音が使えません')
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)
      fluencyStreamRef.current = stream
      fluencyRecorderRef.current = recorder
      recorder.onerror = (event) => {
        const recorderError = (event as Event & { error?: DOMException }).error
        captureError(recorderError ?? new Error('流暢さ練習の録音中にエラーが発生しました'))
        releaseFluencyRecorder()
        setStatus('feedback')
      }
      recorder.start()
      fluencyStartedAtRef.current = Date.now()
      setStatus('fluency-recording')
    } catch (recordingError) {
      releaseFluencyRecorder()
      captureError(microphoneError(recordingError))
      setStatus('feedback')
    } finally {
      fluencyStartingRef.current = false
      setIsStartingFluency(false)
    }
  }, [captureError, currentDeal, feedback?.understood, isSpeaking, releaseFluencyRecorder, status])

  const stopFluency = useCallback(() => {
    const startedAt = fluencyStartedAtRef.current
    if (status !== 'fluency-recording' || !feedback || startedAt === null) {
      return
    }

    const durationMs = Math.max(0, Date.now() - startedAt)
    const stopError = releaseFluencyRecorder()
    if (stopError) {
      captureError(stopError)
      setStatus('feedback')
      return
    }
    setFluency({
      previousDurationMs: feedback.durationMs,
      currentDurationMs: durationMs,
      faster: durationMs < feedback.durationMs,
    })
    setStatus('fluency-done')
  }, [captureError, feedback, releaseFluencyRecorder, status])

  const setLevel = useCallback((level: MixingLevel) => {
    try {
      setSettings({ mixingLevel: level })
    } catch (settingsError) {
      captureError(settingsError)
    }
  }, [captureError])

  return {
    status,
    loading,
    level: settings.mixingLevel,
    totalWords: core ? wordCount(core) : 0,
    totalCombinations: core ? countCombinations(core) : 0,
    currentDeal,
    intendedMeaning: currentDeal ? renderHint(currentDeal.frame, currentDeal.words) : '',
    feedback,
    fluency,
    sttEngine,
    isSpeaking,
    isStartingFluency,
    error,
    next,
    startRecording,
    stopRecording,
    hearRecast,
    hearOneWay,
    startFluency,
    stopFluency,
    setLevel,
    clearError: () => setError(null),
  }
}
