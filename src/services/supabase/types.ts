export type Language = 'en' | 'ko'
export type VocabCategory = 'toolbox' | 'baby' | 'glue' | 'core' | 'prep' | 'dialogue'
export type VocabSource = 'bundled' | 'generated'
export type VocabStatus = 'new' | 'learning' | 'known'
export type MessageRole = 'user' | 'assistant'

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
  last_at: string | null
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
  last_at?: string | null
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
      dictation_progress: TableDefinition<DictationProgressRow, DictationProgressInsert>
      lesson_dialogues: TableDefinition<LessonDialogueRow, LessonDialogueInsert>
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
