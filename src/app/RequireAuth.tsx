import { useCallback, useEffect, useRef, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { Navigate, Outlet } from 'react-router-dom'
import { getSession, onAuthStateChange } from '../services/supabase/auth'
import { retireOutdatedEnglish } from '../services/supabase/retire'
import { seedBundledVocab } from '../services/supabase/seed'
import { ledgerError } from '../features/chunks/record'
import { seedCoreChunks } from '../features/chunks/seedChunks'
import { describeError } from '../utils/errorMessage'

/**
 * ログイン後の下ごしらえ。2 つの仕事は独立していて、片方が落ちてももう片方は進む。
 * 以前は 1 つのエラー欄を共有していたため、後から落ちた方が先の知らせを上書きしていた。
 */
export type SeedTask = 'vocab' | 'chunks'

export const SEED_TASK_LABEL: Record<SeedTask, string> = {
  vocab: '同梱語彙を準備できませんでした',
  chunks: '型・句動詞のカードを用意できませんでした',
}

export function RequireAuth() {
  const [session, setSession] = useState<Session | null>(null)
  const [checking, setChecking] = useState(true)
  const [authError, setAuthError] = useState<string | null>(null)
  const [seedErrors, setSeedErrors] = useState<Partial<Record<SeedTask, string>>>({})
  const [dismissed, setDismissed] = useState(false)
  /** 「もう一度試す」で数を増やし、下ごしらえをやり直す。 */
  const [attempt, setAttempt] = useState(0)
  const seededKey = useRef<string | null>(null)

  useEffect(() => {
    let active = true
    let unsubscribe: () => void = () => undefined

    const checkSession = async () => {
      try {
        unsubscribe = onAuthStateChange((_event, nextSession) => {
          if (!active) {
            return
          }

          setSession(nextSession)
          setAuthError(null)
          setChecking(false)
        })

        const currentSession = await getSession()
        if (active) {
          setSession(currentSession)
        }
      } catch (error) {
        console.error('セッションの確認に失敗しました', error)
        if (active) {
          setAuthError(describeError(error))
        }
      } finally {
        if (active) {
          setChecking(false)
        }
      }
    }

    void checkSession()

    return () => {
      active = false
      unsubscribe()
    }
  }, [])

  const userId = session?.user.id

  useEffect(() => {
    if (!userId) {
      return undefined
    }
    const key = `${userId}:${attempt}`
    if (seededKey.current === key) {
      return undefined
    }

    let active = true
    seededKey.current = key
    setSeedErrors({})
    setDismissed(false)

    const fail = (task: SeedTask, message: string) => {
      if (active) {
        setSeedErrors((previous) => ({ ...previous, [task]: message }))
      }
    }

    Promise.all([
      seedBundledVocab(userId, 'en'),
      seedBundledVocab(userId, 'ko'),
    ])
      // 英語の旧・基礎語(2026-09-05 に実践フレーズへ差し替え)を「知っている」扱いにして復習に出さない
      .then(() => retireOutdatedEnglish(userId))
      .catch((error: unknown) => {
        console.error('同梱語彙の準備に失敗しました', error)
        fail('vocab', describeError(error))
      })

    // 型・句動詞もカードにする(週 0。台帳と chunk_key で結ぶ)。006 未適用なら実行の案内を出す(練習は続けられる)
    Promise.all([
      seedCoreChunks(userId, 'en'),
      seedCoreChunks(userId, 'ko'),
    ]).catch((error: unknown) => {
      console.error('型・句動詞のカードの用意に失敗しました', error)
      fail('chunks', ledgerError(error).message)
    })

    return () => {
      active = false
    }
  }, [attempt, userId])

  const retry = useCallback(() => {
    setAttempt((previous) => previous + 1)
  }, [])

  if (checking) {
    return (
      <div className="grid min-h-dvh place-items-center bg-teal-50 px-6 text-center text-sm font-bold text-teal-800" role="status">
        セッションを確認しています…
      </div>
    )
  }

  if (authError) {
    return (
      <div className="grid min-h-dvh place-items-center bg-teal-50 px-6">
        <div className="w-full max-w-md rounded-2xl border border-red-200 bg-white p-5 text-red-800 shadow-sm" role="alert">
          <h1 className="font-bold">Supabaseに接続できません</h1>
          <p className="mt-2 text-sm leading-6">{authError}</p>
        </div>
      </div>
    )
  }

  if (!session) {
    return <Navigate to="/login" replace />
  }

  const failures = (Object.keys(SEED_TASK_LABEL) as SeedTask[])
    .flatMap((task) => {
      const message = seedErrors[task]
      return message ? [{ task, message }] : []
    })

  return (
    <>
      {failures.length > 0 && !dismissed ? (
        <div
          className="fixed inset-x-3 top-3 z-50 mx-auto max-w-[448px] rounded-xl bg-red-700 px-4 py-3 text-sm text-white shadow-lg"
          role="alert"
        >
          <ul className="space-y-2">
            {failures.map(({ task, message }) => (
              <li key={task}>
                <p className="font-bold">{SEED_TASK_LABEL[task]}</p>
                <p className="mt-0.5 text-xs leading-5 text-red-50">{message}</p>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={retry}
              className="rounded-lg bg-white px-3 py-1.5 text-xs font-bold text-red-800"
            >
              もう一度試す
            </button>
            <button
              type="button"
              onClick={() => setDismissed(true)}
              className="rounded-lg border border-red-300 px-3 py-1.5 text-xs font-bold text-white"
            >
              閉じる
            </button>
          </div>
        </div>
      ) : null}
      <Outlet />
    </>
  )
}
