create extension if not exists pgcrypto;

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  interests text[] not null default '{}',
  created_at timestamptz not null default now()
);

create table public.language_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  lang text not null check (lang in ('en', 'ko')),
  current_week int not null default 1,
  started_at date not null default current_date,
  streak int not null default 0,
  last_active_date date,
  created_at timestamptz not null default now(),
  primary key (user_id, lang)
);

create table public.prep_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  lang text not null check (lang in ('en', 'ko')),
  title text not null,
  event_date date,
  created_at timestamptz not null default now()
);

create table public.vocab_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  lang text not null check (lang in ('en', 'ko')),
  week int not null,
  text text not null,
  emoji text,
  hint_ja text,
  example text,
  category text check (category in ('toolbox', 'baby', 'glue', 'core', 'prep')),
  source text check (source in ('bundled', 'generated')),
  prep_event_id uuid references public.prep_events(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (user_id, lang, text)
);

create table public.vocab_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  vocab_item_id uuid not null references public.vocab_items(id) on delete cascade,
  status text check (status in ('new', 'learning', 'known')) not null default 'new',
  correct_count int not null default 0,
  hint_used_count int not null default 0,
  last_reviewed_at timestamptz,
  next_review_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (user_id, vocab_item_id)
);

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  lang text not null check (lang in ('en', 'ko')),
  scenario text,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  turn_count int not null default 0,
  created_at timestamptz not null default now()
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text check (role in ('user', 'assistant')) not null,
  text text not null,
  simpler text,
  ja text,
  shadow_score int,
  created_at timestamptz not null default now()
);

create index vocab_items_user_lang_week_idx
  on public.vocab_items (user_id, lang, week);
create index vocab_progress_user_next_review_idx
  on public.vocab_progress (user_id, next_review_at);
create index messages_conversation_created_idx
  on public.messages (conversation_id, created_at);

alter table public.profiles enable row level security;
alter table public.language_progress enable row level security;
alter table public.prep_events enable row level security;
alter table public.vocab_items enable row level security;
alter table public.vocab_progress enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;

create policy profiles_select_own on public.profiles
  for select using (auth.uid() = user_id);
create policy profiles_insert_own on public.profiles
  for insert with check (auth.uid() = user_id);
create policy profiles_update_own on public.profiles
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy profiles_delete_own on public.profiles
  for delete using (auth.uid() = user_id);

create policy language_progress_select_own on public.language_progress
  for select using (auth.uid() = user_id);
create policy language_progress_insert_own on public.language_progress
  for insert with check (auth.uid() = user_id);
create policy language_progress_update_own on public.language_progress
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy language_progress_delete_own on public.language_progress
  for delete using (auth.uid() = user_id);

create policy prep_events_select_own on public.prep_events
  for select using (auth.uid() = user_id);
create policy prep_events_insert_own on public.prep_events
  for insert with check (auth.uid() = user_id);
create policy prep_events_update_own on public.prep_events
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy prep_events_delete_own on public.prep_events
  for delete using (auth.uid() = user_id);

create policy vocab_items_select_own on public.vocab_items
  for select using (auth.uid() = user_id);
create policy vocab_items_insert_own on public.vocab_items
  for insert with check (auth.uid() = user_id);
create policy vocab_items_update_own on public.vocab_items
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy vocab_items_delete_own on public.vocab_items
  for delete using (auth.uid() = user_id);

create policy vocab_progress_select_own on public.vocab_progress
  for select using (auth.uid() = user_id);
create policy vocab_progress_insert_own on public.vocab_progress
  for insert with check (auth.uid() = user_id);
create policy vocab_progress_update_own on public.vocab_progress
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy vocab_progress_delete_own on public.vocab_progress
  for delete using (auth.uid() = user_id);

create policy conversations_select_own on public.conversations
  for select using (auth.uid() = user_id);
create policy conversations_insert_own on public.conversations
  for insert with check (auth.uid() = user_id);
create policy conversations_update_own on public.conversations
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy conversations_delete_own on public.conversations
  for delete using (auth.uid() = user_id);

create policy messages_select_own on public.messages
  for select using (auth.uid() = user_id);
create policy messages_insert_own on public.messages
  for insert with check (auth.uid() = user_id);
create policy messages_update_own on public.messages
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy messages_delete_own on public.messages
  for delete using (auth.uid() = user_id);
