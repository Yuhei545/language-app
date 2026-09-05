-- P6: 会話ベースの音声レッスン(2026-09-05)
-- Supabase の SQL Editor に貼り付けて上から実行する。
-- vocab_items の制約名は Supabase の Table Editor で確認してください。

create table public.lesson_dialogues (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  lang text not null check (lang in ('en', 'ko')),
  scene_ja text not null,
  title_ja text not null,
  dialogue jsonb not null,
  new_expressions jsonb not null,
  times_completed int not null default 0,
  last_completed_at timestamptz,
  created_at timestamptz not null default now()
);

create index lesson_dialogues_user_lang_created_idx
  on public.lesson_dialogues (user_id, lang, created_at);

alter table public.lesson_dialogues enable row level security;

create policy lesson_dialogues_select_own on public.lesson_dialogues
  for select using (auth.uid() = user_id);
create policy lesson_dialogues_insert_own on public.lesson_dialogues
  for insert with check (auth.uid() = user_id);
create policy lesson_dialogues_update_own on public.lesson_dialogues
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy lesson_dialogues_delete_own on public.lesson_dialogues
  for delete using (auth.uid() = user_id);

-- レッスンで学んだ表現を vocab_items に入れるため、category に 'dialogue' を追加する。
-- 制約名は 001_init.sql の列内 check から Postgres が付ける既定名。
-- もしエラーになったら Table Editor → vocab_items → Constraints で実際の名前を確認して置き換える。
alter table public.vocab_items
  drop constraint if exists vocab_items_category_check;
alter table public.vocab_items
  add constraint vocab_items_category_check
  check (category in ('toolbox', 'baby', 'glue', 'core', 'prep', 'dialogue'));
