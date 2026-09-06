export type Language = 'en' | 'ko'
export type VocabCategory = 'toolbox' | 'baby' | 'glue' | 'core' | 'prep' | 'dialogue'
export type VocabSource = 'bundled' | 'generated'
export type VocabStatus = 'new' | 'learning' | 'known'
export type MessageRole = 'user' | 'assistant'
export type SpeakingSessionKind = 'pattern' | 'topic' | 'quick'
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type ProfileRow = {
  user_id: string
  interests: string[]
  created_at: string
}

export type LanguageProgressRow = {
  user_id: string
  lang: Language
  current_week: number
  started_at: string
  week_started_at: string | null
  streak: number
  last_active_date: string | null
  created_at: string
}

export type PrepEventRow = {
  id: string
  user_id: string
  lang: Language | null
  title: string
  event_date: string | null
  created_at: string
}

export type VocabItemRow = {
  id: string
  user_id: string
  lang: Language | null
  week: number
  text: string
  emoji: string | null
  hint_ja: string | null
  example: string | null
  category: VocabCategory | null
  source: VocabSource | null
  prep_event_id: string | null
  created_at: string
  /** 型・句動詞の種まきカードを台帳と結ぶ。 */
  chunk_key: string | null
}

export type VocabProgressRow = {
  user_id: string
  vocab_item_id: string
  status: VocabStatus
  correct_count: number
  hint_used_count: number
  last_reviewed_at: string | null
  next_review_at: string | null
  created_at: string
}

export type ConversationRow = {
  id: string
  user_id: string
  lang: Language | null
  scenario: string | null
  started_at: string
  ended_at: string | null
  turn_count: number
  created_at: string
}

export type MessageRow = {
  id: string
  conversation_id: string
  user_id: string
  role: MessageRole
  text: string
  simpler: string | null
  ja: string | null
  shadow_score: number | null
  created_at: string
}

export type MixingProgressRow = {
  user_id: string
  lang: Language
  frame_id: string
  verb_text: string
  noun_text: string
  understood_count: number
  attempt_count: number
  first_try_count: number
  hint_count: number
  latency_ms_total: number
  latency_samples: number
  last_at: string | null
  created_at: string
}

export type SpeakingSessionRow = {
  id: string
  user_id: string
  lang: Language
  kind: SpeakingSessionKind
  rounds: Json
  understood_ratio: number | null
  avg_latency_ms: number | null
  created_at: string
}

export type DictationProgressRow = {
  user_id: string
  lang: Language
  sentence_id: string
  best_ratio: number
  attempts: number
  last_at: string | null
  created_at: string
  /** 出題の段階。cloze は音の現象の箇所だけ穴埋め、full は全文書き取り。 */
  stage: 'cloze' | 'full'
  /** 忘却曲線の箱。上がるほど次までの間隔が長い。 */
  box: number
  correct_streak: number
  next_review_at: string | null
}

/** 音の現象ごとの成績。苦手な現象を優先して出すために使う。 */
export type DictationFeatureStatRow = {
  user_id: string
  lang: Language
  feature_id: string
  attempts: number
  correct: number
  last_at: string | null
  created_at: string
}

export type DictationFeatureStatInsert = {
  user_id: string
  lang: Language
  feature_id: string
  attempts?: number
  correct?: number
  last_at?: string | null
  created_at?: string
}

export type LessonDialogueRow = {
  id: string
  user_id: string
  lang: Language
  scene_ja: string
  title_ja: string
  dialogue: Array<{ speaker: 'A' | 'B'; text: string; ja: string }>
  new_expressions: Array<{
    text: string
    ja: string
    note_ja: string
    turn_index: number
  }>
  times_completed: number
  last_completed_at: string | null
  created_at: string
}

export type ProfileInsert = {
  user_id: string
  interests?: string[]
  created_at?: string
}

export type LanguageProgressInsert = {
  user_id: string
  lang: Language
  current_week?: number
  started_at?: string
  week_started_at?: string | null
  streak?: number
  last_active_date?: string | null
  created_at?: string
}

export type PrepEventInsert = {
  id?: string
  user_id: string
  lang?: Language | null
  title: string
  event_date?: string | null
  created_at?: string
}

export type VocabItemInsert = {
  id?: string
  user_id: string
  lang?: Language | null
  week: number
  text: string
  emoji?: string | null
  hint_ja?: string | null
  example?: string | null
  category?: VocabCategory | null
  source?: VocabSource | null
  prep_event_id?: string | null
  created_at?: string
  chunk_key?: string | null
}

