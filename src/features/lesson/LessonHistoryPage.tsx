import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLanguage } from '../../app/LanguageContext'
import { Toast } from '../../components/Toast'
import { getSession } from '../../services/supabase/auth'
import { listLessonDialogues } from '../../services/supabase/db'
import type { LessonDialogueRow } from '../../services/supabase/types'

export type LessonHistoryRouteState = { dialogue: LessonDialogueRow }

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(value))
}

export function LessonHistoryPage() {
  const { language } = useLanguage()
  const navigate = useNavigate()
  const [rows, setRows] = useState<LessonDialogueRow[]>([])
  const [selected, setSelected] = useState<LessonDialogueRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<unknown>(null)

  useEffect(() => {
    let active = true
    setLoading(true)
    setError(null)
    setSelected(null)

    const load = async () => {
      try {
        const session = await getSession()
        if (!session) {
          throw new Error('ログイン情報を確認できませんでした')
        }
        const dialogues = await listLessonDialogues(session.user.id, language)
        if (active) {
          setRows(dialogues)
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
  }, [language])

  return (
    <section>
      <Toast error={error} onClose={() => setError(null)} />
      <p className="text-sm font-bold text-indigo-700">LESSON HISTORY</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">会話レッスンの履歴</h1>

      {loading ? (
        <p className="mt-8 rounded-2xl bg-white px-5 py-8 text-center text-sm font-bold text-slate-500" role="status">
          履歴を読み込んでいます…
        </p>
      ) : rows.length === 0 ? (
        <p className="mt-8 rounded-2xl bg-white px-5 py-8 text-center text-sm font-bold text-slate-500">
          まだ会話レッスンの履歴はありません。
        </p>
      ) : (
        <div className="mt-7 grid gap-3">
          {rows.map((row) => (
            <button
              key={row.id}
              type="button"
              onClick={() => setSelected(row)}
              className="rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm"
            >
              <span className="block font-bold text-slate-900">{row.scene_ja}</span>
              <span className="mt-2 block text-xs text-slate-500">
                {formatDate(row.created_at)} ・ 完了 {row.times_completed} 回
              </span>
            </button>
          ))}
        </div>
      )}

      {selected ? (
        <div className="mt-7 rounded-3xl border border-indigo-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-bold text-slate-900">{selected.title_ja}</h2>
          <p className="mt-1 text-sm text-slate-500">{selected.scene_ja}</p>
          <div className="mt-5 space-y-3">
            {selected.dialogue.map((turn, index) => (
              <div key={`${turn.speaker}-${index}`} className="rounded-2xl bg-slate-50 px-4 py-3">
                <p className="text-xs font-bold text-indigo-700">{turn.speaker}</p>
                <p className="mt-1 font-bold text-slate-900">{turn.text}</p>
                <p className="mt-1 text-sm text-slate-500">{turn.ja}</p>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => navigate('/lesson', { state: { dialogue: selected } satisfies LessonHistoryRouteState })}
            className="mt-6 w-full rounded-2xl bg-indigo-700 px-5 py-4 font-bold text-white"
          >
            このレッスンをやり直す
          </button>
        </div>
      ) : null}
    </section>
  )
}
