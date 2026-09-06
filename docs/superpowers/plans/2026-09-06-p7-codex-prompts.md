# P7 Codex 指示文(P7a → P7b → P7c)

P7a は 2026-09-06 に送信済み(スレッド 01a07410-0c2e-7af2-ba6d-35dd2da2a6ac)。

## P7b: Gemini プロンプトとスキーマ

設計書: docs/superpowers/specs/2026-09-06-p7-instant-build-design.md

### 目的
段階 2(お題で言う)と段階 3(即答)、自分の語の翻訳に使う Gemini 呼び出しを、プロンプト・スキーマ・呼び出し関数・テストとして実装する。画面は作らない。

### 対象ファイル
- 変更: src/services/gemini/prompts.ts(+ prompts.test.ts に追記)、src/services/gemini/schemas.ts
- 新規: src/services/gemini/speaking.ts(+ speaking.test.ts: generateContent をモックして JSON 解釈と検証を確認)
- 参考(変更しない): src/services/gemini/parent.ts の checkMixingTurn、dialogue.ts の httpOptions の使い方、client.ts の LONG_GENERATION_TIMEOUT_MS / TRANSIENT_RETRY

### 手順
1. `buildTopicCheckPrompt({ lang, personaName, topicJa, learnerText, previousTurn? })`: 学習者はお題に沿って話した。文法の正誤は判定せず「意味が伝わったか」だけ。返す JSON: `understood: boolean`、`recast: string`(伝わった内容を自然な一文で。伝わらなければ確認の質問)、`ja: string`(recast の日本語)、`follow_up: string`(学習者が言っていない情報を聞く、対象言語の短い質問。伝わらなかったときは空文字)、`follow_up_ja: string`。previousTurn(前の質問と答え)があれば 2 ターン目として判定。「wrong/mistake/incorrect」を使わない指示を入れる。スキーマ `topicCheckSchema`。
2. `buildQuickQuestionsPrompt({ lang, frames: { pattern, hint_ja }[], personalWords: { text, kind }[], count = 8 })`: 練習した型と自分の語を使って、1〜2 秒で答えられる短い質問を count 個。各 `{ q: string; ja: string }`。同じ型ばかりにならないよう混ぜる指示。スキーマ `quickQuestionsSchema`(配列、要素 q/ja 必須)。
3. `buildQuickJudgePrompt({ lang, items: { q, answer }[] })`: 各答えについて `understood: boolean` と `better: string`(より自然な一言、伝わっていれば空でも可)を返す。配列の順番を保つ指示。スキーマ `quickJudgeSchema`。
4. `buildTranslatePersonalWordPrompt({ ja, kind })`: `en` と `ko` を返す。固有名詞(人名・作品名)は一般的な表記(ローマ字/ハングル表記)にする指示。スキーマ `personalWordTranslationSchema`。
5. `src/services/gemini/speaking.ts`: `checkTopicTurn(params, { signal? })`、`generateQuickQuestions(params, { signal? })`、`judgeQuickAnswers(params, { signal? })`、`translatePersonalWord(params, { signal? })`。すべて `getGeminiClient().models.generateContent` を `responseMimeType: 'application/json'` + 各スキーマで呼び、JSON を解釈して型を検証(要素数や必須項目が欠けたら GeminiError kind 'parse')。エラーは toGeminiError で包む。generateQuickQuestions と judgeQuickAnswers は `httpOptions: { timeout: LONG_GENERATION_TIMEOUT_MS, retryOptions: { ...TRANSIENT_RETRY, attempts: 4, initialDelay: 2, maxDelay: 15 } }`。
6. テスト: 各プロンプトに必須の文言(お題、学習者の発話、禁止語の指示、count)が入ること。speaking.ts は generateContent をモックし、正常 JSON → 型どおり、要素数不足/必須欠け → parse エラー、を確認。

