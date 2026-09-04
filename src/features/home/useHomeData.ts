import { useCallback, useEffect, useState } from 'react'
import { selectDueCards, type SrsState } from '../cards/srs'
import { getSession } from '../../services/supabase/auth'
import {
  countConversationsToday,
  getLanguageProgress,
  getOrCreateProfile,
  getVocabProgress,
  listPrepEvents,
  listVocabItems,
  upsertLanguageProgress,
} from '../../services/supabase/db'
import type { PrepEventRow } from '../../services/supabase/types'
import { dayInWeek, daysUntil, updateStreak, weekNumberFor } from './progress'

export type UpcomingPrepEvent = {
  event: PrepEventRow
  daysRemaining: number
}

export type HomeData = {
  week: number
  day: number
  streak: number
  dueCardCount: number
  conversationComplete: boolean
  knownWordCount: number
  upcomingEvents: UpcomingPrepEvent[]
}

function localDateString(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function localDayStartIso(date: Date): string {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).toISOString()
}

export function useHomeData(lang: 'en' | 'ko') {
  const [data, setData] = useState<HomeData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<unknown>(null)
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    let active = true
    setLoading(true)
    setError(null)

    const load = async () => {
      try {
        const authSession = await getSession()
        if (!authSession) {
          throw new Error('ログイン情報を確認できませんでした')
        }

        const userId = authSession.user.id
        const now = new Date()
        const today = localDateString(now)
        const [, existingProgress, vocabItems, prepEvents, conversationCount] = await Promise.all([
          getOrCreateProfile(userId),
          getLanguageProgress(userId, lang),
          listVocabItems(userId, lang),
          listPrepEvents(userId, lang),
          countConversationsToday(userId, lang, localDayStartIso(now)),
        ])
        const vocabProgress = await getVocabProgress(
          userId,
          vocabItems.map((item) => item.id),
        )

        let languageProgress = existingProgress
        if (!languageProgress) {
          languageProgress = await upsertLanguageProgress({
            user_id: userId,
            lang,
            current_week: 1,
            started_at: today,
            streak: 1,
            last_active_date: today,
          })
        } else {
          const calculatedWeek = weekNumberFor(languageProgress.started_at, now)
          const nextStreak = updateStreak(languageProgress, today)
          if (
            calculatedWeek !== languageProgress.current_week
            || nextStreak.streak !== languageProgress.streak
            || nextStreak.last_active_date !== languageProgress.last_active_date
          ) {
            languageProgress = await upsertLanguageProgress({
              user_id: userId,
              lang,
              current_week: calculatedWeek,
              streak: nextStreak.streak,
              last_active_date: nextStreak.last_active_date,
            })
          }
        }

        const progressById = new Map(
          vocabProgress.map((progress) => [progress.vocab_item_id, progress]),
        )
        const srsProgress = new Map<string, SrsState>(
          vocabProgress.map((progress) => [progress.vocab_item_id, {
            status: progress.status,
            correct_count: progress.correct_count,
            next_review_at: progress.next_review_at,
          }]),
        )
        const upcomingEvents = prepEvents
          .flatMap((event) => {
            if (!event.event_date) {
              return []
            }

            const daysRemaining = daysUntil(event.event_date, now)
            return daysRemaining >= 0 ? [{ event, daysRemaining }] : []
          })
          .sort((left, right) => (
            left.daysRemaining - right.daysRemaining
            || left.event.id.localeCompare(right.event.id)
          ))

        if (active) {
          setData({
            week: weekNumberFor(languageProgress.started_at, now),
            day: dayInWeek(languageProgress.started_at, now),
            streak: languageProgress.streak,
            dueCardCount: selectDueCards(vocabItems, srsProgress, now, 10).length,
            conversationComplete: conversationCount > 0,
            knownWordCount: vocabItems.filter(
              (item) => progressById.get(item.id)?.status === 'known',
            ).length,
            upcomingEvents,
          })
        }
      } catch (loadError) {
        if (active) {
          setError(loadError)
          setData(null)
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
  }, [lang, reloadToken])

  const reload = useCallback(() => {
    setReloadToken((current) => current + 1)
  }, [])

  return {
    data,
    loading,
    error,
    reload,
    clearError: () => setError(null),
  }
}
