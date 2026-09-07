-- 同梱カリキュラムの進み具合を lesson_dialogues に相乗りさせる(履歴・聞き流しがそのまま動く)
-- curriculum_id はレッスンの id(01-cafe など)。生成レッスンは NULL のまま。
alter table public.lesson_dialogues
  add column if not exists curriculum_id text,
  add column if not exists last_prompt_accuracy real,
  add column if not exists best_prompt_accuracy real;

-- 同じレッスンの行はユーザー・言語ごとに 1 つ。NULL 同士は衝突しないので生成レッスンは何本でも入る
create unique index if not exists lesson_dialogues_user_lang_curriculum_idx
  on public.lesson_dialogues (user_id, lang, curriculum_id);
