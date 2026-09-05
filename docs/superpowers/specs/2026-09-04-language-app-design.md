# 言語学習アプリ 設計書(Lonsdale式・英語/韓国語)

作成日: 2026-09-04
状態: ユーザー承認済み

## 1. 目的と背景

Chris Lonsdale の TEDx 講演「どんな外国語でも半年でマスターする方法」の5原則・7行動を土台に、
ユーザー本人が **英語(簡単な会話は可、聞き取りと即答が弱い)** と **韓国語(挨拶・単語レベル)** を
半年で話せるようになるための自分専用アプリを作る。

既存アプリに無い「言語ペアレント」(訂正せず・意図を汲み・理解を返し・既知語で話す相手)を
LLM で実現するのが核。

## 2. 確定した前提

| 項目 | 決定 |
|---|---|
| 対象 | 自分専用(認証は1アカウント、課金なし) |
| 端末 | PC(Windows/Edge or Chrome) + iPhone(**Chrome**、Safariではない) |
| 費用 | 無料構成。Gemini Flash 無料枠 + ブラウザ音声API + 静的ホスティング |
| v1範囲 | ①言語ペアレント音声会話 ②週別カリキュラム ③ダイレクトコネクト単語カード |
| v2以降 | 脳漬けプレイヤー、顔真似(口元動画)、ミキシング練習(動詞10×名詞10×形容詞10) |
| 同期 | Supabase 無料枠(単語・進捗・会話履歴をPC↔スマホで共有) |
| 言語 | 英語・韓国語を同時。言語ごとに進捗を持つ |
| 目的タグ | 旅行・現地生活 / 友達・恋人・推し / コンテンツ視聴 |
| 構成 | サーバーなし静的PWA(Vite + React + TypeScript) |
| 語彙 | ハイブリッド(週1〜4は同梱、週5以降はGeminiが目的タグに合わせて生成) |

### 技術制約(調査済み)

- iPhone の Chrome は WebKit 縛りで `SpeechRecognition` 非対応。スマホの音声認識は
  「録音 → WAV変換 → Gemini に送って文字起こし」を主経路にする(無料枠内、1発話=1リクエスト)。
- Gemini 無料枠は Flash で 1日 1,500 リクエスト前後。20往復の音声会話(会話20+文字起こし20=40)を
  1日30回以上できるので個人用途では十分。
- Supabase MCP は設計時点で認証失敗(401)。スキーマ適用はユーザーがダッシュボードの SQL エディタで
  実行するか、MCP トークンを直してから行う。

### 作業分担

Claude が設計・タスク分割・レビュー、Codex が実装。
言語コンテンツ(週1〜4のフレーズ JSON)は文章作成なので Claude が直接書く。

## 3. 5原則・7行動 → 機能への写像

| 講演の要素 | アプリでの実装 |
|---|---|
| 関連性 | 目的タグ(旅行/推し/コンテンツ)で会話シナリオと週5以降の語彙を寄せる |
| 初日から道具として使う | ホーム画面の主役は「会話する」ボタン。学習画面は脇役 |
| 理解可能なインプット | AI返答は1〜2文、語彙を「既知語+今週の語」に制限 |
| 生理的トレーニング | 単語カードで必ず声に出す。TTSを聞いて真似る。ゆっくり再生 |
| 心理状態(安全・曖昧さ耐性) | 訂正しない。「間違い」という語を使わない。分からなくても進める段階ヒント |
| 行動1 大量に聞く | v2(脳漬けプレイヤー) |
| 行動2 意味を先に | 会話でヒントは「易しい言い換え」を先に、日本語は最後 |
| 行動3 混ぜる | v2(ミキシング練習) |
| 行動4 コアに集中 | 週1道具箱→週2赤ちゃん語→週3〜4接着語→週5〜26で1000語→3000語 |
| 行動5 言語ペアレント | Gemini に4ルールをシステムプロンプトで固定 |
| 行動6 顔を真似る | v2(v1では「もう一度言う」ボタンで筋肉練習のみ) |
| 行動7 ダイレクトコネクト | 単語カードは絵文字/画像+音のみ。日本語は非表示 |

## 4. アーキテクチャ

```
[ブラウザ(PWA)] ──直接──> Gemini API(会話・文字起こし・週次語彙生成)
      │
      ├──直接──> Supabase(Auth + Postgres, RLS)
      │
      └── Web Speech API: SpeechSynthesis(TTS, 全端末) / SpeechRecognition(STT, PCのみ)
```

