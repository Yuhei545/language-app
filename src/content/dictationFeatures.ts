/**
 * ディクテーションで狙う「音の現象」の分類。
 * 文ごとに「どの語にどの現象があるか」を付け、現象ごとの正答率で苦手を追う(Field の micro-listening)。
 */
export type DictationFeatureId =
  | 'linking'
  | 'weak-form'
  | 'elision'
  | 'assimilation'
  | 'flap'
  | 'contraction'
  | 'reduction'
  | 'liaison'
  | 'nasalization'
  | 'liquidization'
  | 'tensification'
  | 'aspiration'
  | 'h-weakening'
  | 'palatalization'

export type DictationFeature = {
  id: DictationFeatureId
  lang: 'en' | 'ko'
  name_ja: string
  /** 1〜2 文の説明。答え合わせのあとに見せる。 */
  note_ja: string
  /** 典型例。 */
  example: string
}

export const DICTATION_FEATURES: DictationFeature[] = [
  {
    id: 'linking',
    lang: 'en',
    name_ja: '連結',
    note_ja: '子音で終わる語と母音で始まる語がつながって 1 語のように聞こえます。',
    example: 'have a → 「ハヴァ」',
  },
  {
    id: 'weak-form',
    lang: 'en',
    name_ja: '弱形',
    note_ja: 'to / can / the / and / of / for のような機能語は、文の中では弱く短く発音されます。',
    example: 'to → 「タ」、can → 「クン」',
  },
  {
    id: 'elision',
    lang: 'en',
    name_ja: '脱落',
    note_ja: '語末の t / d や h が落ちて聞こえなくなります。',
    example: 'next day → 「ネクスデイ」、tell him → 「テリム」',
  },
  {
    id: 'assimilation',
    lang: 'en',
    name_ja: '同化',
    note_ja: '隣り合う音が混ざって別の音になります。d + y は「ヂ」、t + y は「チ」。',
    example: 'did you → 「ディヂュ」、meet you → 「ミーチュ」',
  },
  {
    id: 'flap',
    lang: 'en',
    name_ja: 'フラップの t',
    note_ja: '母音にはさまれた t は、アメリカ英語では「ラ行」に近い軽い音になります。',
    example: 'water → 「ワラー」、get it → 「ゲリッ」',
  },
  {
    id: 'contraction',
    lang: 'en',
    name_ja: '短縮形',
    note_ja: "I'm / it's / don't / I've のように 2 語が 1 語に縮まります。",
    example: "I have → I've、do not → don't",
  },
  {
    id: 'reduction',
    lang: 'en',
    name_ja: '縮約',
    note_ja: '決まった組み合わせが会話では別の形に聞こえます。',
    example: 'want to → wanna、going to → gonna、do you → dya',
  },
  {
    id: 'liaison',
    lang: 'ko',
    name_ja: '連音化',
    note_ja: 'パッチムの後に ㅇ で始まる音節が来ると、パッチムが次の音節の頭に移ります。',
    example: '밥을 → [바블]、물이 → [무리]',
  },
  {
    id: 'nasalization',
    lang: 'ko',
    name_ja: '鼻音化',
    note_ja: 'ㄱ・ㄷ・ㅂ の音のパッチムの後に ㄴ・ㅁ が来ると、パッチムが ㅇ・ㄴ・ㅁ に変わります。',
    example: '한국말 → [한궁말]、입니다 → [임니다]',
  },
  {
    id: 'liquidization',
    lang: 'ko',
    name_ja: '流音化',
    note_ja: 'ㄴ と ㄹ が隣り合うと、ㄴ が ㄹ に変わります。',
    example: '연락 → [열락]、설날 → [설랄]',
  },
  {
    id: 'tensification',
    lang: 'ko',
    name_ja: '濃音化',
    note_ja: 'ㄱ・ㄷ・ㅂ の音のパッチムの後の ㄱ・ㄷ・ㅂ・ㅅ・ㅈ は、詰まった濃音になります。',
    example: '없어요 → [업써요]、학교 → [학꾜]',
  },
  {
    id: 'aspiration',
    lang: 'ko',
    name_ja: '激音化',
    note_ja: 'ㅎ の前後の ㄱ・ㄷ・ㅂ・ㅈ は、息の強い激音になります。',
    example: '좋다 → [조타]、입학 → [이팍]',
  },
  {
    id: 'h-weakening',
    lang: 'ko',
    name_ja: 'ㅎ の弱化',
    note_ja: 'パッチム ㅎ の後に母音が来ると ㅎ は発音されず、母音の間の ㅎ も弱くなります。',
    example: '좋아요 → [조아요]、전화 → [저놔]',
  },
  {
    id: 'palatalization',
    lang: 'ko',
    name_ja: '口蓋音化',
    note_ja: 'パッチム ㄷ・ㅌ の後に 이 が来ると、ㅈ・ㅊ の音になります。',
    example: '같이 → [가치]、굳이 → [구지]',
  },
]

export function featureById(id: DictationFeatureId): DictationFeature {
  const feature = DICTATION_FEATURES.find((candidate) => candidate.id === id)
  if (!feature) {
    throw new Error(`音の現象 ${id} は定義されていません`)
  }
  return feature
}

export function featuresFor(lang: 'en' | 'ko'): DictationFeature[] {
  return DICTATION_FEATURES.filter((feature) => feature.lang === lang)
}
