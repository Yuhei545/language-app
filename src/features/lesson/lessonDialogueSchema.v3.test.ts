import { describe, expect, it } from 'vitest'
import { validateDialogue, type LessonDialogue } from './lessonDialogueSchema'

/** 行ごとの核の表現・解説・応用の合図を持つ v3 形式の会話。 */
const v3: LessonDialogue = {
  title_ja: 'カフェで注文する',
  scene_ja: 'カフェで店員と話す',
  turns: [
    {
      speaker: 'A', text: 'Hi, what can I get for you?', ja: 'ご注文は?',
      key: { text: 'what can I get for you', ja: 'ご注文は' },
      note_ja: '店員が注文を聞く定番の言い方です。',
      prompts: [
        { cue_ja: '店員として「他に何かお持ちしましょうか」と聞いてください', answer: 'What else can I get for you?', ja: '他に何かお持ちしましょうか' },
        { cue_ja: '「ご注文は?」ともう一度聞いてください', answer: 'What can I get for you?', ja: 'ご注文は?' },
      ],
    },
    {
      speaker: 'B', text: 'Could I get a coffee, please?', ja: 'コーヒーをお願いします',
      key: { text: 'could I get', ja: '〜をもらえますか' },
      note_ja: '',
      prompts: [
        { cue_ja: '「水をお願いします」と言ってください', answer: 'Could I get some water, please?', ja: '水をお願いします' },
        { cue_ja: '「お会計をお願いします」と言ってください', answer: 'Could I get the check, please?', ja: 'お会計をお願いします' },
      ],
    },
    { speaker: 'A', text: 'Sure. Anything else?', ja: 'はい。他には?', key: { text: 'anything else', ja: '他には' }, note_ja: '', prompts: [] },
    { speaker: 'B', text: 'What do you recommend?', ja: 'おすすめは?', key: { text: 'what do you recommend', ja: 'おすすめは' }, note_ja: '', prompts: [] },
    { speaker: 'A', text: 'The lemon cake is really popular.', ja: 'レモンケーキが人気です', key: { text: 'really popular', ja: 'とても人気' }, note_ja: '', prompts: [] },
    { speaker: 'B', text: 'Sounds good. Can I get this to go?', ja: 'いいですね。持ち帰りにできますか', key: { text: 'to go', ja: '持ち帰りで' }, note_ja: '', prompts: [] },
  ],
  new_expressions: [
    { text: 'what can I get for you', ja: 'ご注文は', note_ja: '店員の定番の聞き方', turn_index: 0 },
    { text: 'anything else', ja: '他には', note_ja: '追加注文の確認', turn_index: 2 },
    { text: 'really popular', ja: 'とても人気', note_ja: 'おすすめを伝える言い方', turn_index: 4 },
    { text: 'to go', ja: '持ち帰りで', note_ja: 'テイクアウトの言い方', turn_index: 5 },
  ],
}

function allWords(dialogue: LessonDialogue): string[] {
  return dialogue.turns.flatMap((turn) => [
    ...turn.text.toLowerCase().replace(/[^\p{L}\p{N}'\s]/gu, '').split(/\s+/),
    ...(turn.prompts ?? []).flatMap((prompt) => prompt.answer.toLowerCase().replace(/[^\p{L}\p{N}'\s]/gu, '').split(/\s+/)),
  ])
}

describe('validateDialogue (v3: 行ごとの核・解説・応用)', () => {
  it('核の表現・解説・応用の合図を持つ会話を受け入れ、そのまま返す', () => {
    const result = validateDialogue(v3, { lang: 'en', knownWords: allWords(v3) })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.dialogue.turns[0].key).toEqual({ text: 'what can I get for you', ja: 'ご注文は' })
      expect(result.dialogue.turns[0].note_ja).toBe('店員が注文を聞く定番の言い方です。')
      expect(result.dialogue.turns[1].prompts).toHaveLength(2)
      expect(result.dialogue.turns[2].note_ja).toBe('')
    }
  })

  it('核の表現がその行に含まれていなければ不合格(key)', () => {
    const turns = v3.turns.map((turn, index) => (index === 1 ? { ...turn, key: { text: 'no such words', ja: 'x' } } : turn))
    const result = validateDialogue({ ...v3, turns }, { lang: 'en', knownWords: allWords(v3) })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.issues.map((issue) => issue.code)).toContain('key')
    }
  })

  it('応用の合図は 1 行につき 2 個までで、空の項目は不合格(prompts)', () => {
    const tooMany = v3.turns.map((turn, index) => (index === 0
      ? { ...turn, prompts: [...(turn.prompts ?? []), { cue_ja: 'x', answer: 'Hi there.', ja: 'x' }] }
      : turn))
    const result = validateDialogue({ ...v3, turns: tooMany }, { lang: 'en', knownWords: allWords(v3) })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.issues.map((issue) => issue.code)).toContain('prompts')
    }

    const empty = v3.turns.map((turn, index) => (index === 1
      ? { ...turn, prompts: [{ cue_ja: '', answer: 'Could I get tea?', ja: 'お茶を' }] }
      : turn))
    const result2 = validateDialogue({ ...v3, turns: empty }, { lang: 'en', knownWords: allWords(v3) })
    expect(result2.ok).toBe(false)
  })

  it('応用の答えが行の長さ制限を超えると不合格(length)', () => {
    const long = 'I think that maybe we could possibly try to go there together sometime next week if you want'
    const turns = v3.turns.map((turn, index) => (index === 1
      ? { ...turn, prompts: [{ cue_ja: 'x', answer: long, ja: 'x' }] }
      : turn))
    const result = validateDialogue({ ...v3, turns }, { lang: 'en', knownWords: [...allWords(v3), ...long.toLowerCase().split(' ')] })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.issues.map((issue) => issue.code)).toContain('length')
    }
  })

  it('保存済みの古い形式(核・解説・応用なし)もそのまま合格する', () => {
    const legacy: LessonDialogue = {
      ...v3,
      turns: v3.turns.map(({ speaker, text, ja }) => ({ speaker, text, ja })),
    }
    const result = validateDialogue(legacy, { lang: 'en', knownWords: allWords(v3) })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.dialogue.turns[0].key).toBeUndefined()
      expect(result.dialogue.turns[0].prompts ?? []).toEqual([])
    }
  })
})
