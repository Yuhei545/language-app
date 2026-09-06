import { describe, expect, it } from 'vitest'
import type { Chunk } from '../chunks/registry'
import { targetCoverage, validateDialogue, type LessonDialogue } from './lessonDialogueSchema'

const enDialogue: LessonDialogue = {
  title_ja: 'カフェで注文する',
  scene_ja: 'カフェで店員と話す',
  turns: [
    { speaker: 'A', text: 'Hi, what can I get for you?', ja: 'ご注文は?' },
    { speaker: 'B', text: 'Could I get a coffee, please?', ja: 'コーヒーをお願いします' },
    { speaker: 'A', text: 'Sure. Anything else?', ja: 'はい。他には?' },
    { speaker: 'B', text: 'What do you recommend?', ja: 'おすすめは?' },
    { speaker: 'A', text: 'The lemon cake is really popular.', ja: 'レモンケーキが人気です' },
    { speaker: 'B', text: 'Sounds good. Can I get this to go?', ja: 'いいですね。持ち帰りにできますか' },
  ],
  new_expressions: [
    { text: 'what can I get for you', ja: 'ご注文は', note_ja: '店員の定番の聞き方', turn_index: 0 },
    { text: 'anything else', ja: '他には', note_ja: '追加注文の確認', turn_index: 2 },
    { text: 'really popular', ja: 'とても人気', note_ja: 'おすすめを伝える言い方', turn_index: 4 },
    { text: 'sounds good', ja: 'いいですね', note_ja: '提案に乗るときの一言', turn_index: 5 },
  ],
}

/** 会話の全語を既知語にする(比率 1.0 を保証)。 */
function allWords(dialogue: LessonDialogue): string[] {
  return dialogue.turns.flatMap((turn) => turn.text.toLowerCase().replace(/[^\p{L}\p{N}'\s]/gu, '').split(/\s+/))
}

describe('validateDialogue', () => {
  it('条件を満たす英語の会話は合格し、比率を返す', () => {
    const result = validateDialogue(enDialogue, { lang: 'en', knownWords: allWords(enDialogue) })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.dialogue.turns).toHaveLength(6)
      expect(result.ratio).toBeGreaterThanOrEqual(0.8)
    }
  })

  it('韓国語の会話も合格する(比率のしきい値は 0.5)', () => {
    const ko: LessonDialogue = {
      title_ja: '카페で注文',
      scene_ja: 'カフェ',
      turns: [
        { speaker: 'A', text: '어서 오세요. 뭐 드릴까요?', ja: 'いらっしゃいませ。何にしますか' },
        { speaker: 'B', text: '커피 한 잔 주세요.', ja: 'コーヒー一杯ください' },
        { speaker: 'A', text: '네. 더 필요한 거 있어요?', ja: 'はい。他に必要なものは?' },
        { speaker: 'B', text: '추천 메뉴 있어요?', ja: 'おすすめはありますか' },
        { speaker: 'A', text: '레몬 케이크가 인기 있어요.', ja: 'レモンケーキが人気です' },
        { speaker: 'B', text: '좋아요. 포장해 주세요.', ja: 'いいですね。持ち帰りでお願いします' },
      ],
      new_expressions: [
        { text: '뭐 드릴까요', ja: '何にしますか', note_ja: '店員の聞き方', turn_index: 0 },
        { text: '더 필요한 거 있어요', ja: '他に必要なものは', note_ja: '追加の確認', turn_index: 2 },
        { text: '추천 메뉴', ja: 'おすすめメニュー', note_ja: 'おすすめを聞く', turn_index: 3 },
        { text: '포장해 주세요', ja: '持ち帰りでお願いします', note_ja: 'テイクアウトの頼み方', turn_index: 5 },
      ],
    }
    const result = validateDialogue(ko, { lang: 'ko', knownWords: ['어서', '오세요', '네', '커피', '한', '잔', '주세요', '있어요', '좋아요', '레몬', '케이크가', '인기'] })
    expect(result.ok).toBe(true)
  })

  it('往復が 6 未満なら不合格(turns)', () => {
    const short = { ...enDialogue, turns: enDialogue.turns.slice(0, 5), new_expressions: enDialogue.new_expressions.slice(0, 4).filter((e) => e.turn_index < 5) }
    const result = validateDialogue(short, { lang: 'en', knownWords: allWords(enDialogue) })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.issues.map((issue) => issue.code)).toContain('turns')
    }
  })

  it('A/B が交互でなければ不合格(alternation)', () => {
    const turns = enDialogue.turns.map((turn, index) => (index === 1 ? { ...turn, speaker: 'A' as const } : turn))
    const result = validateDialogue({ ...enDialogue, turns }, { lang: 'en', knownWords: allWords(enDialogue) })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.issues.map((issue) => issue.code)).toContain('alternation')
    }
  })

  it('英語の 1 行が 14 語を超えると不合格(length)', () => {
    const long = 'I think that maybe we could possibly try to go there together sometime next week if you want'
    const turns = enDialogue.turns.map((turn, index) => (index === 4 ? { ...turn, text: long } : turn))
    const dialogue = { ...enDialogue, turns, new_expressions: enDialogue.new_expressions.filter((e) => e.turn_index !== 4) }
    const result = validateDialogue(dialogue, { lang: 'en', knownWords: [...allWords(enDialogue), ...long.toLowerCase().split(' ')] })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.issues.map((issue) => issue.code)).toContain('length')
    }
  })

  it('新表現が本文に無ければ不合格(expressions)', () => {
    const dialogue = {
      ...enDialogue,
      new_expressions: [...enDialogue.new_expressions.slice(0, 3), { text: 'no such phrase', ja: '無い', note_ja: '無い', turn_index: 1 }],
    }
    const result = validateDialogue(dialogue, { lang: 'en', knownWords: allWords(enDialogue) })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.issues.map((issue) => issue.code)).toContain('expressions')
    }
  })

  it('新表現が 4 未満なら不合格(expressions)', () => {
    const dialogue = { ...enDialogue, new_expressions: enDialogue.new_expressions.slice(0, 2) }
    const result = validateDialogue(dialogue, { lang: 'en', knownWords: allWords(enDialogue) })
    expect(result.ok).toBe(false)
  })

  it('既知語の比率が英語で 0.8 未満なら不合格(ratio)', () => {
    const few = allWords(enDialogue).slice(0, 8)
    const result = validateDialogue(enDialogue, { lang: 'en', knownWords: few })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.issues.map((issue) => issue.code)).toContain('ratio')
      expect(result.ratio).toBeLessThan(0.8)
    }
  })

  it('英語の既知語比率が 0.7 のとき ratio を返して不合格にする', () => {
    const dialogue: LessonDialogue = {
      title_ja: '短い会話',
      scene_ja: '友人と話す',
      turns: [
        { speaker: 'A', text: 'one newalpha', ja: '1' },
        { speaker: 'B', text: 'two three newbeta', ja: '2と3' },
        { speaker: 'A', text: 'four five newgamma', ja: '4と5' },
        { speaker: 'B', text: 'six seven newdelta', ja: '6と7' },
        { speaker: 'A', text: 'eight', ja: '8' },
        { speaker: 'B', text: 'nine ten', ja: '9と10' },
      ],
      new_expressions: [
        { text: 'newalpha', ja: '新表現1', note_ja: '使い方1', turn_index: 0 },
        { text: 'newbeta', ja: '新表現2', note_ja: '使い方2', turn_index: 1 },
        { text: 'newgamma', ja: '新表現3', note_ja: '使い方3', turn_index: 2 },
        { text: 'newdelta', ja: '新表現4', note_ja: '使い方4', turn_index: 3 },
      ],
    }
    const result = validateDialogue(dialogue, {
      lang: 'en',
      knownWords: ['one', 'two', 'three', 'four', 'five', 'six', 'seven'],
    })

    expect(result.ok).toBe(false)
    expect(result.ratio).toBeCloseTo(0.7)
    if (!result.ok) {
      expect(result.issues.map((issue) => issue.code)).toContain('ratio')
    }
  })

  it('英語の行にハングルが混ざると不合格(script)', () => {
    const turns = enDialogue.turns.map((turn, index) => (index === 3 ? { ...turn, text: 'What do you 추천?' } : turn))
    const result = validateDialogue({ ...enDialogue, turns }, { lang: 'en', knownWords: allWords(enDialogue) })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.issues.map((issue) => issue.code)).toContain('script')
    }
  })

  it('形が壊れていても throw せず、turns の問題として返す', () => {
    const result = validateDialogue({ title_ja: 'x' }, { lang: 'en', knownWords: [] })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.issues.map((issue) => issue.code)).toContain('turns')
    }
  })
})

