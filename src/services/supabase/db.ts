import { getSupabaseClient } from './client'
import type {
  ConversationRow,
  DictationProgressInsert,
  DictationProgressRow,
  Language,
  LanguageProgressInsert,
  LanguageProgressRow,
  MessageInsert,
  MessageRow,
  MixingProgressInsert,
  MixingProgressRow,
  PrepEventInsert,
  PrepEventRow,
  ProfileRow,
  VocabItemInsert,
  VocabItemRow,
  VocabProgressInsert,
  VocabProgressRow,
} from './types'

export async function getOrCreateProfile(userId: string): Promise<ProfileRow> {
  // 「調べてから挿入」だと同時に2回呼ばれた時に両方が挿入して重複キーになる
  // (React StrictMode の二重 effect、PC とスマホの同時ログイン)。
  // upsert なら Postgres 側で ON CONFLICT が原子的に処理する。
  // payload は user_id だけなので、既存行の interests や created_at は触らない。
  const { data, error } = await getSupabaseClient()
    .from('profiles')
    .upsert({ user_id: userId }, { onConflict: 'user_id' })
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

export async function advanceLanguageWeek(
  userId: string,
  lang: Language,
  nextWeek: number,
  today: string,
): Promise<LanguageProgressRow> {
  const { data, error } = await getSupabaseClient()
    .from('language_progress')
    .update({ current_week: nextWeek, week_started_at: today })
    .eq('user_id', userId)
    .eq('lang', lang)
    .select('*')
    .single()

  if (error) {
    throw error
  }

  return data
}

export async function listMixingProgress(
  userId: string,
  lang: Language,
): Promise<MixingProgressRow[]> {
  const { data, error } = await getSupabaseClient()
    .from('mixing_progress')
    .select('*')
    .eq('user_id', userId)
    .eq('lang', lang)

  if (error) {
    throw error
  }

  return data
}

export async function upsertMixingProgress(
  row: MixingProgressInsert,
): Promise<MixingProgressRow> {
  const { data, error } = await getSupabaseClient()
    .from('mixing_progress')
    .upsert(row, { onConflict: 'user_id,lang,frame_id,verb_text,noun_text' })
    .select('*')
    .single()

  if (error) {
    throw error
  }

  return data
}

export async function listDictationProgress(
  userId: string,
  lang: Language,
): Promise<DictationProgressRow[]> {
  const { data, error } = await getSupabaseClient()
    .from('dictation_progress')
    .select('*')
    .eq('user_id', userId)
    .eq('lang', lang)

  if (error) {
    throw error
  }

  return data
}

export async function upsertDictationProgress(
  row: DictationProgressInsert,
): Promise<DictationProgressRow> {
  const { data, error } = await getSupabaseClient()
    .from('dictation_progress')
    .upsert(row, { onConflict: 'user_id,lang,sentence_id' })
    .select('*')
    .single()

  if (error) {
    throw error
  }

  return data
}

export async function countDictationToday(
  userId: string,
  lang: Language,
  dayStartIso: string,
): Promise<number> {
  const dayStart = new Date(dayStartIso)
  if (Number.isNaN(dayStart.getTime())) {
    throw new Error(`今日の開始日時を解釈できません: ${dayStartIso}`)
  }

  const tomorrowStart = new Date(dayStart)
  tomorrowStart.setDate(tomorrowStart.getDate() + 1)

  const { count, error } = await getSupabaseClient()
    .from('dictation_progress')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('lang', lang)
    .gte('last_at', dayStart.toISOString())
    .lt('last_at', tomorrowStart.toISOString())

  if (error) {
    throw error
  }

  return count ?? 0
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

export async function countConversationsToday(
  userId: string,
  lang: Language,
  todayIso: string,
): Promise<number> {
  const todayStart = new Date(todayIso)
  if (Number.isNaN(todayStart.getTime())) {
    throw new Error(`今日の日付を解釈できません: ${todayIso}`)
  }

  const tomorrowStart = new Date(todayStart)
  tomorrowStart.setDate(tomorrowStart.getDate() + 1)

  const { count, error } = await getSupabaseClient()
    .from('conversations')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('lang', lang)
    .gte('started_at', todayStart.toISOString())
    .lt('started_at', tomorrowStart.toISOString())

  if (error) {
    throw error
  }

  return count ?? 0
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

export async function updateMessageShadowScore(
  id: string,
  shadowScore: number,
): Promise<MessageRow> {
  const { data, error } = await getSupabaseClient()
    .from('messages')
    .update({ shadow_score: shadowScore })
    .eq('id', id)
    .select('*')
    .single()

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
