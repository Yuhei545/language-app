import { getSupabaseClient } from './client'
import type {
  ConversationRow,
  Language,
  LanguageProgressInsert,
  LanguageProgressRow,
  MessageInsert,
  MessageRow,
  PrepEventInsert,
  PrepEventRow,
  ProfileRow,
  VocabItemInsert,
  VocabItemRow,
  VocabProgressInsert,
  VocabProgressRow,
} from './types'

export async function getOrCreateProfile(userId: string): Promise<ProfileRow> {
  const client = getSupabaseClient()
  const { data: existing, error: selectError } = await client
    .from('profiles')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()

  if (selectError) {
    throw selectError
  }

  if (existing) {
    return existing
  }

  const { data, error } = await client
    .from('profiles')
    .insert({ user_id: userId })
    .select('*')
    .single()

  if (error) {
    throw error
  }

  return data
}

export async function getLanguageProgress(
  userId: string,
  lang: Language,
): Promise<LanguageProgressRow | null> {
  const { data, error } = await getSupabaseClient()
    .from('language_progress')
    .select('*')
    .eq('user_id', userId)
    .eq('lang', lang)
    .maybeSingle()

  if (error) {
    throw error
  }

  return data
}

export async function upsertLanguageProgress(
  row: LanguageProgressInsert,
): Promise<LanguageProgressRow> {
  const { data, error } = await getSupabaseClient()
    .from('language_progress')
    .upsert(row, { onConflict: 'user_id,lang' })
    .select('*')
    .single()

  if (error) {
    throw error
  }

  return data
}

export async function listVocabItems(
  userId: string,
  lang: Language,
  opts: { week?: number; prepEventId?: string } = {},
): Promise<VocabItemRow[]> {
  let query = getSupabaseClient()
    .from('vocab_items')
    .select('*')
    .eq('user_id', userId)
    .eq('lang', lang)

  if (opts.week !== undefined) {
    query = query.eq('week', opts.week)
  }

  if (opts.prepEventId !== undefined) {
    query = query.eq('prep_event_id', opts.prepEventId)
  }

  const { data, error } = await query.order('week').order('created_at')

  if (error) {
    throw error
  }

  return data
}

export async function upsertVocabItems(rows: VocabItemInsert[]): Promise<VocabItemRow[]> {
  if (rows.length === 0) {
    return []
  }

  const { data, error } = await getSupabaseClient()
    .from('vocab_items')
    .upsert(rows, {
      onConflict: 'user_id,lang,text',
      ignoreDuplicates: true,
    })
    .select('*')

  if (error) {
    throw error
  }

  return data
}

export async function getVocabProgress(
  userId: string,
  vocabItemIds: string[],
): Promise<VocabProgressRow[]> {
  if (vocabItemIds.length === 0) {
    return []
  }

  const { data, error } = await getSupabaseClient()
    .from('vocab_progress')
    .select('*')
    .eq('user_id', userId)
    .in('vocab_item_id', vocabItemIds)

  if (error) {
    throw error
  }

  return data
}

export async function upsertVocabProgress(
  row: VocabProgressInsert,
): Promise<VocabProgressRow> {
  const { data, error } = await getSupabaseClient()
    .from('vocab_progress')
    .upsert(row, { onConflict: 'user_id,vocab_item_id' })
    .select('*')
    .single()

  if (error) {
    throw error
  }

  return data
}

export async function createConversation(
  userId: string,
  lang: Language,
  scenario: string | null,
): Promise<ConversationRow> {
  const { data, error } = await getSupabaseClient()
    .from('conversations')
    .insert({ user_id: userId, lang, scenario })
    .select('*')
    .single()

  if (error) {
    throw error
  }

  return data
}

export async function endConversation(id: string, turnCount: number): Promise<ConversationRow> {
  const { data, error } = await getSupabaseClient()
    .from('conversations')
    .update({ ended_at: new Date().toISOString(), turn_count: turnCount })
    .eq('id', id)
    .select('*')
    .single()

  if (error) {
    throw error
  }

  return data
}

export async function addMessage(row: MessageInsert): Promise<MessageRow> {
  const { data, error } = await getSupabaseClient()
    .from('messages')
    .insert(row)
    .select('*')
    .single()

  if (error) {
    throw error
  }

  return data
}

export async function listMessages(conversationId: string): Promise<MessageRow[]> {
  const { data, error } = await getSupabaseClient()
    .from('messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at')

  if (error) {
    throw error
  }

  return data
}

export async function createPrepEvent(row: PrepEventInsert): Promise<PrepEventRow> {
  const { data, error } = await getSupabaseClient()
    .from('prep_events')
    .insert(row)
    .select('*')
    .single()

  if (error) {
    throw error
  }

  return data
}

export async function listPrepEvents(userId: string, lang: Language): Promise<PrepEventRow[]> {
  const { data, error } = await getSupabaseClient()
    .from('prep_events')
    .select('*')
    .eq('user_id', userId)
    .eq('lang', lang)
    .order('event_date', { ascending: true, nullsFirst: false })

  if (error) {
    throw error
  }

  return data
}