- サーバー・API中継なし。Gemini キーはブラウザの `localStorage` に保存(リポジトリには入れない)。
- Supabase の URL と anon key は `.env` → `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`
  (anon key は公開前提、RLS で保護)。
- ホスティングは Cloudflare Pages か GitHub Pages(`dist/` を静的配信)。

### 技術スタック

- Vite + React 18 + TypeScript + Tailwind CSS + `vite-plugin-pwa`
- `@supabase/supabase-js` v2(Email/Password 認証、1ユーザー)
- `@google/genai`(ブラウザから直接呼ぶ)。モデル ID は設定画面で変更可。既定値は実装時に
  ListModels で無料枠の最新 Flash を確認して決める(推測で固定しない)
- テスト: Vitest

### ディレクトリ構成

```
src/
  app/            ルーティング、レイアウト、言語トグル
  features/
    talk/         言語ペアレント会話画面
    cards/        ダイレクトコネクト単語カード + SRS
    curriculum/   週別カリキュラム画面、週次生成
    home/         今日のタスク、進捗
    settings/     キー、音声、目的タグ、モデル名
  services/
    gemini/       クライアント、プロンプトビルダー、JSONスキーマ
    speech/       tts.ts / stt.ts(WebSpeech と Gemini音声のフォールバック) / wav.ts
    supabase/     クライアント、型付きデータアクセス
  content/
    en/week1.json … week4.json
    ko/week1.json … week4.json
supabase/migrations/001_init.sql
```

## 5. データモデル(Supabase)

全テーブルに `user_id uuid references auth.users` と RLS(`user_id = auth.uid()`)。

| テーブル | 主な列 |
|---|---|
| `profiles` | user_id(PK), interests text[](travel/friends/content), created_at |
| `language_progress` | user_id, lang('en'/'ko'), current_week int, started_at, streak int, last_active_date date。PK(user_id, lang) |
| `vocab_items` | id, user_id, lang, week int, text(対象言語), emoji text, hint_ja text, category('toolbox'/'baby'/'glue'/'core'), source('bundled'/'generated'), created_at |
| `vocab_progress` | user_id, vocab_item_id, status('new'/'learning'/'known'), correct_count int, hint_used_count int, last_reviewed_at, next_review_at。PK(user_id, vocab_item_id) |
| `conversations` | id, user_id, lang, scenario text, started_at, ended_at, turn_count int |
| `messages` | id, conversation_id, role('user'/'assistant'), text, simpler text, ja text, created_at |

同梱の週1〜4語彙は初回ログイン時に `vocab_items` に `source='bundled'` で投入(冪等)。

## 6. 画面(モバイルファースト)

1. **ホーム**: 言語トグル(EN/KO)、「第N週・Day M」、ストリーク、既知語数/1000のバー、
   今日のタスク2つ(単語カード10枚 → 会話1セッション)。会話ボタンが最大。
2. **会話(Talk)**: シナリオ選択(目的タグから生成)→ 押して話す → 吹き出し表示 → AI返答を自動TTS。
   ヒントボタンは3段階(①ゆっくり再生 ②易しい言い換え ③日本語)。終了時に「今日出てきた新語」を
   一覧表示し、タップで単語帳に追加。
3. **単語カード(Cards)**: 絵文字(大)+ 例文をTTSで再生。文字は非表示。マイクで発話 → 文字起こし →
   正規化して比較 → 正解表示 + TTS再生 + 「もう一度言う」。○/△/× の自己評価も可(音声認識が
   外れた時の救済)。日本語は長押しでのみ表示し `hint_used_count` に記録。
4. **カリキュラム**: 週一覧、今週のセット、「来週分を生成」(週5以降、Gemini)。
5. **設定**: Gemini APIキー、モデルID、Supabaseログイン、TTS音声選択・速度、STTエンジン(自動/WebSpeech/Gemini)、目的タグ。

## 7. 言語ペアレントのプロンプト設計(核)

システムプロンプト(言語別)に固定するルール:

1. 対象言語のみで返す。1〜2文。学習者より少し上のレベル。
2. 間違いを指摘しない。代わりに「理解した内容」を自然な正しい形で言い返す
   (例: 学習者が "me go station want" → "Ah, you want to go to the station? Which station?")。
3. 崩れていても意図を汲む。本当に不明なら Yes/No で聞ける簡単な質問を返す。
4. 語彙は `[既知語リスト] + [今週の語]` に制限。それ以外は超高頻度語のみ。リストはプロンプトに毎回渡す。
5. 毎ターン必ず短い質問で返し、学習者に話させ続ける。
6. 温かく、急かさない。「wrong」「mistake」等の語を使わない。

