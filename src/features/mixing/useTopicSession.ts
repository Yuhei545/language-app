import { useCallback, useEffect, useRef, useState } from 'react'
import { loadCore } from '../../content/coreSchema'
import { loadTopics, type Topic } from '../../content/topicsSchema'
import { checkTopicTurn, type TopicCheckResult } from '../../services/gemini/speaking'
import { transcribeAudio } from '../../services/gemini/transcribe'
import {
  createSpeechInput,
  speak,
  stopSpeaking,
  unlockAudio,
  type SpeechInput,
} from '../../services/speech'
import { getSettings, subscribe, type Settings } from '../../services/settings'
import { getSession } from '../../services/supabase/auth'
import { insertSpeakingSession } from '../../services/supabase/db'
import { fillTopic } from './personal'

export type TopicPhase =
  | 'idle'
  | 'recording'
  | 'checking'
  | 'feedback'
  | 'finished'

export type TopicTurn = {
  /** 1 ターン目はお題、2 ターン目は相手の質問。 */
  promptJa: string
  prompt: string
  heardText: string
  result: TopicCheckResult
}

function pickTopic(topics: Topic[], level: number): Topic {
  const usable = topics.filter((topic) => topic.level <= level)
  const pool = usable.length > 0 ? usable : topics
  if (pool.length === 0) {
    throw new Error('お題が見つかりませんでした')
  }
  return pool[Math.floor(Math.random() * pool.length)]
}

