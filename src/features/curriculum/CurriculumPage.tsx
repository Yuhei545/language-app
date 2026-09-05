import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLanguage } from '../../app/LanguageContext'
import { Toast } from '../../components/Toast'
import { generateWeeklyVocab } from '../../services/gemini/vocab'
import { getSettings, subscribe, type Settings } from '../../services/settings'
import { getSession } from '../../services/supabase/auth'
import {
  advanceLanguageWeek,
  getLanguageProgress,
  getVocabProgress,
  listVocabItems,
  upsertVocabItems,
} from '../../services/supabase/db'
import type { VocabItemRow, VocabProgressRow } from '../../services/supabase/types'
import { canAdvanceWeek, weekMasteryRatio } from '../home/progress'

type WeekSummary = {
  week: number
  wordCount: number
  masteredCount: number
  masteryRatio: number
}

function localDateString(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function CurriculumPage() {
  const { language } = useLanguage()
  const [settingsState, setSettingsState] = useState<Settings>(getSettings)
  const [items, setItems] = useState<VocabItemRow[]>([])
  const [progress, setProgress] = useState<VocabProgressRow[]>([])
  const [currentWeek, setCurrentWeek] = useState(1)
  const [userId, setUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [advancing, setAdvancing] = useState(false)
  const [error, setError] = useState<unknown>(null)

  useEffect(() => subscribe(setSettingsState), [])

  const loadCurriculum = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const authSession = await getSession()
      if (!authSession) {
        throw new Error('ログイン情報を確認できませんでした')
      }

      const nextUserId = authSession.user.id
      const [languageProgress, vocabItems] = await Promise.all([
        getLanguageProgress(nextUserId, language),
        listVocabItems(nextUserId, language),
      ])
      const vocabProgress = await getVocabProgress(
        nextUserId,
        vocabItems.map((item) => item.id),
      )

      setUserId(nextUserId)
      setItems(vocabItems)
      setProgress(vocabProgress)
      setCurrentWeek(languageProgress?.current_week ?? 1)
    } catch (loadError) {
      setError(loadError)
    } finally {
      setLoading(false)
    }
  }, [language])

  useEffect(() => {
    void loadCurriculum()
  }, [loadCurriculum])

  const progressById = useMemo(
    () => new Map(progress.map((row) => [row.vocab_item_id, row])),
    [progress],
  )
  const weeks = useMemo<WeekSummary[]>(() => {
    const summaries = Array.from({ length: 26 }, (_, index) => ({
      week: index + 1,
      wordCount: 0,
      masteredCount: 0,
      masteryRatio: 0,
    }))

    items.forEach((item) => {
      if (item.category === 'prep') {
        return
      }

      const summary = summaries[item.week - 1]
      if (!summary) {
        return
      }

      summary.wordCount += 1
      if ((progressById.get(item.id)?.correct_count ?? 0) >= 1) {
        summary.masteredCount += 1
      }
    })

    summaries.forEach((summary) => {
      summary.masteryRatio = summary.wordCount === 0
        ? 0
        : summary.masteredCount / summary.wordCount
    })

    return summaries
  }, [items, progressById])
  const currentSummary = weeks[currentWeek - 1]
  const currentWeekItems = useMemo(
    () => items.filter(
      (item) => item.week === currentWeek && item.category !== 'prep',
    ),
    [currentWeek, items],
  )
  const currentCanAdvance = useMemo(
    () => canAdvanceWeek(currentWeekItems, progressById),
    [currentWeekItems, progressById],
  )

  const generateCurrentWeek = async () => {
    if (!userId || currentWeek < 5 || !currentSummary || currentSummary.wordCount > 0 || generating) {
      return
    }

    setError(null)
    setGenerating(true)

    try {
      const knownWords = items
        .filter((item) => progressById.get(item.id)?.status === 'known')
        .map((item) => item.text)
      const generated = await generateWeeklyVocab({
        lang: language,
        week: currentWeek,
        knownWords,
        interests: settingsState.interests,
      })
      if (generated.length === 0) {
        throw new Error('今週の語が生成されませんでした。もう一度試してください')
      }

      await upsertVocabItems(generated.map((item) => ({
        user_id: userId,
        lang: language,
        week: currentWeek,
        text: item.text,
        emoji: item.emoji,
        hint_ja: item.hint_ja,
        example: item.example,
        category: 'core',
        source: 'generated',
      })))
      await loadCurriculum()
    } catch (generationError) {
      setError(generationError)
    } finally {
      setGenerating(false)
    }
  }

  const advanceWeek = async () => {
    if (!userId || currentWeek >= 26 || advancing) {
      return
    }

    if (
      !currentCanAdvance
      && !window.confirm('まだ今週の言葉を 80% 言えていません。進めますか?')
    ) {
      return
    }

    setError(null)
    setAdvancing(true)

    try {
      await advanceLanguageWeek(
        userId,
        language,
        currentWeek + 1,
        localDateString(new Date()),
      )
      await loadCurriculum()
    } catch (advanceError) {
      setError(advanceError)
    } finally {
      setAdvancing(false)
    }
  }

  return (
    <section>
      <Toast error={error} onClose={() => setError(null)} />
      <p className="text-sm font-bold text-teal-700">LEARNING PATH</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">26週間の道のり</h1>
      <p className="mt-3 text-sm leading-6 text-slate-500">今いる場所と、身についた言葉を週ごとに見渡せます。</p>

      {loading ? (
        <p className="mt-8 rounded-2xl bg-white px-5 py-8 text-center text-sm font-bold text-slate-500" role="status">
          カリキュラムを読み込んでいます…
        </p>
      ) : (
        <>
          <div className="mt-7 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-bold tracking-wider text-slate-400">WEEK {currentWeek}</p>
                <p className="mt-1 text-sm font-bold text-slate-700">
                  今週の習得率 {Math.round(weekMasteryRatio(currentWeekItems, progressById) * 100)}%
                </p>
              </div>
              {currentWeek >= 26 ? (
                <span className="rounded-full bg-teal-50 px-3 py-1 text-xs font-bold text-teal-800">最終週</span>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => void advanceWeek()}
              disabled={!userId || currentWeek >= 26 || advancing}
              className="mt-4 w-full rounded-2xl border border-teal-300 bg-white px-5 py-3 text-sm font-bold text-teal-800 disabled:opacity-45"
            >
              {advancing ? '次の週へ進んでいます…' : '次の週へ手動で進む'}
            </button>
          </div>

          {currentWeek >= 5 && currentSummary?.wordCount === 0 ? (
            <div className="mt-7 rounded-3xl border border-teal-200 bg-teal-50 p-5">
              <p className="text-xs font-bold tracking-wider text-teal-700">WEEK {currentWeek}</p>
              <h2 className="mt-2 text-xl font-bold text-teal-950">今週使う言葉を用意する</h2>
              <p className="mt-2 text-sm leading-6 text-teal-900/70">これまでの言葉と学習目的をもとに、新しい語を作ります。</p>
              <button
                type="button"
                onClick={() => void generateCurrentWeek()}
                disabled={generating}
                className="mt-4 w-full rounded-2xl bg-teal-700 px-5 py-3 font-bold text-white disabled:opacity-50"
              >
                {generating ? '今週の語を作っています…' : '今週の語を作る'}
              </button>
              {generating ? <p className="mt-3 text-center text-xs font-bold text-teal-700" role="status">少し時間がかかります。この画面でお待ちください。</p> : null}
            </div>
          ) : null}

          <div className="mt-7 space-y-3">
            {weeks.map((week) => {
              const isCurrent = week.week === currentWeek
              const availability = week.week <= 4
                ? '同梱'
                : week.wordCount > 0
                  ? '生成済み'
                  : 'まだ作られていません'

              return (
                <article
                  key={week.week}
                  className={`rounded-2xl border p-4 ${isCurrent ? 'border-teal-400 bg-teal-50 shadow-sm' : 'border-slate-200 bg-white'}`}
                >
                  <div className="flex items-center gap-4">
                    <div className={`grid size-11 shrink-0 place-items-center rounded-2xl text-sm font-bold ${isCurrent ? 'bg-teal-700 text-white' : 'bg-slate-100 text-slate-600'}`}>
                      {week.week}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h2 className="font-bold text-slate-800">第{week.week}週</h2>
                        {isCurrent ? <span className="rounded-full bg-teal-200 px-2 py-0.5 text-[10px] font-bold text-teal-900">今週</span> : null}
                      </div>
                      <p className="mt-1 text-xs text-slate-500">{availability}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold tabular-nums text-slate-700">
                        {week.masteredCount} / {week.wordCount}
                        <span className="ml-1 text-xs text-slate-400">
                          ({Math.round(week.masteryRatio * 100)}%)
                        </span>
                      </p>
                      <p className="mt-1 text-[10px] font-bold text-slate-400">言えた / 語数</p>
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        </>
      )}
    </section>
  )
}
