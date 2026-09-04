import { useEffect, useRef, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { Navigate, Outlet } from 'react-router-dom'
import { getSession, onAuthStateChange } from '../services/supabase/auth'
import { seedBundledVocab } from '../services/supabase/seed'

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '不明なエラーが発生しました'
}

export function RequireAuth() {
  const [session, setSession] = useState<Session | null>(null)
  const [checking, setChecking] = useState(true)
  const [authError, setAuthError] = useState<string | null>(null)
  const [seedError, setSeedError] = useState<string | null>(null)
  const seededUserId = useRef<string | null>(null)

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
          setAuthError(errorMessage(error))
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

  useEffect(() => {
    const userId = session?.user.id
    if (!userId || seededUserId.current === userId) {
      return
    }

    let active = true
    seededUserId.current = userId
    setSeedError(null)

    Promise.all([
      seedBundledVocab(userId, 'en'),
      seedBundledVocab(userId, 'ko'),
    ]).catch((error: unknown) => {
      if (active) {
        setSeedError(`同梱語彙を準備できませんでした: ${errorMessage(error)}`)
      }
    })

    return () => {
      active = false
    }
  }, [session?.user.id])

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

  return (
    <>
      {seedError ? (
        <div className="fixed inset-x-3 top-3 z-50 mx-auto max-w-[448px] rounded-xl bg-red-700 px-4 py-3 text-sm font-bold text-white shadow-lg" role="alert">
          {seedError}
        </div>
      ) : null}
      <Outlet />
    </>
  )
}
