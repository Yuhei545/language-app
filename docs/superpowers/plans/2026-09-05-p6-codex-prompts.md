# P6 Codex 指示文(2026-09-05 作成、Codex 復帰後に順番どおり送る)

前提: 設計書 `docs/superpowers/specs/2026-09-04-language-app-design.md` の 16 章。
共通の注意: 検証は `npx tsc --noEmit -p tsconfig.app.json`。npm install / build / test / git commit は実行しない。
`src/content/**/*.json` は読み取り専用。

---

## P6a: 会話ベースのレッスンの土台(画面は P6b)

### 1. `src/features/lesson/lessonDialogueSchema.ts`(+ test)
```ts
export type DialogueTurn = { speaker: 'A' | 'B'; text: string; ja: string }
export type NewExpression = { text: string; ja: string; note_ja: string; turn_index: number }
export type LessonDialogue = { title_ja: string; scene_ja: string; turns: DialogueTurn[]; new_expressions: NewExpression[] }
export type DialogueIssue = { code: 'turns' | 'alternation' | 'length' | 'expressions' | 'ratio' | 'script'; message: string }
export function validateDialogue(
  json: unknown,
  opts: { lang: 'en' | 'ko'; knownWords: string[] },
): { ok: true; dialogue: LessonDialogue; ratio: number } | { ok: false; issues: DialogueIssue[]; ratio: number }
```
検査規則は設計書 16 章「機械検査」のとおり。トークン化は `normalizeText`(`src/services/speech/normalize.ts`)で正規化して空白分割。
新表現に含まれる語は比率計算から除く。テスト: 合格例(en/ko)、往復数不足、交互でない、行が長い、新表現が本文に無い、
比率不足(en 0.7 → ratio 不合格)、英語行にハングル混入。

### 2. `src/services/gemini/prompts.ts`: `buildDialoguePrompt(input)`(+ test)
入力: `lang`、`sceneJa`、`interests`、`knownWords`(最大 300 に切る)、`level`('practical-b1' | 'beginner')、
`retryIssues?: DialogueIssue[]`(再生成時に「前回の問題点」として列挙)。
規則(英語で書く): A は相手役、B は学習者役。6〜8 往復、A から。1 行は英語 14 語 / 韓国語 30 文字以内。
既知語を優先し、新しい表現は 4〜6 個だけ、自然な会話にする。各行の日本語訳、新表現には使い方の日本語 1 文。
テスト: 場面・既知語・レベルが本文に入る、`retryIssues` があるとその message が列挙される、`knownWords` が 300 に切られる。

### 3. `src/services/gemini/schemas.ts`: `dialogueSchema`(上記 JSON。全フィールド required、`speaker` は enum)

### 4. `src/services/gemini/dialogue.ts`: `generateDialogue(params, opts?: { signal? })`
`buildDialoguePrompt` → `generateContent`(JSON モード、`temperature: 0.8`)→ `validateDialogue`。
不合格なら `retryIssues` を付けて 1 回だけ再生成。2 回目も不合格のとき、issues が `ratio` のみで不足が 0.1 未満なら採用、
それ以外は `GeminiError(kind: 'parse')` に issues を日本語で列挙して throw。

### 5. `supabase/migrations/003_lesson_dialogues.sql`
設計書 16 章「データ」のとおり。`vocab_items_category_check` を drop → `'dialogue'` を含めて再作成。
RLS と own ポリシー 4 種、`lesson_dialogues (user_id, lang, created_at)` にインデックス。

### 6. `src/services/supabase/types.ts` / `db.ts`
`LessonDialogueRow/Insert`、`saveLessonDialogue(row)`、`listLessonDialogues(userId, lang, limit = 20)`、
`markDialogueCompleted(id)`(`times_completed + 1`、`last_completed_at = now`)。`VocabCategory` に `'dialogue'`。

### 7. 設定と TTS
`settings.ts` に `ttsVoiceB: { en: string | null; ko: string | null }`(既定 null)。`settings.test.ts` の既定値更新。
`tts.ts` の `speak` に `pitch?: number`(0.5〜2、既定 1)。`hasVoiceFor` は変更なし。

### 8. `src/features/lesson/dialoguePlan.ts`(+ test、純粋関数)
```ts
export function buildDialogueLesson(
  dialogue: LessonDialogue,
  opts: { lang: 'en' | 'ko'; pauseSeconds: number; currentWeek: number },
): { steps: DialogueLessonStep[]; items: LessonItem[] }
```
`DialogueLessonStep = { kind: 'intro' | 'breakdown' | 'replay' | 'recall' | 'closing' | 'summary'; label: string;
speaker?: 'A' | 'B' | 'you'; actions: LessonAction[]; item?: LessonItem; stage?: LessonStage }`
順序と各ステップの行動列は設計書 16 章の 2〜6。再出題は `buildSchedule(items)` から stage 0 を除いて差し込む
(`slotSeconds` は既存既定)。`LessonAction` の `speak` に `voice: 'A' | 'B' | 'narrator'` を追加し、実行側で声を割り当てる。
テスト: 新表現 5 個で intro 1・breakdown 5・replay 1・closing = B の行数・summary 1 になる / recall の stage が 1〜4 のみ /
closing の各ステップに直前の A の行の speak が含まれる。

### 完了条件: tsc が通り、1・2・8 のテストがある。
### 禁止: `src/features/lesson/{schedule,backChain,material,plan}.ts` の既存関数の仕様変更(`LessonAction` への任意項目追加は可)、
画面の変更、`src/content/**`、`docs/`。

---

## P6b: 画面(場面選択・会話モード・履歴・B の声)

### 1. 場面選択 `src/features/lesson/ScenePicker.tsx`(+ test)
目的タグごとの定型場面(設計書 16 章 1)、準備モードの予定(`listPrepEvents` の今日以降)、自由入力。既定選択なし。
「このレッスンを作る」で `generateDialogue` → 生成中の表示(10〜20 秒かかる旨)→ 失敗は Toast に issues を表示し選び直し。

### 2. `useLesson.ts` の会話モード
`mode: 'dialogue'` を追加(従来の単語モードは残す)。`buildDialogueLesson` の `steps` を順に実行。
既存の世代番号方式・一時停止・スキップ・終了・録音・警告はそのまま使う。`speak` の `voice` で
`ttsVoice`(A / narrator)と `ttsVoiceB`(B)を割り当て、B が null なら `rate 0.95` `pitch 0.9`。
終了時に `markDialogueCompleted`、新表現を `upsertVocabItems`(`category: 'dialogue'`)。

### 3. `LessonPage.tsx`
`ready` の前に `ScenePicker`。`running` に「話しているのは: A / B / あなた」と現在ステップの `label`。
`closing` の間は B の日本語(`ja`)を大きく、模範の英語/韓国語は模範の読み上げ中だけ表示。
`finished` に会話全文(A/B の文字と日本語)、新表現一覧、「もう一度」「別の場面で」「履歴」。

### 4. 履歴 `src/features/lesson/LessonHistoryPage.tsx`(`/lesson/history`)
`listLessonDialogues` の一覧(場面・日付・回数)。タップで会話の文字を読み、「このレッスンをやり直す」。

### 5. 設定画面
「読み上げ」に「会話の相手役(B)の声」を追加(既存の VoiceSelect を流用、言語ごと)。

### 完了条件: tsc が通り、ScenePicker のテスト(定型場面が描画・自由入力で有効化)がある。
### 禁止: `src/features/{cards,talk,mixing,dictation,home}/**`、`src/content/**`、`docs/`、`supabase/`。
