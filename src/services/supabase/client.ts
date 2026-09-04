import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from './types'

let client: SupabaseClient<Database> | null = null

export function getSupabaseClient(): SupabaseClient<Database> {
  if (client) {
    return client
  }

  const url = import.meta.env.VITE_SUPABASE_URL
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

  if (!url?.trim() || !anonKey?.trim()) {
    throw new Error('.env.example をコピーして .env を作り、Supabase ダッシュボードの Settings → API から URL と anon key を設定してください')
  }

  client = createClient<Database>(url, anonKey)
  return client
}
