import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { loadDictation, type DictationSentence } from '../../content/dictationSchema'
import { speak, unlockAudio } from '../../services/speech'
import { getSettings, subscribe, type Settings } from '../../services/settings'
import { getSession } from '../../services/supabase/auth'
import {
  listDictationProgress,
  upsertDictationProgress,
} from '../../services/supabase/db'
import type { DictationProgressRow } from '../../services/supabase/types'
import { wordDiff, type DiffToken } from './diff'
import { selectSentences } from './selectSentences'

export type DictationStatus = 'loading' | 'listening' | 'typing' | 'result' | 'finished'

export type DictationResult = {
  tokens: DiffToken[]
  ratio: number
}

const MAX_INITIAL_PLAYS = 3

export function useDictationSession(lang: 'en' | 'ko') {
  const [settings, setSettingsState] = useState<Settings>(getSettings)
  const settingsRef = useRef(settings)
  const [status, setStatus] = useState<DictationStatus>('loading')
  const [sentences, setSentences] = useState<DictationSentence[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [playsRemaining, setPlaysRemaining] = useState(MAX_INITIAL_PLAYS)
  const playsRemainingRef = useRef(MAX_INITIAL_PLAYS)
  const [typedText, setTypedText] = useState('')
  const [result, setResult] = useState<DictationResult | null>(null)
  const [ratios, setRatios] = useState<number[]>([])
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const userIdRef = useRef<string | null>(null)
  const progressRef = useRef(new Map<string, DictationProgressRow>())

  const currentSentence = sentences[currentIndex] ?? null

  const captureError = useCallback((caught: unknown) => {
    setError(caught ?? new Error('予期しないエラーが発生しました'))
  }, [])

  useEffect(() => subscribe((nextSettings) => {
    settingsRef.current = nextSettings
    setSettingsState(nextSettings)
  }), [])

  useEffect(() => {
    let active = true
    userIdRef.current = null
    progressRef.current = new Map()
    playsRemainingRef.current = MAX_INITIAL_PLAYS
    setStatus('loading')
    setSentences([])
    setCurrentIndex(0)
    setPlaysRemaining(MAX_INITIAL_PLAYS)
    setTypedText('')
    setResult(null)
    setRatios([])
    setIsSpeaking(false)
    setIsSubmitting(false)
    setError(null)

    const load = async () => {
      try {
        const allSentences = loadDictation(lang)
        const authSession = await getSession()
        if (!authSession) {
          throw new Error('ログイン情報を確認できませんでした')
        }

        const progressRows = await listDictationProgress(authSession.user.id, lang)
        const selected = selectSentences(
          allSentences,
          new Map(progressRows.map((row) => [row.sentence_id, row])),
          5,
        )

        if (active) {
          userIdRef.current = authSession.user.id
          progressRef.current = new Map(progressRows.map((row) => [row.sentence_id, row]))
          setSentences(selected)
          setStatus(selected.length === 0 ? 'finished' : 'listening')
        }
      } catch (loadError) {
        if (active) {
          captureError(loadError)
        }
      }
    }

    void load()
    return () => {
      active = false
    }
  }, [captureError, lang])

  const play = useCallback(async (rate: number) => {
    if (
      !currentSentence
      || isSpeaking
      || (status !== 'listening' && status !== 'typing' && status !== 'result')
    ) {
      return
    }

    const beforeResult = status === 'listening' || status === 'typing'
    if (beforeResult && playsRemainingRef.current <= 0) {
      return
    }

    setError(null)
    setIsSpeaking(true)
    try {
      unlockAudio()
      await speak(currentSentence.text, {
        lang,
        rate: beforeResult ? 1 : rate === 0.7 ? 0.7 : 1,
        voiceURI: settingsRef.current.ttsVoice[lang],
      })
      if (beforeResult) {
        const nextRemaining = Math.max(0, playsRemainingRef.current - 1)
        playsRemainingRef.current = nextRemaining
        setPlaysRemaining(nextRemaining)
      }
    } catch (speechError) {
      captureError(speechError)
    } finally {
      setIsSpeaking(false)
    }
  }, [captureError, currentSentence, isSpeaking, lang, status])

  const beginTyping = useCallback(() => {
    if (status !== 'listening') {
      return
    }

    try {
      unlockAudio()
      setStatus('typing')
    } catch (unlockError) {
      captureError(unlockError)
    }
  }, [captureError, status])

  const submit = useCallback(async (typed: string) => {
    const userId = userIdRef.current
    if (!userId || !currentSentence || status !== 'typing' || isSubmitting) {
      return
    }

    const nextResult = wordDiff(currentSentence.text, typed, lang)
    const previous = progressRef.current.get(currentSentence.id)
    setError(null)
    setIsSubmitting(true)

    try {
      const updated = await upsertDictationProgress({
        user_id: userId,
        lang,
        sentence_id: currentSentence.id,
        best_ratio: Math.max(previous?.best_ratio ?? 0, nextResult.ratio),
        attempts: (previous?.attempts ?? 0) + 1,
        last_at: new Date().toISOString(),
      })
      progressRef.current.set(currentSentence.id, updated)
      setTypedText(typed)
      setResult(nextResult)
      setRatios((current) => [...current, nextResult.ratio])
      setStatus('result')
    } catch (saveError) {
      captureError(saveError)
    } finally {
      setIsSubmitting(false)
    }
  }, [captureError, currentSentence, isSubmitting, lang, status])

  const next = useCallback(() => {
    if (status !== 'result' || isSpeaking) {
      return
    }

    if (currentIndex + 1 >= sentences.length) {
      setStatus('finished')
      return
    }

    playsRemainingRef.current = MAX_INITIAL_PLAYS
    setCurrentIndex((index) => index + 1)
    setPlaysRemaining(MAX_INITIAL_PLAYS)
    setTypedText('')
    setResult(null)
    setStatus('listening')
  }, [currentIndex, isSpeaking, sentences.length, status])

  const averageRatio = useMemo(() => (
    ratios.length === 0
      ? 0
      : ratios.reduce((sum, ratio) => sum + ratio, 0) / ratios.length
  ), [ratios])

  return {
    status,
    currentSentence,
    currentIndex,
    totalSentences: sentences.length,
    playsRemaining,
    typedText,
    result,
    averageRatio,
    isSpeaking,
    isSubmitting,
    error,
    play,
    beginTyping,
    setTypedText,
    submit,
    next,
    clearError: () => setError(null),
  }
}