describe('validateDialogue: 今日の狙い', () => {
  function chunk(key: string, anchor: string, display = anchor): Chunk {
    return { key, kind: 'frame', lang: 'en', display, hintJa: '', anchor, variants: [] }
  }
  const couldIGet = chunk('frame:en-could-i-get', 'could i get', 'Could I get ___?')
  const anythingElse = chunk('expr:anything else', 'anything else')
  const pickUp = chunk('phrasal:pick up', 'pick up')
  const farFromHere = chunk('frame:en-is-far', 'far from here', 'Is ___ far from here?')
  const unmatchable = chunk('frame:en-thing-was-adj', '', '___ was ___.')

  it('狙いの半分以上が台詞に入っていれば合格', () => {
    const result = validateDialogue(enDialogue, {
      lang: 'en',
      knownWords: allWords(enDialogue),
      targets: [couldIGet, pickUp],
    })
    expect(result.ok).toBe(true)
  })

  it('半分未満なら targets の問題を返し、入っていない狙いを列挙する', () => {
    const result = validateDialogue(enDialogue, {
      lang: 'en',
      knownWords: allWords(enDialogue),
      targets: [pickUp, farFromHere],
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      const issue = result.issues.find((item) => item.code === 'targets')
      expect(issue?.message).toContain('「pick up」')
      expect(issue?.message).toContain('「Is ___ far from here?」')
      expect(issue?.message).toContain('少なくとも 1 個')
    }
  })

  it('固定部分の無い狙いは数えない', () => {
    const coverage = targetCoverage(enDialogue.turns, [couldIGet, anythingElse, unmatchable], 'en')
    expect(coverage.hit.map((item) => item.key)).toEqual(['frame:en-could-i-get', 'expr:anything else'])
    expect(coverage.required).toBe(1)
    expect(validateDialogue(enDialogue, { lang: 'en', knownWords: allWords(enDialogue), targets: [unmatchable] }).ok).toBe(true)
  })
})