export type VocabProgressInsert = {
  user_id: string
  vocab_item_id: string
  status?: VocabStatus
  correct_count?: number
  hint_used_count?: number
  last_reviewed_at?: string | null
  next_review_at?: string | null
  created_at?: string
}

export type ConversationInsert = {
  id?: string
  user_id: string
  lang?: Language | null
  scenario?: string | null
  started_at?: string
  ended_at?: string | null
  turn_count?: number
  created_at?: string
}

export type MessageInsert = {
  id?: string
  conversation_id: string
  user_id: string
  role: MessageRole
  text: string
  simpler?: string | null
  ja?: string | null
  shadow_score?: number | null
  created_at?: string
}

export type MixingProgressInsert = {
  user_id: string
  lang: Language
  frame_id: string
  verb_text?: string
  noun_text?: string
  understood_count?: number
  attempt_count?: number
  first_try_count?: number
  hint_count?: number
  latency_ms_total?: number
  latency_samples?: number
  last_at?: string | null
  created_at?: string
}

export type SpeakingSessionInsert = {
  id?: string
  user_id: string
  lang: Language
  kind: SpeakingSessionKind
  rounds?: Json
  understood_ratio?: number | null
  avg_latency_ms?: number | null
  created_at?: string
}

export type DictationProgressInsert = {
  user_id: string
  lang: Language
  sentence_id: string
  best_ratio?: number
  attempts?: number
  last_at?: string | null
  created_at?: string
  stage?: 'cloze' | 'full'
  box?: number
  correct_streak?: number
  next_review_at?: string | null
}

export type LessonDialogueInsert = {
  id?: string
  user_id: string
  lang: Language
  scene_ja: string
  title_ja: string
  dialogue: LessonDialogueRow['dialogue']
  new_expressions: LessonDialogueRow['new_expressions']
  times_completed?: number
  last_completed_at?: string | null
  created_at?: string
}

export type ChunkEncounterKind = 'seen' | 'said'

export type ChunkEncounterRow = {
  id: number
  user_id: string
  lang: Language
  chunk_key: string
  mode: string
  kind: ChunkEncounterKind
  context: string
  at: string
}

export type ChunkEncounterInsert = {
  id?: number
  user_id: string
  lang: Language
  chunk_key: string
  mode: string
  kind: ChunkEncounterKind
  context?: string
  at?: string
}

/** ビュー chunk_encounter_summary の 1 行(全期間の集計 + 1 週間前の時点の数)。 */
export type ChunkEncounterSummaryRow = {
  user_id: string
  lang: Language
  chunk_key: string
  seen: number
  said: number
  contexts: number
  last_at: string
  seen_before: number
  said_before: number
  contexts_before: number
}

export type DailyTargetsRow = {
  user_id: string
  lang: Language
  day: string
  chunk_keys: string[]
  created_at: string
}

export type DailyTargetsInsert = {
  user_id: string
  lang: Language
  day: string
  chunk_keys: string[]
  created_at?: string
}

type TableDefinition<Row, Insert> = {
  Row: Row
  Insert: Insert
  Update: Partial<Insert>
  Relationships: []
}

export type Database = {
  public: {
    Tables: {
      profiles: TableDefinition<ProfileRow, ProfileInsert>
      language_progress: TableDefinition<LanguageProgressRow, LanguageProgressInsert>
      prep_events: TableDefinition<PrepEventRow, PrepEventInsert>
      vocab_items: TableDefinition<VocabItemRow, VocabItemInsert>
      vocab_progress: TableDefinition<VocabProgressRow, VocabProgressInsert>
      conversations: TableDefinition<ConversationRow, ConversationInsert>
      messages: TableDefinition<MessageRow, MessageInsert>
      mixing_progress: TableDefinition<MixingProgressRow, MixingProgressInsert>
      speaking_sessions: TableDefinition<SpeakingSessionRow, SpeakingSessionInsert>
      dictation_progress: TableDefinition<DictationProgressRow, DictationProgressInsert>
      dictation_feature_stats: TableDefinition<DictationFeatureStatRow, DictationFeatureStatInsert>
      lesson_dialogues: TableDefinition<LessonDialogueRow, LessonDialogueInsert>
      chunk_encounters: TableDefinition<ChunkEncounterRow, ChunkEncounterInsert>
      daily_targets: TableDefinition<DailyTargetsRow, DailyTargetsInsert>
    }
    Views: {
      chunk_encounter_summary: { Row: ChunkEncounterSummaryRow; Relationships: [] }
    }
    Functions: Record<string, never>
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