出力は Gemini の JSON モード(`responseMimeType: application/json` + スキーマ)で固定:

```json
{ "reply": "対象言語の返答", "simpler": "同じ言語での易しい言い換え",
  "ja": "日本語の意味(ヒント3段階目でのみ表示)", "new_words": ["既知リスト外の語"] }
```

シナリオはセッション開始時に選び、対象言語で状況説明をプロンプトに含める
(例: 旅行→「カフェで注文」、推し→「ライブの感想を友達に話す」)。

## 8. 音声(STT/TTS)の設計

**TTS:** `speechSynthesis`。言語ごとに音声を選択(en-US / ko-KR)。速度スライダー(0.7〜1.0)で
「ゆっくり再生」ヒントを実現。iOS はユーザー操作なしに再生できないため、初回タップで unlock する。

**STT:** インターフェース `SpeechInput { start(); stop(): Promise<string> }` で2実装を切替:

- `WebSpeechInput`: `SpeechRecognition` があり、かつ iOS でない場合(PCのChrome/Edge)。
- `GeminiAudioInput`: `MediaRecorder` で録音 → `AudioContext` でデコード → 16kHz mono WAV に
  エンコード → base64 で Gemini に「この{言語}の音声を正確に文字起こしせよ」→ テキスト。
  1発話は最大20秒。**iPhone Chrome ではこちらが主経路。**
- 設定で強制切替可。画面にどのエンジンが動いているか表示する。

## 9. カリキュラム内容

**同梱(週1〜4、Claudeが直接JSONを書く):**

- 週1 道具箱(約12フレーズ): 「〜は何と言う?」「分かりません」「もう一度」「ゆっくり」「〜はどういう意味?」「はい/いいえ」「ありがとう」「待って」「これで合ってる?」など
- 週2 赤ちゃん語(約40語): 代名詞(私/あなた/これ/あれ)、名詞(水/食べ物/駅/トイレ/電話/お金/切符/部屋)、動詞(欲しい/行く/食べる/ある/あげる/好き/買う/見る)、形容詞(熱い/冷たい/良い/大きい/小さい/美味しい/高い)、数字1〜10
- 週3〜4 接着語(約30語): and/but/because/so/then/if/also/maybe/always/sometimes/before/after/with/more/very/not/still の対応語

JSON形式: `{ "text": "...", "emoji": "🚉", "category": "baby", "hint_ja": "駅", "example": "対象言語の短い例文" }`

**生成(週5以降、Gemini):** 目的タグ・既知語・週番号を渡し、「具体的で高頻度、{シナリオ}で使う語を40語、
絵文字候補付き」を JSON で受け取り `source='generated'` で保存。

## 10. 単語カードの判定と SRS

- 比較: 小文字化・句読点除去・空白正規化。韓国語は NFC 正規化。Levenshtein 類似度 ≥ 0.8 で正解。
- SRS: Leitner 式で間隔 1→3→7→14→30 日。×で1に戻す。`next_review_at` で今日の10枚を選ぶ。

## 11. エラー処理(握りつぶし禁止)

- Gemini: 429 は「無料枠の上限。少し待って再試行」をトースト表示。その他はメッセージと共に表示し console.error。
- STT: WebSpeech が失敗したら Gemini 音声に自動フォールバックし、切替を画面に表示。
- Supabase: 通信失敗はバナー表示。v1 ではオフラインキューは持たない。
- 音声再生不可(iOS unlock 前など): 「タップして音声を有効化」を表示。

## 12. 実装タスク分割(Codex に1タスク=1回で投げる)

各タスクは「目的 / 対象ファイル / 手順 / 完了条件 / 禁止事項」の形式で指示文を作り、
ユーザー承認後に Codex へ送る。完了ごとに Claude が diff を確認する。

