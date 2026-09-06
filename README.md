# 言語学習（LLA）

## 1. このアプリは何か

Chris Lonsdale の TEDx 講演で紹介された「外国語を6か月で学ぶための5原則・7つの行動」を土台にした、英語と韓国語の個人用自習アプリです。

主な機能は次のとおりです。

- 言語ペアレントと音声で会話する
- 26週間のカリキュラムを週ごとに進める
- 絵・音・意味を直接つなぐ「ダイレクトコネクト」単語カードで復習する
- 実際の予定に必要な10個の言い方を準備する

学習者の発話をその場で訂正せず、意図を受け取った自然な返しを聞きながら、安心して話す量を増やす設計です。

## 2. 必要なもの

- Node.js（20以上を推奨）と npm
- Supabase の無料アカウント
- Google AI Studio で発行した Gemini APIキー（無料枠を利用可能）
- 音声入力と読み上げに対応したブラウザ

## 3. セットアップ

### 1. 依存パッケージを入れる

プロジェクトのルートで実行します。

```bash
npm install
```

### 2. Supabase プロジェクトを作る

1. Supabase にログインして、新しいプロジェクトを作成します。
2. プロジェクトの `Settings` → `API` を開きます。
3. Project URL と anon key を控えます。service role key は使用しません。

### 3. 環境変数を設定する

macOS / Linux の場合:

```bash
cp .env.example .env
```

Windows PowerShell の場合:

```powershell
Copy-Item .env.example .env
```

作成した `.env` に、Supabase で取得した値を設定します。

```dotenv
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

`.env` は公開リポジトリへコミットしないでください。

### 4. データベースを作る

1. Supabase ダッシュボードで `SQL Editor` を開きます。
2. [`supabase/migrations/`](supabase/migrations/) の SQL を番号順(001 → 006)に、1 つずつ貼り付けて上から最後まで実行します。
3. 006(`006_chunks.sql`)は表現の台帳と今日の狙いを作ります。未適用だとアプリに実行の案内が出ます(練習は続けられます)。

テーブル、インデックス、ビュー、Row Level Security（RLS）とユーザーごとのアクセスポリシーが作成されます。

### 5. ログインユーザーを作る

1. Supabase の `Authentication` → `Users` を開きます。
2. `Add user` から自分のメールアドレスとパスワードを登録します。
3. 必要に応じてメール確認済みとして作成します。

このアプリにはサインアップ画面がありません。ユーザー追加はSupabase側で行います。

### 6. アプリを起動してログインする

```bash
npm run dev
```

ターミナルに表示されたURL（通常は `http://localhost:5173`）を開き、手順5で作ったユーザーでログインします。

### 7. Gemini と学習目的を設定する

1. アプリの「設定」を開きます。
2. Google AI Studio で発行した Gemini APIキーを入力します。
3. 「モデル一覧を取得」を押し、Flash系モデルを選びます。モデルIDはコードやビルド成果物へ固定されません。
4. 学習目的から「旅行」「友人との会話」「動画・コンテンツ」を必要に応じて選びます。

Gemini APIキーは各端末のブラウザ内に保存されます。共有端末では使用しないでください。

## 4. 使い方

ホームに毎日「今日の狙い」(型・句動詞・汎用フレーズを英語 8 個、韓国語 4 個)が出ます。どのモードにも同じ狙いが違う形で出てきて、
出会い 8 回・自分で言えた 3 回・2 つ以上の場面で「身についた」と数えます。1日の目安は次の順番です(約 30 分)。

1. 型を回す(6 分): 狙いの型と句動詞から
2. 単語カード(5 分): 狙いのカードを先に
3. 聞いて書く(5 分): 狙いを含む文を先に
4. 聞き流し(4 分): 保存した会話 3 本を文字なしで
5. ChatGPT で会話(10 分): プロンプトをコピーして貼り、終わったら「まとめ」と送って使えた表現を記録する

会話レッスン(Gemini で生成)は週 2〜3 回。生成にも今日の狙いが入ります。

会話中に分かりにくいときは、次の順番でヒントを使います。

1. ゆっくり読み上げる
2. やさしい言い方へ言い換える
3. 日本語を表示する

日本語は最後の手段にし、できるだけ対象言語の音と意味を直接つなげます。予定があるときは「予定を準備する」からタイトルと日付を登録すると、その場で使う10個の言い方を生成して専用カードで練習できます。

## 5. 端末について

### iPhone

iPhone版Chromeを含むiOSブラウザでは、Web Speech APIの音声認識を利用できません。アプリはマイク音声を録音してWAVへ変換し、Geminiへ送って文字起こしします。そのため、会話とカードの音声入力にはインターネット接続が必要です。

