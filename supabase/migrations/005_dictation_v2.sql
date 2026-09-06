-- ディクテーション v2: 段階(穴埋め→全文)、忘却曲線に基づく再出題、音の現象ごとの成績

alter table public.dictation_progress
  add column if not exists stage text not null default 'cloze' check (stage in ('cloze', 'full')),
  add column if not exists box int not null default 0,
  add column if not exists correct_streak int not null default 0,
  add column if not exists next_review_at timestamptz;

create index if not exists dictation_progress_user_lang_next_review_idx
  on public.dictation_progress (user_id, lang, next_review_at);

create table if not exists public.dictation_feature_stats (
  user_id uuid not null references auth.users(id) on delete cascade,
  lang text not null check (lang in ('en', 'ko')),
  feature_id text not null,
  attempts int not null default 0,
  correct int not null default 0,
  last_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (user_id, lang, feature_id)
);

alter table public.dictation_feature_stats enable row level security;

create policy dictation_feature_stats_select_own on public.dictation_feature_stats
  for select using (auth.uid() = user_id);
create policy dictation_feature_stats_insert_own on public.dictation_feature_stats
  for insert with check (auth.uid() = user_id);
create policy dictation_feature_stats_update_own on public.dictation_feature_stats
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