0. **準備**: `git init`、本設計書の保存、Supabase プロジェクトの URL/anon key を `.env` に用意(ユーザー)。
1. **足場**: Vite+React+TS+Tailwind+PWA、ルーティング、レイアウト、言語トグル、設定画面(キーは localStorage)。
2. **Supabase**: `001_init.sql`(テーブル+RLS)、認証画面、型付きデータアクセス層、同梱語彙の冪等投入。
3. **音声層**: `tts.ts` / `stt.ts`(2実装+自動選択) / `wav.ts`。Vitest で WAV ヘッダと正規化のテスト。
4. **Gemini層**: クライアント、言語ペアレントのプロンプトビルダー、JSONスキーマ、文字起こし、週次語彙生成。
5. **同梱コンテンツ(Claude)**: `content/{en,ko}/week1〜4.json` を執筆。
6. **会話画面**: セッション開始→発話→返答→TTS→ヒント3段階→終了サマリ→単語帳追加。
7. **単語カード画面**: カード提示→発話判定→SRS更新。判定と SRS のテスト。
8. **ホーム・カリキュラム画面**: 進捗、今日のタスク、週一覧、来週分生成。
9. **仕上げ**: PWA アイコン/manifest、デプロイ設定、README(キー発行〜ログインまでの手順)。

## 13. 検証方法

- `npm test`(Vitest): 正規化・類似度、SRS 間隔、WAV エンコーダ、プロンプトビルダー、コンテンツ JSON のスキーマ検証。
- `npm run build` が通り、`npm run preview` で PC の Edge/Chrome から WebSpeech による会話が一往復できる。
- iPhone Chrome で「録音→Gemini文字起こし」が動き、TTS が再生される(実機テスト、ユーザー実施)。
- Supabase: PC で覚えた単語がスマホのホームに反映される。
- 設定画面で無効なキーを入れた時、エラーがトーストに表示される(握りつぶしていないことの確認)。

## 14. v1 追加機能(2026-09-04 ブレスト追記)

ユーザーの弱点(英語: 聞き取りと即答、韓国語: ほぼゼロ)に直接効く3機能と、ペアレントの人格設定を v1 に含める。

### 14.1 リキャスト振り返り(→ Task 6 会話画面)
- 会話終了サマリに「あなたの発話 / ペアレントの返し」を1ターンずつ左右に並べて表示する。
- 赤字や「誤り」表示はしない。見比べて気づくための一覧に留める。
- データは `messages` テーブルの user/assistant ペアをそのまま使う。追加の API 呼び出しは不要。

### 14.2 弱点語の会話内引き出し(→ Task 4 Gemini層)
- セッション開始時に `vocab_progress` から `hint_used_count > 0` または `status='learning'` の語を最大10語取り、
  システムプロンプトに「会話の流れで自然にこれらの語を学習者に言わせる機会を作れ。ただし直接テストしない」と渡す。
- 会話中にその語を学習者が使えたら `vocab_progress.correct_count` を加算する(判定は `new_words` と同様に正規化一致で行う)。

### 14.3 シャドーイング(→ Task 6 会話画面、Task 3 音声層を再利用)
- AI返答の吹き出しに「真似る」ボタンを付ける。押すと TTS 再生 → 自動で録音開始 → 学習者が繰り返す → STT →
  返答テキストとの類似度(単語カードと同じ正規化 + Levenshtein)を 0〜100% で表示する。
- 数値は励ましとして出す。しきい値で合否は付けない。
- 1発話ごとの類似度は `messages` に `shadow_score int` 列を追加して保存する(Task 2 のマイグレーションに含める)。

### 14.4 ペアレントの人格(→ Task 4 Gemini層)
- 言語ごとに固定の人物設定を持つ(例: 英語は「ロンドン在住の友人」、韓国語は「ソウル在住の友人」)。
- 名前・住んでいる街・好きなもの2つ程度をシステムプロンプトに書き、毎回同じ人物として振る舞わせる。
- 設定画面で名前を変更できるようにする(`settings.parentName: { en: string, ko: string }`)。

### 14.5 準備モード(→ Task 2 マイグレーション、Task 4 Gemini層、Task 8 画面)
「48時間で中国語入力を覚えた同僚」の話をそのまま仕組みにする。直近の実際の予定に語彙を結びつける。

- **入口**: ホームに「予定の準備」ボタン。テキスト(例:「来週ソウル旅行」「明日〇〇と初対面」)と日付(任意)を入力。
- **生成**: Gemini に「この状況で必要になるフレーズを10個、既知語をなるべく使って対象言語で。絵文字候補と短い例文付き」を JSON で要求。
- **保存**: 新テーブル `prep_events`(id, user_id, lang, title, event_date date null, created_at)。
  生成したフレーズは `vocab_items` に `category='prep'`、`prep_event_id`(nullable, FK)を付けて保存。
