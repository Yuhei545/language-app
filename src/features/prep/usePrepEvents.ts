import { useCallback, useEffect, useState } from 'react'
import { generatePrepPhrases, type GeneratedVocab } from '../../services/gemini/vocab'
import { getSession } from '../../services/supabase/auth'
import {
  createPrepEvent,
  getLanguageProgress,
  getVocabProgress,
  listPrepEvents,
  listVocabItems,
  upsertVocabItems,
} from '../../services/supabase/db'
import type { PrepEventRow } from '../../services/supabase/types'
import { weekNumberFor } from '../home/progress'

export type PrepPhase = 'idle' | 'creating' | 'generating' | 'saving' | 'complete' | 'failed'

type PrepRequest = {
  title: string
  eventDate: string
}

function sortEvents(events: PrepEventRow[]): PrepEventRow[] {
  return [...events].sort((left, right) => {
    if (left.event_date === right.event_date) {
      return left.id.localeCompare(right.id)
    }
    if (left.event_date === null) {
      return 1
    }
    if (right.event_date === null) {
      return -1
    }
    return left.event_date.localeCompare(right.event_date)
  })
}

export function usePrepEvents(lang: 'en' | 'ko') {
  const [events, setEvents] = useState<PrepEventRow[]>([])
  const [generatedPhrases, setGeneratedPhrases] = useState<GeneratedVocab[]>([])
  const [activeEvent, setActiveEvent] = useState<PrepEventRow | null>(null)
  const [knownWords, setKnownWords] = useState<string[]>([])
  const [currentWeek, setCurrentWeek] = useState(1)
  const [userId, setUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [phase, setPhase] = useState<PrepPhase>('idle')
  const [error, setError] = useState<unknown>(null)
  const [retryRequest, setRetryRequest] = useState<PrepRequest | null>(null)

  useEffect(() => {
    let active = true
    setLoading(true)
    setError(null)
    setPhase('idle')
    setActiveEvent(null)
    setGeneratedPhrases([])

    const load = async () => {
      try {
        const authSession = await getSession()
        if (!authSession) {
          throw new Error('ログイン情報を確認できませんでした')
        }

        const nextUserId = authSession.user.id
        const [prepEvents, vocabItems, languageProgress] = await Promise.all([
          listPrepEvents(nextUserId, lang),
          listVocabItems(nextUserId, lang),
          getLanguageProgress(nextUserId, lang),
        ])
        const vocabProgress = await getVocabProgress(
          nextUserId,
          vocabItems.map((item) => item.id),
        )
        const knownIds = new Set(
          vocabProgress
            .filter((progress) => progress.status === 'known')
            .map((progress) => progress.vocab_item_id),
        )

        if (active) {
          setUserId(nextUserId)
          setEvents(sortEvents(prepEvents))
          setKnownWords(vocabItems.filter((item) => knownIds.has(item.id)).map((item) => item.text))
          setCurrentWeek(
            languageProgress
              ? weekNumberFor(languageProgress.started_at, new Date())
              : 1,
          )
        }
      } catch (loadError) {
        if (active) {
          setError(loadError)
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
    }
  }, [lang])

  const generateForEvent = useCallback(async (event: PrepEventRow, title: string) => {
    if (!userId) {
      throw new Error('ログイン情報を確認できませんでした')
    }

    setPhase('generating')
    const phrases = await generatePrepPhrases({ lang, title, knownWords })
    if (phrases.length === 0) {
      throw new Error('予定に合う言い方が生成されませんでした。もう一度試してください')
    }

    setPhase('saving')
    await upsertVocabItems(phrases.map((phrase) => ({
      user_id: userId,
      lang,
      week: currentWeek,
      text: phrase.text,
      emoji: phrase.emoji,
      hint_ja: phrase.hint_ja,
      example: phrase.example,
      category: 'prep',
      source: 'generated',
      prep_event_id: event.id,
    })))
    setGeneratedPhrases(phrases)
    setPhase('complete')
  }, [currentWeek, knownWords, lang, userId])

  const createPreparation = useCallback(async (request: PrepRequest) => {
    const title = request.title.trim()
    if (!title) {
      setError(new Error('予定のタイトルを入力してください'))
      return
    }
    if (!userId) {
      setError(new Error('ログイン情報を確認できませんでした'))
      return
    }

    const normalizedRequest = { title, eventDate: request.eventDate }
    setRetryRequest(normalizedRequest)
    setError(null)
    setGeneratedPhrases([])
    setActiveEvent(null)
    setPhase('creating')

    try {
      const event = await createPrepEvent({
        user_id: userId,
        lang,
        title,
        event_date: request.eventDate || null,
      })
      setActiveEvent(event)
      setEvents((current) => sortEvents([
        event,
        ...current.filter((existing) => existing.id !== event.id),
      ]))
      await generateForEvent(event, title)
    } catch (creationError) {
      setError(creationError)
      setPhase('failed')
    }
  }, [generateForEvent, lang, userId])

  const retry = useCallback(async () => {
    if (!retryRequest) {
      return
    }

    setError(null)
    try {
      if (activeEvent) {
        await generateForEvent(activeEvent, retryRequest.title)
      } else {
        await createPreparation(retryRequest)
      }
    } catch (retryError) {
      setError(retryError)
      setPhase('failed')
    }
  }, [activeEvent, createPreparation, generateForEvent, retryRequest])

  return {
    events,
    generatedPhrases,
    activeEvent,
    loading,
    phase,
    error,
    createPreparation,
    retry,
    clearError: () => setError(null),
  }
}
