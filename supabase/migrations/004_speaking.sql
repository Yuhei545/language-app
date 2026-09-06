alter table public.mixing_progress
  add column first_try_count int not null default 0,
  add column hint_count int not null default 0,
  add column latency_ms_total int not null default 0,
  add column latency_samples int not null default 0;

create table public.speaking_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  lang text not null check (lang in ('en', 'ko')),
  kind text not null check (kind in ('pattern', 'topic', 'quick')),
  rounds jsonb not null default '[]'::jsonb,
  understood_ratio real,
  avg_latency_ms int,
  created_at timestamptz not null default now()
);

create index speaking_sessions_user_lang_kind_created_at_idx
  on public.speaking_sessions (user_id, lang, kind, created_at);

alter table public.speaking_sessions enable row level security;

create policy speaking_sessions_select_own on public.speaking_sessions
  for select using (auth.uid() = user_id);
create policy speaking_sessions_insert_own on public.speaking_sessions
  for insert with check (auth.uid() = user_id);
