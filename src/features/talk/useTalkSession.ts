import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { loadCore } from '../../content/coreSchema'
import { getPersona } from '../../services/gemini/persona'
import { sendParentTurn } from '../../services/gemini/parent'
import { transcribeAudio } from '../../services/gemini/transcribe'
import { normalizeText, similarity } from '../../services/speech/normalize'
import { createSpeechInput, type SpeechInput } from '../../services/speech/stt'
import { speak, unlockAudio } from '../../services/speech/tts'
import { getSettings, subscribe, type Settings } from '../../services/settings'
import { getSession } from '../../services/supabase/auth'
import {
  addMessage,
  createConversation,
  endConversation,
  getLanguageProgress,
  getVocabProgress,
  listPrepEvents,
  listVocabItems,
  updateMessageShadowScore,
  upsertVocabItems,
  upsertVocabProgress,
} from '../../services/supabase/db'
import type {
  MessageRow,
  PrepEventRow,
  VocabItemRow,
  VocabProgressRow,
} from '../../services/supabase/types'
import { buildScenarios, type Scenario } from './scenarios'

export type TalkStatus = 'idle' | 'active' | 'ended'
export type TalkPhase =
  | 'ready'
  | 'starting'
  | 'recording'
  | 'transcribing'
  | 'thinking'
  | 'speaking'
  | 'ending'
  | 'shadow-speaking'
  | 'shadow-recording'
  | 'shadow-transcribing'

type TargetItem = {
  item: VocabItemRow
  progress: VocabProgressRow
}

type SessionData = {
  userId: string
  conversationId: string
  lang: 'en' | 'ko'
  scenario: Scenario
  personaName: string
  interests: Settings['interests']
  currentWeek: number
  knownWords: string[]
  weekWords: string[]
  targets: TargetItem[]
}

function uniqueWords(words: string[]): string[] {
  return [...new Set(words.filter((word) => word.trim().length > 0))]
}

function buildTargets(
  vocabItems: VocabItemRow[],
  progressById: Map<string, VocabProgressRow>,
): TargetItem[] {
  const targets: TargetItem[] = []

  for (const item of vocabItems) {
    const progress = progressById.get(item.id)
    if (progress && (progress.hint_used_count > 0 || progress.status === 'learning')) {
      targets.push({ item, progress })
    }

    if (targets.length === 10) {
      break
    }
  }

  return targets
}

async function recordTargetWordUse(data: SessionData, spokenText: string): Promise<void> {
  const normalizedSpoken = normalizeText(spokenText, data.lang)
  const matchedTargets = data.targets.filter(({ item }) => {
    const normalizedTarget = normalizeText(item.text, data.lang)
    return normalizedTarget.length > 0 && normalizedSpoken.includes(normalizedTarget)
  })

  const updatedProgress = await Promise.all(matchedTargets.map(({ progress }) => (
    upsertVocabProgress({
      user_id: progress.user_id,
      vocab_item_id: progress.vocab_item_id,
      status: progress.status,
      correct_count: progress.correct_count + 1,
      hint_used_count: progress.hint_used_count,
      last_reviewed_at: new Date().toISOString(),
      next_review_at: progress.next_review_at,
    })
  )))

  updatedProgress.forEach((progress) => {
    const target = data.targets.find(({ item }) => item.id === progress.vocab_item_id)
    if (target) {
      target.progress = progress
    }
  })
}

