import { useCallback, useEffect, useRef, useState } from 'react'
import { loadCore } from '../../content/coreSchema'
import { loadTopics, type Topic } from '../../content/topicsSchema'
import { checkTopicTurn, type TopicCheckResult } from '../../services/gemini/speaking'
import { speak, stopSpeaking, unlockAudio } from '../../services/speech'
import { getSettings, subscribe, type Settings } from '../../services/settings'
import { getSession } from '../../services/supabase/auth'
import { insertSpeakingSession } from '../../services/supabase/db'
import { fillTopic } from './personal'

export type TopicPhase =
  | 'idle'
  /** お題(または相手の質問)に対して、声に出してから文を打ち込む。 */
  | 'typing'
  | 'checking'
  | 'feedback'
  | 'finished'

export type TopicTurn = {
  /** 1 ターン目はお題、2 ターン目は相手の質問。 */
  promptJa: string
  prompt: string
  learnerText: string
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

  /** お題を 1 つ選んで読み上げ、打ち込める状態にする。 */
  const beginTopic = useCallback(async () => {
    if (phase !== 'idle') {
      return
    }
    generationRef.current += 1
    const generation = generationRef.current
    setError(null)

    try {
      unlockAudio()
      stopSpeaking()
      const core = loadCore(lang)
      const topic = pickTopic(loadTopics(lang), settingsRef.current.mixingLevel)
      const filled = fillTopic(topic, settingsRef.current.personalWords, core, lang)
      setTopicJa(filled.text)
      setPhase('typing')
      await speak(filled.text, {
        lang: 'ja',
        rate: 1,
        voiceURI: settingsRef.current.ttsVoiceJa ?? undefined,
      })
    } catch (startError) {
      if (generationRef.current === generation && mountedRef.current) {
        captureError(startError)
        setPhase('idle')
      }
    }
  }, [captureError, lang, phase])

  /** 相手の質問に答える(打ち込みに戻る)。 */
  const answerFollowUp = useCallback(() => {
    if (phase !== 'feedback') {
      return
    }
    stopSpeaking()
    setPhase('typing')
  }, [phase])

  /** 打ち込んだ文を送り、伝わったかと続きの質問をもらう。 */
  const submit = useCallback(async (text: string) => {
    const learnerText = text.trim()
    if (phase !== 'typing' || learnerText.length === 0) {
      return
    }
    generationRef.current += 1
    const generation = generationRef.current
    const controller = new AbortController()
    abortRef.current = controller
    setError(null)
    setPhase('checking')

    try {
      const previous = turns[turns.length - 1]
      const result = await checkTopicTurn({
        lang,
        personaName: settingsRef.current.parentName[lang],
        topicJa: topicJa ?? '',
        learnerText,
        ...(previous
          ? { previousTurn: { question: previous.result.follow_up, answer: previous.learnerText } }
          : {}),
      }, { signal: controller.signal })
      if (generationRef.current !== generation || !mountedRef.current) {
        return
      }

      const turn: TopicTurn = {
        promptJa: currentPromptJa ?? '',
        prompt: currentPrompt,
        learnerText,
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
          speaker: 'B',
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
              text: item.learnerText,
              understood: item.result.understood,
            })),
            understood_ratio: nextTurns.filter((item) => item.result.understood).length / nextTurns.length,
            avg_latency_ms: null,
          })
        } catch (saveError) {
          captureError(saveError)
        }
      }
    } catch (submitError) {
      if (generationRef.current === generation && mountedRef.current) {
        captureError(submitError)
        setPhase('typing')
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
    setPhase('typing')
  }, [cancelActive, phase])

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
    beginTopic,
    answerFollowUp,
    submit,
    cancelChecking,
    reset,
    speakText,
    clearError: () => setError(null),
  }
}
