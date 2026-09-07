import { describe, expect, it } from 'vitest'
import { buildDialogueLesson, MAX_RECALLS_PER_BOUNDARY, type DialogueLessonStep, type ReviewItem } from './dialoguePlan'
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

/** 「会話 k/N」のラベルを持つ最初のステップの位置。 */
function firstStepOfTurn(steps: DialogueLessonStep[], turnNumber: number): number {
  return steps.findIndex((step) => step.label.startsWith(`会話 ${turnNumber}/`))
}

describe('buildDialogueLesson (Pimsleur 忠実版)', () => {
  const { steps, items } = buildDialogueLesson(dialogue, { lang: 'en', pauseSeconds: 4, currentWeek: 3 })
  const count = (kind: string) => steps.filter((step) => step.kind === kind).length
  const turnCount = dialogue.turns.length
  const kinds = steps.map((step) => step.kind)

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

  it('各行は(再出題を除くと)核 → 文全体 → (解説) → 応用 2 つ の順で、会話の登場順に並ぶ', () => {
    const second = firstStepOfTurn(steps, 2)
    const seq = steps.slice(second).filter((step) => step.kind !== 'recall').slice(0, 5).map((step) => step.kind)
    expect(seq).toEqual(['breakdown', 'line', 'explain', 'prompt', 'prompt'])
    for (let turn = 1; turn < turnCount; turn += 1) {
      expect(firstStepOfTurn(steps, turn)).toBeLessThan(firstStepOfTurn(steps, turn + 1))
    }
    expect(kinds.indexOf('replay')).toBeGreaterThan(kinds.lastIndexOf('prompt'))
    expect(kinds.indexOf('closing')).toBeGreaterThan(kinds.indexOf('replay'))
    expect(kinds[kinds.length - 1]).toBe('summary')
  })

  it('核はその行の話者の声で、全体 → かけら → 全体 → 合図 → 間 → 確認 と短く', () => {
    const second = steps.find((step) => step.kind === 'breakdown' && step.label.includes('2/'))
    expect(second?.speaker).toBe('B')
    const speaks = (second?.actions ?? []).filter((action) => action.type === 'speak' && action.lang === 'en')
    // 5 語なので末尾から 3 段(1 語・3 語・4 語)に間引く
    expect(speaks.map((action) => action.type === 'speak' && action.text)).toEqual([
      'how do I get to', 'to', 'I get to', 'do I get to', 'how do I get to', 'how do I get to',
    ])
    expect(speaks.every((action) => action.type === 'speak' && action.voice === 'B')).toBe(true)
  })

  it('文全体では核の中のかけらを飛ばし、同じ表現の繰り返しを減らす', () => {
    const first = steps.find((step) => step.kind === 'line' && step.label.includes('1/'))
    const speaks = (first?.actions ?? []).filter((action) => action.type === 'speak' && action.lang === 'en')
    // 'you' と 'help you' は核 'help you' で練習済みなので出さない
    expect(speaks.map((action) => action.type === 'speak' && action.text)).toEqual([
      'Can I help you?', 'I help you', 'Can I help you?', 'Can I help you?',
    ])
    expect(speaks[0]).toMatchObject({ voice: 'A' })
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

  it('再出題の項目は各行 1 つ(核があれば核)で、どの項目も少なくとも 1 回は思い出させる', () => {
    expect(items.map((item) => item.id)).toEqual(dialogue.turns.map((_turn, index) => `key:${index}`))
    const recalls = steps.filter((step) => step.kind === 'recall')
    for (const item of items) {
      expect(recalls.filter((step) => step.item?.id === item.id).length).toBeGreaterThanOrEqual(1)
    }
    expect(recalls.every((step) => step.stage !== undefined && step.stage >= 1 && step.stage <= 4)).toBe(true)
  })

  it('前の行の再出題は、次の行の途中に入る(同じ行の中や、行の頭には入れない)', () => {
    const firstRecallOfItem0 = steps.findIndex((step) => step.kind === 'recall' && step.item?.id === 'key:0')
    const secondTurnStart = firstStepOfTurn(steps, 2)
    const thirdTurnStart = firstStepOfTurn(steps, 3)
    expect(firstRecallOfItem0).toBeGreaterThan(secondTurnStart)
    expect(firstRecallOfItem0).toBeLessThan(thirdTurnStart)

    // どの再出題も、その項目の行のステップが全部終わってから出る
    for (let index = 0; index < turnCount; index += 1) {
      const lastStepOfTurn = steps.reduce(
        (last, step, position) => (step.label.startsWith(`会話 ${index + 1}/`) ? position : last),
        -1,
      )
      const recallIndexes = steps
        .map((step, position) => (step.kind === 'recall' && step.item?.id === `key:${index}` ? position : -1))
        .filter((position) => position >= 0)
      recallIndexes.forEach((position) => expect(position).toBeGreaterThan(lastStepOfTurn))
    }
  })

  it('同じ項目の再出題は連続させず、1 つの区切りに入る再出題は上限まで', () => {
    steps.forEach((step, index) => {
      if (step.kind !== 'recall') {
        return
      }
      const previous = steps[index - 1]
      const next = steps[index + 1]
      expect(previous?.item?.id).not.toBe(step.item?.id)
      expect(next?.item?.id).not.toBe(step.item?.id)
    })
    let run = 0
    for (const step of steps) {
      run = step.kind === 'recall' ? run + 1 : 0
      expect(run).toBeLessThanOrEqual(MAX_RECALLS_PER_BOUNDARY)
    }
  })

  it('再出題は 日本語の合図 → 録音できる間 → その行の話者の声で答え', () => {
    const recall = steps.find((step) => step.kind === 'recall' && step.item?.id === 'key:0')
    expect(recall?.speaker).toBe('A')
    expect(recall?.actions).toEqual([
      { type: 'speak', text: '「手伝う」と言ってみましょう', lang: 'ja', voice: 'narrator' },
      { type: 'pause', ms: 4000, recordable: true },
      { type: 'speak', text: 'help you', lang: 'en', voice: 'A' },
    ])
  })

  it('保存済みの古い形式(核・応用なし)でも壊れず、文全体だけで進める', () => {
    const legacy: LessonDialogue = { ...dialogue, turns: dialogue.turns.map(({ speaker, text, ja }) => ({ speaker, text, ja })) }
    const built = buildDialogueLesson(legacy, { lang: 'en', pauseSeconds: 4, currentWeek: 1 })
    const legacyKinds = built.steps.map((step) => step.kind)
    expect(legacyKinds.filter((kind) => kind === 'prompt')).toHaveLength(0)
    expect(legacyKinds.filter((kind) => kind === 'breakdown')).toHaveLength(0)
    expect(legacyKinds.filter((kind) => kind === 'explain')).toHaveLength(0)
    expect(legacyKinds.filter((kind) => kind === 'line')).toHaveLength(turnCount)
    expect(built.items.map((item) => item.id)).toEqual(dialogue.turns.map((_turn, index) => `line:${index}`))
  })
})

describe('buildDialogueLesson: 前のレッスンの復習', () => {
  const review: ReviewItem[] = [
    { from: '01-cafe', text: 'Could I get a coffee, please?', ja: 'コーヒーをもらえますか', speaker: 'B' },
    { from: '01-cafe', text: 'What can I get for you?', ja: 'ご注文は', speaker: 'A' },
  ]
  const { steps } = buildDialogueLesson(dialogue, { lang: 'en', pauseSeconds: 4, currentWeek: 1, review })
  const reviews = steps.filter((step) => step.kind === 'review')

  it('復習は 1 行目の途中から出て、各項目 2 回ずつ', () => {
    const firstReview = steps.findIndex((step) => step.kind === 'review')
    expect(firstReview).toBeGreaterThan(firstStepOfTurn(steps, 1))
    expect(firstReview).toBeLessThan(firstStepOfTurn(steps, 2))
    for (const index of [0, 1]) {
      expect(reviews.filter((step) => step.item?.id === `review:${index}`)).toHaveLength(2)
    }
    expect(reviews[0].label).toBe('前回の復習(1回目)')
  })

  it('復習のステップは 合図 → 間 → 出典の話者の声で答え', () => {
    const step = reviews.find((item) => item.item?.id === 'review:1')
    expect(step?.speaker).toBe('A')
    expect(step?.actions).toEqual([
      { type: 'speak', text: '「ご注文は」と言ってみましょう', lang: 'ja', voice: 'narrator' },
      { type: 'pause', ms: 4000, recordable: true },
      { type: 'speak', text: 'What can I get for you?', lang: 'en', voice: 'A' },
    ])
  })

  it('復習の 2 回目は 1 回目より後ろに出る(同じ区切りに続けない)', () => {
    const positions = steps
      .map((step, index) => ({ step, index }))
      .filter(({ step }) => step.kind === 'review' && step.item?.id === 'review:0')
      .map(({ index }) => index)
    expect(positions[1] - positions[0]).toBeGreaterThan(2)
  })

  it('復習を渡さなければ従来と同じ', () => {
    const plain = buildDialogueLesson(dialogue, { lang: 'en', pauseSeconds: 4, currentWeek: 1 })
    const withEmpty = buildDialogueLesson(dialogue, { lang: 'en', pauseSeconds: 4, currentWeek: 1, review: [] })
    expect(withEmpty.steps.map((step) => step.label)).toEqual(plain.steps.map((step) => step.label))
    expect(plain.steps.some((step) => step.kind === 'review')).toBe(false)
  })
})