export function useTalkSession(lang: 'en' | 'ko') {
  const [settings, setSettingsState] = useState<Settings>(getSettings)
  const settingsRef = useRef(settings)
  const [prepEvents, setPrepEvents] = useState<PrepEventRow[]>([])
  const [loadingScenarios, setLoadingScenarios] = useState(true)
  const [status, setStatus] = useState<TalkStatus>('idle')
  const [phase, setPhase] = useState<TalkPhase>('ready')
  const [messages, setMessages] = useState<MessageRow[]>([])
  const messagesRef = useRef<MessageRow[]>([])
  const [newWords, setNewWords] = useState<string[]>([])
  const [savedWords, setSavedWords] = useState<string[]>([])
  const [currentWeek, setCurrentWeek] = useState(1)
  const [selectedScenario, setSelectedScenario] = useState<Scenario | null>(null)
  const [parentName, setParentName] = useState('')
  const [error, setError] = useState<unknown>(null)
  const [sttEngine, setSttEngine] = useState<'webspeech' | 'gemini' | null>(null)
  const [shadowingMessageId, setShadowingMessageId] = useState<string | null>(null)
  const [turnCount, setTurnCount] = useState(0)
  const turnCountRef = useRef(0)
  const inputRef = useRef<SpeechInput | null>(null)
  const sessionDataRef = useRef<SessionData | null>(null)

  const scenarios = useMemo(
    () => buildScenarios(lang, settings.interests, prepEvents),
    [lang, prepEvents, settings.interests],
  )

  const captureError = useCallback((caught: unknown) => {
    setError(caught ?? new Error('不明なエラーが発生しました'))
  }, [])

  const appendMessage = useCallback((message: MessageRow) => {
    const nextMessages = [...messagesRef.current, message]
    messagesRef.current = nextMessages
    setMessages(nextMessages)
  }, [])

  const replaceMessage = useCallback((message: MessageRow) => {
    const nextMessages = messagesRef.current.map((current) => (
      current.id === message.id ? message : current
    ))
    messagesRef.current = nextMessages
    setMessages(nextMessages)
  }, [])

  useEffect(() => subscribe((nextSettings) => {
    settingsRef.current = nextSettings
    setSettingsState(nextSettings)
  }), [])

  useEffect(() => {
    let active = true

    const loadPrepEvents = async () => {
      setLoadingScenarios(true)

      try {
        const authSession = await getSession()
        const events = authSession
          ? await listPrepEvents(authSession.user.id, lang)
          : []

        if (active) {
          setPrepEvents(events)
        }
      } catch (loadError) {
        if (active) {
          captureError(loadError)
          setPrepEvents([])
        }
      } finally {
        if (active) {
          setLoadingScenarios(false)
        }
      }
    }

    void loadPrepEvents()
    return () => {
      active = false
    }
  }, [captureError, lang])

  useEffect(() => () => {
    inputRef.current?.cancel()
  }, [])

  const startSession = useCallback(async (scenario: Scenario) => {
    if (phase !== 'ready' || status !== 'idle') {
      return
    }

    setError(null)
    setPhase('starting')

    try {
      unlockAudio()
      const authSession = await getSession()
      if (!authSession) {
        throw new Error('ログイン情報を確認できませんでした')
      }

      const userId = authSession.user.id
      const [vocabItems, languageProgress] = await Promise.all([
        listVocabItems(userId, lang),
        getLanguageProgress(userId, lang),
      ])
      const vocabProgress = await getVocabProgress(
        userId,
        vocabItems.map((item) => item.id),
      )
      const progressById = new Map(
        vocabProgress.map((progress) => [progress.vocab_item_id, progress]),
      )
      const core = loadCore(lang)
      const coreWords = [
        ...core.verbs,
        ...core.nouns,
        ...core.adjectives,
        ...core.phrasal,
      ].map((word) => word.text)
      const week = languageProgress?.current_week ?? 1
      const conversation = await createConversation(userId, lang, scenario.prompt)
      const persona = getPersona(lang, settingsRef.current.parentName[lang])

      sessionDataRef.current = {
        userId,
        conversationId: conversation.id,
        lang,
        scenario,
        personaName: persona.name,
        interests: [...settingsRef.current.interests],
        currentWeek: week,
        knownWords: uniqueWords(vocabItems
          .filter((item) => progressById.get(item.id)?.status === 'known')
          .map((item) => item.text)),
        weekWords: uniqueWords([
          ...vocabItems
            .filter((item) => item.week === week)
            .map((item) => item.text),
          ...coreWords,
        ]),
        targets: buildTargets(vocabItems, progressById),
      }

      messagesRef.current = []
      turnCountRef.current = 0
      setMessages([])
      setNewWords([])
      setSavedWords([])
      setTurnCount(0)
      setCurrentWeek(week)
      setSelectedScenario(scenario)
      setParentName(persona.name)
      setSttEngine(null)
      setStatus('active')
      setPhase('ready')
    } catch (startError) {
      captureError(startError)
      setPhase('ready')
    }
  }, [captureError, lang, phase, status])

  const startRecording = useCallback(async () => {
    const data = sessionDataRef.current
    if (!data || status !== 'active' || phase !== 'ready' || inputRef.current) {
      return
    }

    setError(null)
    setPhase('recording')

    try {
      const input = createSpeechInput({
        lang: data.lang,
        engine: settingsRef.current.sttEngine,
        transcribe: transcribeAudio,
      })
      inputRef.current = input
      setSttEngine(input.engine)
      await input.start()
    } catch (recordingError) {
      inputRef.current?.cancel()
      inputRef.current = null
      captureError(recordingError)
      setPhase('ready')
    }
  }, [captureError, phase, status])

  // 文字起こし・返答待ち中の「やめる」用。世代番号が変わった処理は結果を捨てる
  const turnGenerationRef = useRef(0)
  const turnAbortRef = useRef<AbortController | null>(null)

  const stopRecording = useCallback(async () => {
    const data = sessionDataRef.current
    const input = inputRef.current
    if (!data || !input || phase !== 'recording') {
      return
    }

    setPhase('transcribing')
    turnGenerationRef.current += 1
    const generation = turnGenerationRef.current
    const controller = new AbortController()
    turnAbortRef.current = controller

    try {
      const result = await input.stop()
      if (turnGenerationRef.current !== generation) {
        return
      }
      inputRef.current = null
      setSttEngine(result.engine)
      const userText = result.text.trim()
      if (!userText) {
        throw new Error('音声を聞き取れませんでした。もう一度ゆっくり話してみてください')
      }

      const history = messagesRef.current.map((message) => ({
        role: message.role,
        text: message.text,
      }))
      const userMessage = await addMessage({
        conversation_id: data.conversationId,
        user_id: data.userId,
        role: 'user',
        text: userText,
      })
      appendMessage(userMessage)
      setPhase('thinking')

      const parentTurn = await sendParentTurn({
        input: {
          lang: data.lang,
          personaName: data.personaName,
          scenario: data.scenario.prompt,
          knownWords: data.knownWords,
          weekWords: data.weekWords,
          targetWords: data.targets.map(({ item }) => item.text),
          interests: data.interests,
        },
        history,
        userText,
      }, { signal: controller.signal })
      if (turnGenerationRef.current !== generation) {
        return
      }
      const assistantMessage = await addMessage({
        conversation_id: data.conversationId,
        user_id: data.userId,
        role: 'assistant',
        text: parentTurn.reply,
        simpler: parentTurn.simpler,
        ja: parentTurn.ja,
      })
      appendMessage(assistantMessage)
      turnCountRef.current += 1
      setTurnCount(turnCountRef.current)
      setNewWords((current) => uniqueWords([...current, ...parentTurn.new_words]))

      setPhase('speaking')
      try {
        await speak(parentTurn.reply, {
          lang: data.lang,
          rate: settingsRef.current.ttsRate,
          voiceURI: settingsRef.current.ttsVoice[data.lang],
        })
      } catch (speechError) {
        captureError(speechError)
      }

      await recordTargetWordUse(data, userText)
      setPhase('ready')
    } catch (turnError) {
      if (turnGenerationRef.current !== generation) {
        return
      }
      inputRef.current?.cancel()
      inputRef.current = null
      captureError(turnError)
      setPhase('ready')
    }
  }, [appendMessage, captureError, phase])

  const cancelTurn = useCallback(() => {
    if (phase !== 'transcribing' && phase !== 'thinking') {
      return
    }
    turnGenerationRef.current += 1
    turnAbortRef.current?.abort()
    turnAbortRef.current = null
    inputRef.current?.cancel()
    inputRef.current = null
    setPhase('ready')
  }, [phase])

  const endCurrentSession = useCallback(async () => {
    const data = sessionDataRef.current
    if (!data || status !== 'active' || phase !== 'ready') {
      return
    }

    setError(null)
    setPhase('ending')

    try {
      await endConversation(data.conversationId, turnCountRef.current)
      setStatus('ended')
      setPhase('ready')
    } catch (endError) {
      captureError(endError)
      setPhase('ready')
    }
  }, [captureError, phase, status])

  const playText = useCallback(async (text: string, rate?: number) => {
    const data = sessionDataRef.current
    if (!data || phase !== 'ready') {
      return
    }

    setError(null)
    setPhase('speaking')

    try {
      await speak(text, {
        lang: data.lang,
        rate: rate ?? settingsRef.current.ttsRate,
        voiceURI: settingsRef.current.ttsVoice[data.lang],
      })
    } catch (playError) {
      captureError(playError)
    } finally {
      setPhase('ready')
    }
  }, [captureError, phase])

  const toggleShadowing = useCallback(async (message: MessageRow) => {
    const data = sessionDataRef.current
    if (!data) {
      return
    }

    if (phase === 'shadow-recording' && shadowingMessageId === message.id) {
      const input = inputRef.current
      if (!input) {
        setPhase('ready')
        setShadowingMessageId(null)
        return
      }

      setPhase('shadow-transcribing')

      try {
        const result = await input.stop()
        inputRef.current = null
        setSttEngine(result.engine)
        const score = Math.round(similarity(result.text, message.text, data.lang) * 100)
        const updatedMessage = await updateMessageShadowScore(message.id, score)
        replaceMessage(updatedMessage)
        setShadowingMessageId(null)
        setPhase('ready')
      } catch (shadowError) {
        inputRef.current?.cancel()
        inputRef.current = null
        setShadowingMessageId(null)
        captureError(shadowError)
        setPhase('ready')
      }
      return
    }

    if (phase !== 'ready' || inputRef.current) {
      return
    }

    setError(null)
    setShadowingMessageId(message.id)
    setPhase('shadow-speaking')

    try {
      await speak(message.text, {
        lang: data.lang,
        rate: settingsRef.current.ttsRate,
        voiceURI: settingsRef.current.ttsVoice[data.lang],
      })
      const input = createSpeechInput({
        lang: data.lang,
        engine: settingsRef.current.sttEngine,
        transcribe: transcribeAudio,
      })
      inputRef.current = input
      setSttEngine(input.engine)
      await input.start()
      setPhase('shadow-recording')
    } catch (shadowError) {
      inputRef.current?.cancel()
      inputRef.current = null
      setShadowingMessageId(null)
      captureError(shadowError)
      setPhase('ready')
    }
  }, [captureError, phase, replaceMessage, shadowingMessageId])

  const saveNewWord = useCallback(async (word: string) => {
    const data = sessionDataRef.current
    if (!data || savedWords.includes(word)) {
      return
    }

    setError(null)

    try {
      await upsertVocabItems([{
        user_id: data.userId,
        lang: data.lang,
        week: data.currentWeek,
        text: word,
        category: 'core',
        source: 'generated',
      }])
      setSavedWords((current) => [...current, word])
    } catch (saveError) {
      captureError(saveError)
    }
  }, [captureError, savedWords])

  const resetSession = useCallback(() => {
    inputRef.current?.cancel()
    inputRef.current = null
    sessionDataRef.current = null
    messagesRef.current = []
    turnCountRef.current = 0
    setMessages([])
    setNewWords([])
    setSavedWords([])
    setTurnCount(0)
    setSelectedScenario(null)
    setParentName('')
    setShadowingMessageId(null)
    setSttEngine(null)
    setError(null)
    setPhase('ready')
    setStatus('idle')
  }, [])

  return {
    status,
    phase,
    scenarios,
    loadingScenarios,
    messages,
    newWords,
    savedWords,
    currentWeek,
    selectedScenario,
    parentName,
    turnCount,
    error,
    sttEngine,
    shadowingMessageId,
    startSession,
    startRecording,
    stopRecording,
    cancelTurn,
    endCurrentSession,
    playText,
    toggleShadowing,
    saveNewWord,
    resetSession,
    clearError: () => setError(null),
  }
}
