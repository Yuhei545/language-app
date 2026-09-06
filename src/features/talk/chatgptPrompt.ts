import type { Interest, PersonalWord } from '../../services/settings'

export type ChatGptPromptInput = {
  lang: 'en' | 'ko'
  /** 今週の語(対象言語)。 */
  weekWords: string[]
  /** 知っている語(対象言語)。多いときは呼び出し側で 150 語ほどに絞る。 */
  knownWords: string[]
  /** 会話の中で自然に使わせたい語(ヒントを使った語や学習中の語)。 */
  targetWords: string[]
  personalWords: PersonalWord[]
  interests: Interest[]
  personaName: string
  /** 今日の場面(任意)。 */
  sceneJa?: string
}

const LANGUAGE_JA: Record<'en' | 'ko', string> = { en: '英語', ko: '韓国語' }
const LANGUAGE_EN: Record<'en' | 'ko', string> = { en: 'English', ko: 'Korean' }
const LEVEL_JA: Record<'en' | 'ko', string> = {
  en: '簡単な会話はできるが、聞き取りと「すぐに言葉が出ること」が課題(CEFR B1 の実用会話)',
  ko: '挨拶と単語レベルの初級(丁寧な -요 体で)',
}
const INTEREST_JA: Record<Interest, string> = {
  travel: '旅行・現地での生活',
  friends: '友人・恋人・推しとの会話',
  content: '動画やネットのコンテンツの話',
}
const KIND_JA: Record<PersonalWord['kind'], string> = {
  place: '場所',
  person: '人',
  thing: 'もの',
  media: '作品',
}

function list(values: string[], fallback = '(なし)'): string {
  const unique = [...new Set(values.map((value) => value.trim()).filter((value) => value.length > 0))]
  return unique.length > 0 ? unique.join(', ') : fallback
}

/**
 * ChatGPT に貼り付けて「言語の親」として会話してもらうためのプロンプト。
 * 動画(Lonsdale)の原則: 訂正しない・言い直しで返す・知っている語の中で話す・相手が話し続けられるよう質問で終える。
 * アプリ側の語彙と自分の語を差し込み、音読しながら打ち込む使い方を前提にする。
 */
export function buildChatGptPrompt(input: ChatGptPromptInput): string {
  const language = LANGUAGE_JA[input.lang]
  const languageEn = LANGUAGE_EN[input.lang]
  const persona = input.personaName.trim() || (input.lang === 'en' ? 'Sam' : '지민')
  const personal = input.personalWords
    .filter((word) => word[input.lang].trim().length > 0)
    .map((word) => `${word[input.lang]}(${KIND_JA[word.kind]}: ${word.ja})`)
  const interests = input.interests.map((interest) => INTEREST_JA[interest])
  const scene = input.sceneJa?.trim()

  return [
    `あなたは私の「${language}の親」です。名前は ${persona}。私は日本語話者で、${language}を話せるようになりたい学習者です。`,
    `私のレベル: ${LEVEL_JA[input.lang]}。`,
    '',
    '## 会話のルール(必ず守る)',
    `1. 返事は${language}だけで、1〜2 文の短さ。私が話し続けられるように、毎回、短い質問で終える。`,
    '2. 私の間違いを直さない。「wrong」「間違い」のような言葉も使わない。意味が分かったら、自然で正しい言い方で言い直してから続ける(言い直しは 1 文だけ)。',
    '3. 文法が崩れていても意味をくみ取る。本当に分からないときだけ、はい/いいえで答えられる簡単な質問をする。',
    `4. 使う語は、下の「知っている語」と ${languageEn} の最頻出 100 語の範囲に収める。難しい語を使うときは 1 語だけにして、次の文で言い換える。`,
    '5. 私は返事を声に出して音読してから打ち込む。ゆっくりで構わないので、急かさない。',
    '6. 私が「?」だけを送ったら、直前のあなたの発言を日本語で短く説明してから、同じ質問を繰り返す。',
    `7. 私が「🇯🇵」のあとに日本語を送ったら、それを${language}でどう言うかを 1 つ教え、私に音読させてから会話に戻る。`,
    '8. 10 往復ごとに、私が使えた表現 2 つと、次に使えそうな表現 1 つを日本語の説明つきで短くまとめる(まとめは日本語でよい)。',
    '',
    '## 私の語彙',
    `- 今週の語: ${list(input.weekWords)}`,
    `- 知っている語: ${list(input.knownWords)}`,
    `- 会話の中で自然に使う場面を作ってほしい語(直接は問わない): ${list(input.targetWords)}`,
    '',
    '## 私のこと',
    `- 興味: ${list(interests, '日常の場面')}`,
    `- よく話す固有名詞: ${list(personal)}`,
    '',
    '## 今日の場面',
    scene ? `- ${scene}` : '- あなたが私の興味に合う場面を 1 つ選び、その場面の登場人物として話しかけてください。',
    '',
    `では、まず ${language}で短く挨拶し、場面に沿った最初の質問をしてください。`,
  ].join('\n')
}
