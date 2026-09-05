import { describe, expect, it } from 'vitest'
import { buildDialogueLesson } from './dialoguePlan'
import type { LessonDialogue } from './lessonDialogueSchema'

const dialogue: LessonDialogue = {
  title_ja: '駅で道を尋ねる',
  scene_ja: '駅で駅員に道を尋ねる',
  turns: [
    {
      speaker: 'A', text: 'Can I help you?', ja: 'お手伝いしましょうか',
      key: { text: 'help you', ja: '手伝う' }, note_ja: '',
      prompts: [
        { cue_ja: '駅員として「切符はお持ちですか」と聞いてください', answer: 'Do you have a ticket?', ja: '切符はお持ちですか' },
        { cue_ja: '「お手伝いしましょうか」ともう一度聞いてください', answer: 'Can I help you?', ja: 'お手伝いしましょうか' },
      ],
    },
    {
      speaker: 'B', text: 'How do I get to the airport?', ja: '空港へはどう行けばいいですか',
      key: { text: 'how do I get to', ja: '〜へはどう行けばいいですか' },
      note_ja: '目的地を変えれば、どこへ行くときにも使えます。',
      prompts: [
        { cue_ja: '「駅へはどう行けばいいですか」と聞いてください', answer: 'How do I get to the station?', ja: '駅へはどう行けばいいですか' },
        { cue_ja: '「ホテルへはどう行けばいいですか」と聞いてください', answer: 'How do I get to the hotel?', ja: 'ホテルへはどう行けばいいですか' },
      ],
    },
    {
      speaker: 'A', text: 'Take the express train on platform two.', ja: '2番ホームの急行に乗ってください',
      key: { text: 'express train', ja: '急行' }, note_ja: '',
      prompts: [
        { cue_ja: '「3番ホームの電車に乗ってください」と言ってください', answer: 'Take the train on platform three.', ja: '3番ホームの電車に乗ってください' },
        { cue_ja: '「急行に乗ってください」と言ってください', answer: 'Take the express train.', ja: '急行に乗ってください' },
      ],
    },
    {
      speaker: 'B', text: 'How long does it take?', ja: 'どれくらいかかりますか',
      key: { text: 'how long does it take', ja: 'どれくらいかかりますか' }, note_ja: '',
      prompts: [
        { cue_ja: '「バスだとどれくらいかかりますか」と聞いてください', answer: 'How long does it take by bus?', ja: 'バスだとどれくらいかかりますか' },
        { cue_ja: '「どれくらいかかりますか」ともう一度聞いてください', answer: 'How long does it take?', ja: 'どれくらいかかりますか' },
      ],
    },
    {
      speaker: 'A', text: 'About forty minutes.', ja: '40分ほどです',
      key: { text: 'about forty minutes', ja: '40分ほど' }, note_ja: '',
      prompts: [
        { cue_ja: '「20分ほどです」と答えてください', answer: 'About twenty minutes.', ja: '20分ほどです' },
        { cue_ja: '「1時間ほどです」と答えてください', answer: 'About an hour.', ja: '1時間ほどです' },
      ],
    },
    {
      speaker: 'B', text: 'Got it. Thanks, that really helps.', ja: '分かりました。ありがとう、すごく助かります',
      key: { text: 'that really helps', ja: 'すごく助かります' }, note_ja: '',
      prompts: [
        { cue_ja: '「ありがとう、すごく助かります」と言ってください', answer: 'Thanks, that really helps.', ja: 'ありがとう、すごく助かります' },
        { cue_ja: '「分かりました」と言ってください', answer: 'Got it.', ja: '分かりました' },
      ],
    },
  ],
  new_expressions: [
    { text: 'how do I get to', ja: '〜へはどう行けばいいですか', note_ja: '道の聞き方', turn_index: 1 },
    { text: 'express train', ja: '急行', note_ja: '速い電車', turn_index: 2 },
    { text: 'how long does it take', ja: 'どれくらいかかりますか', note_ja: '所要時間の聞き方', turn_index: 3 },
    { text: 'that really helps', ja: 'すごく助かります', note_ja: '感謝を伝える', turn_index: 5 },
  ],
}

