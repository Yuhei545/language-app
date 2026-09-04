import type { AuthChangeEvent, Session } from '@supabase/supabase-js'
import { getSupabaseClient } from './client'

export type AuthStateChangeCallback = (event: AuthChangeEvent, session: Session | null) => void

export async function signIn(email: string, password: string): Promise<Session | null> {
  const { data, error } = await getSupabaseClient().auth.signInWithPassword({ email, password })

  if (error) {
    throw error
  }

  return data.session
}

export async function signOut(): Promise<void> {
  const { error } = await getSupabaseClient().auth.signOut()

  if (error) {
    throw error
  }
}

export async function getSession(): Promise<Session | null> {
  const { data, error } = await getSupabaseClient().auth.getSession()

  if (error) {
    throw error
  }

  return data.session
}

export function onAuthStateChange(callback: AuthStateChangeCallback): () => void {
  const { data } = getSupabaseClient().auth.onAuthStateChange(callback)
  return () => data.subscription.unsubscribe()
}
