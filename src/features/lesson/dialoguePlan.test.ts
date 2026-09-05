import { describe, expect, it } from 'vitest'
import { buildDialogueLesson } from './dialoguePlan'
import type { LessonDialogue } from './lessonDialogueSchema'

const dialogue: LessonDialogue = {
  title_ja: '駅で道を尋ねる',
  scene_ja: '駅で駅員に道を尋ねる',
  turns: [
    { speaker: 'A', text: 'Can I help you?', ja: 'お手伝いしましょうか' },
    { speaker: 'B', text: 'How do I get to the airport?', ja: '空港へはどう行けばいいですか' },
    { speaker: 'A', text: 'Take the express train on platform two.', ja: '2番ホームの急行に乗ってください' },
    { speaker: 'B', text: 'How long does it take?', ja: 'どれくらいかかりますか' },
    { speaker: 'A', text: 'About forty minutes.', ja: '40分ほどです' },
    { speaker: 'B', text: 'Is it within walking distance from here?', ja: 'ここから歩いて行ける距離ですか' },
    { speaker: 'A', text: 'No, it is quite far. Take the train.', ja: 'いいえ、かなり遠いです。電車に乗ってください' },
    { speaker: 'B', text: 'Got it. Thanks, that really helps.', ja: '分かりました。ありがとう、すごく助かります' },
  ],
  new_expressions: [
    { text: 'how do I get to', ja: '〜へはどう行けばいいですか', note_ja: '道の聞き方', turn_index: 1 },
    { text: 'express train', ja: '急行', note_ja: '速い電車', turn_index: 2 },
    { text: 'how long does it take', ja: 'どれくらいかかりますか', note_ja: '所要時間の聞き方', turn_index: 3 },
    { text: 'within walking distance', ja: '歩いて行ける距離', note_ja: '距離感を聞く', turn_index: 5 },
    { text: 'that really helps', ja: 'すごく助かります', note_ja: '感謝を伝える', turn_index: 7 },
  ],
}

describe('buildDialogueLesson', () => {
  const { steps, items } = buildDialogueLesson(dialogue, { lang: 'en', pauseSeconds: 4, currentWeek: 3 })
  const count = (kind: string) => steps.filter((step) => step.kind === kind).length

  it('構成: 冒頭 1・分解 5・再生 1・締め 4(B の行数)・まとめ 1', () => {
    expect(count('intro')).toBe(1)
    expect(count('breakdown')).toBe(5)
    expect(count('replay')).toBe(1)
    expect(count('closing')).toBe(4)
    expect(count('summary')).toBe(1)
  })

  it('順序: intro → breakdown → replay → recall → closing → summary', () => {
    const kinds = steps.map((step) => step.kind)
    expect(kinds[0]).toBe('intro')
    expect(kinds[kinds.length - 1]).toBe('summary')
    expect(kinds.indexOf('replay')).toBeGreaterThan(kinds.lastIndexOf('breakdown'))
    expect(kinds.indexOf('recall')).toBeGreaterThan(kinds.indexOf('replay'))
    expect(kinds.indexOf('closing')).toBeGreaterThan(kinds.lastIndexOf('recall'))
  })

  it('再出題は stage 1〜4 だけで、各新表現に 4 回ずつ', () => {
    const recalls = steps.filter((step) => step.kind === 'recall')
    expect(recalls.every((step) => step.stage !== undefined && step.stage >= 1 && step.stage <= 4)).toBe(true)
    for (const item of items) {
      expect(recalls.filter((step) => step.item?.id === item.id)).toHaveLength(4)
    }
  })

  it('items は新表現と同数で、答えが新表現の text', () => {
    expect(items).toHaveLength(5)
    expect(items.map((item) => item.answer)).toEqual(dialogue.new_expressions.map((e) => e.text))
  })

  it('冒頭の会話は A と B の声を分けて読む', () => {
    const intro = steps.find((step) => step.kind === 'intro')
    const speaks = (intro?.actions ?? []).filter((action) => action.type === 'speak')
    expect(speaks.some((action) => action.type === 'speak' && action.voice === 'A')).toBe(true)
    expect(speaks.some((action) => action.type === 'speak' && action.voice === 'B')).toBe(true)
  })

  it('締めの各ステップは直前の A の行を読み、B の日本語を問いにし、模範を最後に読む', () => {
    const closings = steps.filter((step) => step.kind === 'closing')
    const bTurns = dialogue.turns.filter((turn) => turn.speaker === 'B')
    closings.forEach((step, index) => {
      const bIndex = dialogue.turns.indexOf(bTurns[index])
      const previousA = dialogue.turns[bIndex - 1]
      const speaks = step.actions.filter((action) => action.type === 'speak')
      expect(speaks.some((action) => action.type === 'speak' && action.text === previousA.text)).toBe(true)
      expect(speaks.some((action) => action.type === 'speak' && action.lang === 'ja' && action.text.includes(bTurns[index].ja))).toBe(true)
      const last = speaks[speaks.length - 1]
      expect(last.type === 'speak' && last.text === bTurns[index].text).toBe(true)
      expect(step.speaker).toBe('you')
    })
  })

  it('分解は解説 → 末尾からの組み立て → 問い → 間 → 模範 の並びを含む', () => {
    const first = steps.find((step) => step.kind === 'breakdown')
    const actions = first?.actions ?? []
    expect(actions[0]).toMatchObject({ type: 'speak', lang: 'ja', text: dialogue.new_expressions[0].note_ja })
    expect(actions.some((action) => action.type === 'pause' && action.ms === 4000)).toBe(true)
    const last = actions[actions.length - 1]
    expect(last).toMatchObject({ type: 'speak', text: dialogue.new_expressions[0].text })
  })
})