- **練習**: 単語カード画面に「この予定の10個を今すぐ全部」モードを追加(SRS の今日分とは別枠、判定ロジックは共通)。
- **シミュレーション**: 会話画面のシナリオ一覧に準備済みの予定が並ぶ。選ぶとシステムプロンプトにその状況説明と10フレーズを
  「引き出し対象」として渡す(14.2 と同じ仕組み)。
- **ホーム表示**: 「〇〇まで残りN日」と「10個中M個言えた」を表示。予定日を過ぎたら一覧から消す(データは残す)。

### 見送り(v2 候補)
即答タイマー、音の識別ドリル(r/l・평음/격음/경음)、今日の会話の音声プレイリスト、セッション前の気分チェック。

## 15. v2(2026-09-05 追記、ユーザー承認済み)

v1 を実際に使って出た指摘への対応。順番は P0 → P5。詳細な根拠と調査結果は
`~/.claude/plans/encapsulated-jingling-newt.md`(承認時点の計画)にある。

### P0. 音声認識の信頼性(最優先)
言っていない長文が文字起こしに出る問題。原因は LLM 型文字起こしの捏造(無音・短い発話で起きる)で、
温度 1.0・出力上限なし・無音の逃げ道なしが増幅していた。多層防御で塞ぐ:
1. `temperature: 0`、`maxOutputTokens: 96`
2. プロンプトに「はっきりした発話が無ければ `[NO_SPEECH]` のみ出力」。番兵を検出したら
   「声が聞こえませんでした」のエラー
3. 端末側で先頭・末尾の無音を落とし(`trimSilence`)、最大窓 RMS(`peakRms`)が 0.02 未満、または
   0.3 秒未満なら送信しない
4. 録音開始時に読み上げを止める(`stopSpeaking`)。中断による `speak` の reject はエラー扱いしない
5. 聞き取りが対象語の 3 倍より長く、対象語を含まない場合は `unreliable` として点数を出さない

### P1. カードの意味は初回だけ見せる
初見(progress なし)のカードは日本語と例文を提示段階で表示。2 回目以降は隠す。ヒントは 1 タップ。

### P2. 週の進行は習得で決める
`current_week` を保存値として信頼し、カレンダーで自動進級しない。今週の語の 80% が `correct_count >= 1` に
なったら「次の週へ」ボタンを出す。手動進級は常に可(確認付き)。`language_progress.week_started_at` を追加。
ストリークと Day はカレンダーのまま。

### P3. ミキシング(組み合わせ練習)
根拠: DeKeyser のスキル習得理論(意図的・体系的・本番と同じ様式・フィードバック・ほどよい難しさ)、
Nation の流暢さ発達(知っている材料で速く)、Michel Thomas(部品から新しい文を組む)。
- `src/content/{en,ko}/core.json`: 動詞 10・名詞 10・形容詞 10・(英語)句動詞 10・型(frames)。
  韓国語の型は助詞込み。을/를・이/가 は `attachParticle` で自動選択
- 画面 `/mixing`: 型 + 語を配る(レベル 1〜3 で語数が増える)→ 声で文を作る → ペアレントが
  理解した内容を言い返し `understood` を返す(文法の正誤は出さない)→ 同じ文をもう一度速く言う
- `mixing_progress` で動詞×名詞の未経験の組み合わせを優先
- 「この N 語で M 通り」を表示

### P4. ディクテーション
`src/content/{en,ko}/dictation.json`(各 60 文、既知語のみ、英語は連結・弱形、韓国語は 받침 連音、
`focus` 付き)。自然な速さで再生 → 入力 → 語単位 LCS 差分を薄い色で示す(「不正解」と言わない)→
ゆっくり → 文字付き → もう一度。`dictation_progress` で一致率 90% 未満を優先。1 日 5 文を今日のタスクに。

### P5. 音声レッスン(Pimsleur 式)
4 原則を実装: 予期(問い → 間 → 自分で言う → 模範)、段階的間隔想起(レッスン内で 5 秒 → 25 秒 → 2 分 → 10 分、
翌日以降は Leitner に引き継ぐ)、核となる語彙(今日のカード + core)、文脈(問いは翻訳ではなく
「店員に水を頼む」のような状況を日本語で示す)。3 音節以上は末尾から組み立てて読み上げる。
画面は一時停止とスキップのみ。iPhone は画面オンが前提。

### 共通
下タブは 5 つのまま。「カード」を「練習」にして 4 つの入口を並べる。`002_v2.sql` に
`week_started_at`、`mixing_progress`、`dictation_progress`(RLS 付き)。
