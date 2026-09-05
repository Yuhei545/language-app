alter table public.language_progress
  add column if not exists week_started_at date;

create table public.mixing_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  lang text not null check (lang in ('en', 'ko')),
  frame_id text not null,
  verb_text text not null default '',
  noun_text text not null default '',
  understood_count int not null default 0,
  attempt_count int not null default 0,
  last_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (user_id, lang, frame_id, verb_text, noun_text)
);

create table public.dictation_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  lang text not null check (lang in ('en', 'ko')),
  sentence_id text not null,
  best_ratio real not null default 0,
  attempts int not null default 0,
  last_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (user_id, lang, sentence_id)
);

create index mixing_progress_user_lang_last_at_idx
  on public.mixing_progress (user_id, lang, last_at);
create index dictation_progress_user_lang_best_ratio_idx
  on public.dictation_progress (user_id, lang, best_ratio);

alter table public.mixing_progress enable row level security;
alter table public.dictation_progress enable row level security;

create policy mixing_progress_select_own on public.mixing_progress
  for select using (auth.uid() = user_id);
create policy mixing_progress_insert_own on public.mixing_progress
  for insert with check (auth.uid() = user_id);
create policy mixing_progress_update_own on public.mixing_progress
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy mixing_progress_delete_own on public.mixing_progress
  for delete using (auth.uid() = user_id);

create policy dictation_progress_select_own on public.dictation_progress
  for select using (auth.uid() = user_id);
create policy dictation_progress_insert_own on public.dictation_progress
  for insert with check (auth.uid() = user_id);
create policy dictation_progress_update_own on public.dictation_progress
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy dictation_progress_delete_own on public.dictation_progress
  for delete using (auth.uid() = user_id);