### 完了条件
`npx tsc --noEmit -p tsconfig.app.json` と `npx vitest run` が通る。変更ファイル一覧と迷った点を報告。

### 禁止事項
画面(tsx)と P7a のファイルを変更しない。npm install しない。エラーを握りつぶさない。

## P7c: 画面とフック

### 目的
/mixing を 3 タブ(型を回す / お題で言う / 即答)の「瞬間組み立て」に置き換える。設定に「自分の語」を追加。旧 MixingPage / useMixingSession / MixingPage.test.tsx は削除(ユーザー承認済み)。

### 対象ファイル
- 新規: src/features/mixing/InstantBuildPage.tsx(タブの外枠)、PatternPage.tsx + usePatternSession.ts、TopicPage.tsx + useTopicSession.ts、QuickPage.tsx + useQuickSession.ts、各 .test.tsx(フックをモックした表示テスト)
- 削除: src/features/mixing/MixingPage.tsx、useMixingSession.ts、MixingPage.test.tsx
- 変更: src/App.tsx(/mixing → InstantBuildPage)、src/features/practice/PracticePage.tsx(「瞬間組み立て」「日本語 → 一瞬で言う。型を回す・お題で言う・即答の 3 段階」)、src/features/home/HomePage.tsx(/mixing の導線の文言だけ)、src/features/settings/SettingsPage.tsx(「自分の語」節)

### 手順
1. usePatternSession: 読み込み時に core(withPersonalWords 済み)・mixing_progress を取得し FrameStats を集計 → buildPatternSession。1 項目: promptJa を speak(ja)し、終わったら自動で録音開始(createSpeechInput)。停止ボタンで stop → scorePronunciation(answer) → 一致なら次へ(応答時間 = 合図終了→録音開始の遅れ + onsetMs)。不一致なら buildHint → ヒント表示+読み上げ → もう一度録音(1 回だけ)→ それでも不一致なら模範を表示+読み上げ。各項目の結果(firstTry / hint / latencyMs)を mixing_progress に upsert(first_try_count / hint_count / latency_ms_total / latency_samples を加算)。2 周終了でまとめ(言えた数、平均応答時間、1 周目と 2 周目の比較)を表示し speaking_sessions(kind 'pattern')に保存。
2. useTopicSession: topics から level ≤ 設定レベルのものを rng で 1 つ選び fillTopic。お題を表示+読み上げ → 録音 → checkTopicTurn → 結果(聞こえた文 / 通じたか / recast 文字+音+日本語訳 / follow_up 文字+音)→ follow_up に答える録音 → checkTopicTurn(previousTurn 付き) → まとめ。speaking_sessions(kind 'topic')に保存。
3. useQuickSession: 質問 8 問(localStorage `lla.quick.{lang}.{YYYY-MM-DD}` にキャッシュ、無ければ generateQuickQuestions)。3 周: 質問を speak → 自動録音 → 停止で次へ。応答時間を記録。3 周後 judgeQuickAnswers を 1 回 → まとめ(周ごとの平均応答時間、通じた数、各答えと better)。speaking_sessions(kind 'quick')に保存。
4. 画面の共通ルール: 大きな録音停止ボタン、「やめる」、数字は応答時間と言えた数だけ。「間違い」「不正解」の語を使わない。Toast でエラー表示(既存 Toast)。
5. 設定の「自分の語」: 一覧(ja / en / ko / 種類)、削除、追加フォーム(日本語 + 種類)と「翻訳して追加」(translatePersonalWord → 編集可能な状態で追加)。保存は setSettings({ personalWords })。
6. テスト: 各ページはフックをモックして、主要状態(合図表示 / ヒント表示 / 模範表示 / まとめ)の文言を確認。

### 完了条件
tsc・vitest・`npm run build` が通る。変更・削除ファイル一覧と迷った点を報告。

### 禁止事項
services/gemini の実装を変えない(P7b の関数を使う)。npm install しない。エラーを握りつぶさない。