ホーム画面へ追加するには、HTTPSで公開したアプリをiPhoneで開き、共有メニューから「ホーム画面に追加」を選びます。Chromeで項目が表示されない場合はSafariで同じURLを開いて追加してください。

### PC

PC版Chrome / Edgeでは、利用可能ならブラウザ内蔵のWeb Speech APIを使います。「設定」→「音声入力」で自動選択、Web Speech、Geminiを切り替えられます。

### オフライン時

PWAのキャッシュにより画面を開ける場合がありますが、Supabaseへの保存、Gemini会話、文字起こし、語彙生成には接続が必要です。v1にはオフライン書き込みキューがないため、オフライン中に失敗した操作は接続が戻ってから再実行してください。

## 6. 費用

個人利用では、Geminiの無料枠とSupabaseの無料枠に収まる想定です。

- Gemini Flash系モデルの無料枠は、目安として1日約1,500リクエストです。実際の上限はモデル、地域、Google側の変更によって異なります。
- 会話の1往復（録音から返答まで）で、文字起こし1回と返答生成1回の計2リクエストを使います。
- 予定用フレーズや週次語彙の生成にも、それぞれGeminiリクエストを使います。
- Supabaseには認証情報、学習進捗、語彙、会話履歴を保存します。

利用前にGoogle AI StudioとSupabaseのダッシュボードで、現在の無料枠と利用量を確認してください。

## 7. デプロイ

本番用ファイルを作成します。

```bash
npm run build
```

生成された `dist/` を静的サイトとして公開します。マイクとPWAをiPhoneで使うにはHTTPSが必要です。

### Cloudflare Pages

1. Cloudflare PagesでGitリポジトリを接続するか、Direct Uploadを選びます。
2. Git連携の場合はBuild commandを `npm run build`、Build output directoryを `dist` にします。
3. Pagesの環境変数へ `VITE_SUPABASE_URL` と `VITE_SUPABASE_ANON_KEY` を登録します。
4. Direct Uploadの場合は、環境変数を設定したローカル環境でビルドした `dist/` をアップロードします。

### GitHub Pages(現在の公開先)

公開 URL: https://yuhei545.github.io/language-app/

`main` へ push すると `.github/workflows/deploy.yml` がテスト → ビルド → GitHub Pages への配置を行います。
ビルド時の `VITE_SUPABASE_URL` と `VITE_SUPABASE_ANON_KEY` はリポジトリの Secrets から渡します(`gh secret set --env-file .env`)。

サブパス公開のため、`vite.config.ts` の `base` と manifest の `start_url` / `scope` は `/language-app/` に、
アイコンのパスは相対にしてあります。ルーターは `HashRouter` です(Pages は深いパスの直接アクセスで 404 になるため)。
リポジトリ名を変えるときは、この 3 か所を合わせて変更してください。

スマホで使うときは、公開 URL を Chrome で開き「ホーム画面に追加」します。Gemini の API キーは端末ごとに設定画面で入力します。

### 環境変数とAPIキー

- `VITE_SUPABASE_URL` と `VITE_SUPABASE_ANON_KEY` はビルド時に設定します。
- Gemini APIキーはデプロイ環境の環境変数へ入れません。
- Gemini APIキーは設定画面で各端末ごとに入力し、そのブラウザ内へ保存します。

### PWAアイコン

リポジトリには実際のPNGとして次のアイコンを同梱しています。

- `public/icon-192.png`（192×192、Web App Manifest用）
- `public/icon-512.png`（512×512、Web App Manifest用）
- `public/apple-touch-icon.png`（180×180、iOSホーム画面用）

SVGだけの代替構成ではなく、iOS用を含むPNGが用意済みです。デザインを変更したい場合は、同じ寸法とファイル名のPNGへ差し替えてください。

## 8. 既知の制約

v1には次の機能がありません。

- 顔真似に使う口元動画
- 複数の既知語を組み合わせるミキシング練習
- 即答タイマー
- 音の違いを聞き分ける識別ドリル
- オフライン書き込みキュー

また、Gemini APIキーはブラウザのlocalStorageに保存されるため、端末を利用できる人から完全に秘匿する仕組みではありません。個人所有の端末で使うことを想定しています。

## 9. 開発

```bash
npm run dev
```

Viteの開発サーバーを起動します。コード変更は自動で画面へ反映されます。

```bash
npm run build
```

TypeScriptの型検査を行い、本番用ファイルを `dist/` に生成します。

```bash
npm test
```

Vitestのテストを1回実行します。

ビルド済みの `dist/` をローカルで確認する場合は、`npm run preview` を使います。