export function useTopicSession(lang: 'en' | 'ko') {
  const [settings, setSettingsState] = useState<Settings>(getSettings)
  const settingsRef = useRef(settings)
  const [phase, setPhase] = useState<TopicPhase>('idle')
  const [topicJa, setTopicJa] = useState<string | null>(null)
  const [turns, setTurns] = useState<TopicTurn[]>([])
  const [error, setError] = useState<unknown>(null)

  const inputRef = useRef<SpeechInput | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const generationRef = useRef(0)
  const mountedRef = useRef(true)
  const userIdRef = useRef<string | null>(null)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  useEffect(() => subscribe((next) => {
    settingsRef.current = next
    setSettingsState(next)
  }), [])

  useEffect(() => {
    let active = true
    void getSession()
      .then((authSession) => {
        if (active) {
          userIdRef.current = authSession?.user.id ?? null
        }
      })
      .catch((sessionError) => {
        console.error('ログイン情報を確認できませんでした', sessionError)
      })
    return () => {
      active = false
    }
  }, [])

  const captureError = useCallback((caught: unknown) => {
    console.error('お題の練習でエラーが発生しました', caught)
    setError(caught ?? new Error('不明なエラーが発生しました'))
  }, [])

  const cancelActive = useCallback(() => {
    generationRef.current += 1
    stopSpeaking()
    inputRef.current?.cancel()
    inputRef.current = null
    abortRef.current?.abort()
    abortRef.current = null
  }, [])

  useEffect(() => {
    cancelActive()
    setPhase('idle')
    setTopicJa(null)
    setTurns([])
    setError(null)
    return cancelActive
  }, [cancelActive, lang])

  /** 現在の合図。1 ターン目はお題、2 ターン目は相手の質問。 */
  const currentPromptJa = turns.length === 0
    ? topicJa
    : turns[turns.length - 1].result.follow_up_ja
  const currentPrompt = turns.length === 0
    ? ''
    : turns[turns.length - 1].result.follow_up

  const startRecording = useCallback(async () => {
    if (phase !== 'idle' && phase !== 'feedback') {
      return
    }
    generationRef.current += 1
    const generation = generationRef.current
    setError(null)

    try {
      unlockAudio()
      stopSpeaking()

      let prompt = currentPromptJa
      if (turns.length === 0) {
        const core = loadCore(lang)
        const topic = pickTopic(loadTopics(lang), settingsRef.current.mixingLevel)
        const filled = fillTopic(topic, settingsRef.current.personalWords, core, lang)
        prompt = filled.text
        setTopicJa(filled.text)
        await speak(filled.text, {
          lang: 'ja',
          rate: 1,
          voiceURI: settingsRef.current.ttsVoiceJa ?? undefined,
        })
      }
      if (generationRef.current !== generation || !mountedRef.current) {
        return
      }
      if (!prompt) {
        throw new Error('お題を用意できませんでした')
      }

      const input = createSpeechInput({
        lang,
        engine: settingsRef.current.sttEngine,
        transcribe: transcribeAudio,
      })
      inputRef.current = input
      await input.start()
      if (generationRef.current !== generation || !mountedRef.current) {
        input.cancel()
        inputRef.current = null
        return
      }
      setPhase('recording')
    } catch (startError) {
      if (generationRef.current === generation && mountedRef.current) {
        inputRef.current?.cancel()
        inputRef.current = null
        captureError(startError)
        setPhase(turns.length === 0 ? 'idle' : 'feedback')
      }
    }
  }, [captureError, currentPromptJa, lang, phase, turns.length])

  const stopRecording = useCallback(async () => {
    const input = inputRef.current
    if (!input || phase !== 'recording') {
      return
    }
    generationRef.current += 1
    const generation = generationRef.current
    const controller = new AbortController()
    abortRef.current = controller
    setPhase('checking')

    try {
      const spoken = (await input.stop()).text.trim()
      inputRef.current = null
      if (generationRef.current !== generation || !mountedRef.current) {
        return
      }
      if (!spoken) {
        throw new Error('音声を聞き取れませんでした。もう一度ゆっくり話してみてください')
      }

      const previous = turns[turns.length - 1]
      const result = await checkTopicTurn({
        lang,
        personaName: settingsRef.current.parentName[lang],
        topicJa: topicJa ?? '',
        learnerText: spoken,
        ...(previous
          ? { previousTurn: { question: previous.result.follow_up, answer: previous.heardText } }
          : {}),
      }, { signal: controller.signal })
      if (generationRef.current !== generation || !mountedRef.current) {
        return
      }

      const turn: TopicTurn = {
        promptJa: currentPromptJa ?? '',
        prompt: currentPrompt,
        heardText: spoken,
        result,
      }
      const nextTurns = [...turns, turn]
      setTurns(nextTurns)
      const done = nextTurns.length >= 2 || !result.follow_up
      setPhase(done ? 'finished' : 'feedback')

      await speak(result.recast, {
        lang,
        rate: settingsRef.current.ttsRate,
        voiceURI: settingsRef.current.ttsVoice[lang],
      })
      if (generationRef.current !== generation || !mountedRef.current) {
        return
      }
      if (result.follow_up) {
        await speak(result.follow_up, {
          lang,
          rate: settingsRef.current.ttsRate,
          voiceURI: settingsRef.current.ttsVoice[lang],
        })
      }

      if (done && userIdRef.current) {
        try {
          await insertSpeakingSession({
            user_id: userIdRef.current,
            lang,
            kind: 'topic',
            rounds: nextTurns.map((item, index) => ({
              turn: index,
              prompt_ja: item.promptJa,
              heard: item.heardText,
              understood: item.result.understood,
            })),
            understood_ratio: nextTurns.filter((item) => item.result.understood).length / nextTurns.length,
            avg_latency_ms: null,
          })
        } catch (saveError) {
          captureError(saveError)
        }
      }
    } catch (stopError) {
      if (generationRef.current === generation && mountedRef.current) {
        inputRef.current?.cancel()
        inputRef.current = null
        captureError(stopError)
        setPhase(turns.length === 0 ? 'idle' : 'feedback')
      }
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null
      }
    }
  }, [captureError, currentPrompt, currentPromptJa, lang, phase, topicJa, turns])

  const cancelChecking = useCallback(() => {
    if (phase !== 'checking') {
      return
    }
    cancelActive()
    setPhase(turns.length === 0 ? 'idle' : 'feedback')
  }, [cancelActive, phase, turns.length])

  const reset = useCallback(() => {
    cancelActive()
    setPhase('idle')
    setTopicJa(null)
    setTurns([])
  }, [cancelActive])

  const speakText = useCallback(async (text: string) => {
    try {
      await speak(text, {
        lang,
        rate: settingsRef.current.ttsRate,
        voiceURI: settingsRef.current.ttsVoice[lang],
      })
    } catch (speakError) {
      captureError(speakError)
    }
  }, [captureError, lang])

  return {
    phase,
    topicJa,
    turns,
    currentPromptJa,
    error,
    startRecording,
    stopRecording,
    cancelChecking,
    reset,
    speakText,
    clearError: () => setError(null),
  }
}
