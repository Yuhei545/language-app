-- チャンク(型・句動詞・汎用フレーズ)の台帳と、今日の狙い

-- 出会いの記録。追記だけ(集計は下のビュー)
create table if not exists public.chunk_encounters (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  lang text not null check (lang in ('en', 'ko')),
  chunk_key text not null,
  mode text not null,
  kind text not null check (kind in ('seen', 'said')),
  context text not null default '',
  at timestamptz not null default now()
);

create index if not exists chunk_encounters_user_lang_key_at_idx
  on public.chunk_encounters (user_id, lang, chunk_key, at);
create index if not exists chunk_encounters_user_lang_mode_at_idx
  on public.chunk_encounters (user_id, lang, mode, at);

alter table public.chunk_encounters enable row level security;

create policy chunk_encounters_select_own on public.chunk_encounters
  for select using (auth.uid() = user_id);
create policy chunk_encounters_insert_own on public.chunk_encounters
  for insert with check (auth.uid() = user_id);

-- チャンクごとの集計。生の行は日に 100 行ほど増えるので、クライアントはこのビューだけを読む。
-- security_invoker で呼び出し側の RLS を効かせる(Postgres 15 以上)
create or replace view public.chunk_encounter_summary
  with (security_invoker = true) as
select
  user_id,
  lang,
  chunk_key,
  count(*)::int as seen,
  (count(*) filter (where kind = 'said'))::int as said,
  (count(distinct mode || '|' || context))::int as contexts,
  max(at) as last_at,
  (count(*) filter (where at < now() - interval '7 days'))::int as seen_before,
  (count(*) filter (where kind = 'said' and at < now() - interval '7 days'))::int as said_before,
  (count(distinct mode || '|' || context) filter (where at < now() - interval '7 days'))::int as contexts_before
from public.chunk_encounters
group by user_id, lang, chunk_key;

-- その日の狙い。同じ日は同じ狙いを出す
create table if not exists public.daily_targets (
  user_id uuid not null references auth.users(id) on delete cascade,
  lang text not null check (lang in ('en', 'ko')),
  day date not null,
  chunk_keys jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  primary key (user_id, lang, day)
);

alter table public.daily_targets enable row level security;

create policy daily_targets_select_own on public.daily_targets
  for select using (auth.uid() = user_id);
create policy daily_targets_insert_own on public.daily_targets
  for insert with check (auth.uid() = user_id);
create policy daily_targets_update_own on public.daily_targets
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 型・句動詞のカードを台帳と結ぶ
alter table public.vocab_items add column if not exists chunk_key text;
create index if not exists vocab_items_user_lang_chunk_key_idx
  on public.vocab_items (user_id, lang, chunk_key);