describe('buildDialogueLesson (Pimsleur 忠実版)', () => {
  const { steps, items } = buildDialogueLesson(dialogue, { lang: 'en', pauseSeconds: 4, currentWeek: 3 })
  const count = (kind: string) => steps.filter((step) => step.kind === kind).length
  const turnCount = dialogue.turns.length

  it('構成: 冒頭 1・核 N・文全体 N・解説(あるものだけ)・応用 2N・再生 1・締め(B の行数)・まとめ 1', () => {
    expect(count('intro')).toBe(1)
    expect(count('breakdown')).toBe(turnCount)
    expect(count('line')).toBe(turnCount)
    expect(count('explain')).toBe(dialogue.turns.filter((turn) => (turn.note_ja ?? '').trim().length > 0).length)
    expect(count('prompt')).toBe(turnCount * 2)
    expect(count('replay')).toBe(1)
    expect(count('closing')).toBe(dialogue.turns.filter((turn) => turn.speaker === 'B').length)
    expect(count('summary')).toBe(1)
  })

  it('冒頭では会話を 2 回聞かせ、終わりには分かるようになると告げる', () => {
    const intro = steps[0]
    expect(intro.kind).toBe('intro')
    const lineSpeaks = intro.actions.filter((action) => action.type === 'speak' && action.lang === 'en')
    expect(lineSpeaks).toHaveLength(turnCount * 2)
    const narration = intro.actions.find((action) => action.type === 'speak' && action.lang === 'ja' && action.text.includes('分か'))
    expect(narration).toBeDefined()
  })

  it('各行は 核 → 文全体 → (解説) → 応用 2 つ の順で、会話の登場順に並ぶ', () => {
    const kinds = steps.map((step) => step.kind)
    const firstBreakdown = kinds.indexOf('breakdown')
    expect(kinds[firstBreakdown + 1]).toBe('line')
    // 2 行目(B)は解説あり: 核 → 文全体 → 解説 → 応用 → 応用
    const secondBreakdown = steps.findIndex((step) => step.kind === 'breakdown' && step.label.includes('2/'))
    const seq = steps.slice(secondBreakdown, secondBreakdown + 5).map((step) => step.kind)
    expect(seq).toEqual(['breakdown', 'line', 'explain', 'prompt', 'prompt'])
    // 全部の行を終えてから通し再生、その後に締め、最後にまとめ
    expect(kinds.indexOf('replay')).toBeGreaterThan(kinds.lastIndexOf('prompt'))
    expect(kinds.indexOf('closing')).toBeGreaterThan(kinds.indexOf('replay'))
    expect(kinds[kinds.length - 1]).toBe('summary')
  })

  it('核と文全体はその行の話者の声で組み立て、全体を先に聞かせる', () => {
    const second = steps.find((step) => step.kind === 'breakdown' && step.label.includes('2/'))
    expect(second?.speaker).toBe('B')
    const speaks = (second?.actions ?? []).filter((action) => action.type === 'speak' && action.lang === 'en')
    expect(speaks[0]).toMatchObject({ text: 'how do I get to', voice: 'B' })
    expect(speaks.every((action) => action.type === 'speak' && action.voice === 'B')).toBe(true)
    const line = steps.find((step) => step.kind === 'line' && step.label.includes('2/'))
    const lineSpeaks = (line?.actions ?? []).filter((action) => action.type === 'speak' && action.lang === 'en')
    expect(lineSpeaks[0]).toMatchObject({ text: 'How do I get to the airport?', voice: 'B' })
  })

  it('応用の合図は 日本語の合図 → 録音できる間 → 話者の声で答え、item を持つ', () => {
    const prompt = steps.find((step) => step.kind === 'prompt')
    expect(prompt?.speaker).toBe('you')
    expect(prompt?.item).toMatchObject({ cueJa: dialogue.turns[0].prompts![0].cue_ja, answer: 'Do you have a ticket?' })
    const actions = prompt?.actions ?? []
    expect(actions[0]).toMatchObject({ type: 'speak', lang: 'ja', text: dialogue.turns[0].prompts![0].cue_ja })
    expect(actions[1]).toMatchObject({ type: 'pause', ms: 4000, recordable: true })
    expect(actions[2]).toMatchObject({ type: 'speak', lang: 'en', text: 'Do you have a ticket?', voice: 'A' })
  })

  it('解説はナレーターが日本語で 1 回だけ読む', () => {
    const explain = steps.find((step) => step.kind === 'explain')
    expect(explain?.actions).toEqual([
      { type: 'speak', text: '目的地を変えれば、どこへ行くときにも使えます。', lang: 'ja', voice: 'narrator' },
    ])
  })

  it('再出題の項目は 核 + 文全体 で、stage 1〜4 が各 4 回ずつ入り、行の処理の間に散らばる', () => {
    expect(items).toHaveLength(turnCount * 2)
    const recalls = steps.filter((step) => step.kind === 'recall')
    expect(recalls.every((step) => step.stage !== undefined && step.stage >= 1 && step.stage <= 4)).toBe(true)
    for (const item of items) {
      expect(recalls.filter((step) => step.item?.id === item.id)).toHaveLength(4)
    }
    const kinds = steps.map((step) => step.kind)
    expect(kinds.indexOf('recall')).toBeLessThan(kinds.lastIndexOf('line'))
  })

  it('まだ出ていない行の項目は再出題しない', () => {
    const introduced = new Set<string>()
    for (const step of steps) {
      if ((step.kind === 'breakdown' || step.kind === 'line') && step.item) {
        introduced.add(step.item.id)
      }
      if (step.kind === 'recall' && step.item) {
        expect(introduced.has(step.item.id)).toBe(true)
      }
    }
  })

  it('保存済みの古い形式(核・応用なし)でも壊れず、文全体だけで進める', () => {
    const legacy: LessonDialogue = { ...dialogue, turns: dialogue.turns.map(({ speaker, text, ja }) => ({ speaker, text, ja })) }
    const built = buildDialogueLesson(legacy, { lang: 'en', pauseSeconds: 4, currentWeek: 1 })
    const kinds = built.steps.map((step) => step.kind)
    expect(kinds.filter((kind) => kind === 'prompt')).toHaveLength(0)
    expect(kinds.filter((kind) => kind === 'breakdown')).toHaveLength(0)
    expect(kinds.filter((kind) => kind === 'explain')).toHaveLength(0)
    expect(kinds.filter((kind) => kind === 'line')).toHaveLength(turnCount)
    expect(built.items).toHaveLength(turnCount)
  })
})
