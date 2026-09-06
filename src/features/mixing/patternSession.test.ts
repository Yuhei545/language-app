import { describe, expect, it } from 'vitest'
import { loadCore, type CoreFrame, type CoreVocab } from '../../content/coreSchema'
import { comboKey } from './deal'
import { buildPatternSession, comboContext, type FrameStats } from './patternSession'

function frame(id: string, level: 1 | 2 | 3 = 1): CoreFrame {
  return {
    id,
    level,
    pattern: `${id} {noun:thing}`,
    slots: ['noun:thing'],
    hint_ja: `${id}の{1}`,
    note_ja: 'テスト用の解説',
    examples: [{ text: 'a', ja: 'あ' }, { text: 'b', ja: 'い' }],
  }
}

function core(frames: CoreFrame[]): CoreVocab {
  return {
    version: 1,
    verbs: [],
    adjectives: [],
    phrasal: [],
    frames,
    nouns: [
      { text: 'one', emoji: '1️⃣', hint_ja: '1', kind: 'thing' },
      { text: 'two', emoji: '2️⃣', hint_ja: '2', kind: 'thing' },
      { text: 'three', emoji: '3️⃣', hint_ja: '3', kind: 'thing' },
      { text: 'four', emoji: '4️⃣', hint_ja: '4', kind: 'thing' },
      { text: 'five', emoji: '5️⃣', hint_ja: '5', kind: 'thing' },
    ],
  }
}

function stats(
  frameId: string,
  attempts: number,
  firstTry: number,
): FrameStats {
  return { frameId, attempts, firstTry, latencyMsTotal: 0, latencySamples: 0 }
}

describe('buildPatternSession', () => {
  it('習熟率、試行数、id の順で対象レベル以下の型を選ぶ', () => {
    const session = buildPatternSession({
      core: core([frame('c'), frame('b'), frame('a'), frame('level-2', 2)]),
      level: 1,
      stats: [stats('a', 10, 5), stats('b', 4, 2), stats('c', 10, 2)],
      history: new Map(),
      rng: () => 0,
      framesPerSession: 3,
      itemsPerFrame: 1,
    })

    expect(session.frames.map((item) => item.id)).toEqual(['c', 'b', 'a'])
  })

  it('各型の項目を A B C A B C の順に交互配置する', () => {
    const session = buildPatternSession({
      core: core([frame('a'), frame('b'), frame('c')]),
      level: 1,
      stats: [],
      history: new Map(),
      rng: () => 0,
      itemsPerFrame: 2,
    })

    expect(session.items.map((item) => item.frame.id)).toEqual(['a', 'b', 'c', 'a', 'b', 'c'])
    expect(session.items[0]).toMatchObject({
      id: 'a|one',
      promptJa: 'aの1',
      answer: 'a one',
    })
  })

  it('未経験の組を優先し、同じ組をセッション内で重複させない', () => {
    const vocabulary = core([frame('a')])
    const triedKey = comboKey('a', [vocabulary.nouns[0]])
    const session = buildPatternSession({
      core: vocabulary,
      level: 1,
      stats: [],
      history: new Map([[triedKey, { attempt_count: 1 }]]),
      rng: () => 0,
      itemsPerFrame: 4,
    })

    expect(session.items.map((item) => item.id)).not.toContain(triedKey)
    expect(new Set(session.items.map((item) => item.id)).size).toBe(4)
  })

  it('型が3未満なら存在する分だけ使う', () => {
    const session = buildPatternSession({
      core: core([frame('a'), frame('b')]),
      level: 1,
      stats: [],
      history: new Map(),
      rng: () => 0,
      itemsPerFrame: 1,
    })

    expect(session.frames).toHaveLength(2)
    expect(session.items).toHaveLength(2)
  })

  it('2周目は同じ項目を並べ替え、周の境界で同じ項目を続けない', () => {
    const values = [0.8, 0.1, 0.6, 0.3, 0.9, 0.2, 0.7, 0.4]
    let index = 0
    const session = buildPatternSession({
      core: core([frame('a'), frame('b')]),
      level: 1,
      stats: [],
      history: new Map(),
      rng: () => values[index++ % values.length],
      itemsPerFrame: 2,
    })

    expect(session.rounds[0]).toBe(session.items)
    expect([...session.rounds[1]].sort((a, b) => a.id.localeCompare(b.id)))
      .toEqual([...session.items].sort((a, b) => a.id.localeCompare(b.id)))
    expect(session.rounds[1][0].id).not.toBe(
      session.rounds[0][session.rounds[0].length - 1]?.id,
    )
  })
})

describe('buildPatternSession: 組み合わせが少ない型', () => {
  it('型の組み合わせが itemsPerFrame に満たなくても落とさず、ある分だけ出す', () => {
    const core = loadCore('ko')
    const session = buildPatternSession({
      core,
      level: 2,
      stats: [],
      history: new Map(),
      rng: () => 0,
      framesPerSession: 8,
      itemsPerFrame: 4,
    })

    // ko-person-verb は名詞 1 × 動詞 1 = 1 通りしかない
    const personItems = session.items.filter((item) => item.frame.id === 'ko-person-verb')
    if (session.frames.some((frame) => frame.id === 'ko-person-verb')) {
      expect(personItems).toHaveLength(1)
    }
    expect(session.items.length).toBeGreaterThan(0)
    expect(new Set(session.items.map((item) => item.id)).size).toBe(session.items.length)
  })
})

describe('buildPatternSession: 今日の狙い', () => {
  function phrasalCore(): CoreVocab {
    const base = core([frame('plain-a'), frame('plain-b'), frame('plain-c')])
    return {
      ...base,
      phrasal: [
        { text: 'pick up', emoji: '📦', hint_ja: '受け取る', takes: 'thing' },
        { text: 'sort out', emoji: '🗂️', hint_ja: '片づける', takes: 'thing' },
      ],
      frames: [
        ...base.frames,
        {
          id: 'need-phrasal',
          level: 1,
          pattern: 'I need to {phrasal:thing} {noun:thing}.',
          slots: ['phrasal:thing', 'noun:thing'],
          hint_ja: '{2}を{1}',
          note_ja: '解説',
          examples: [{ text: 'a', ja: 'あ' }, { text: 'b', ja: 'い' }],
        },
      ],
    }
  }

  it('狙いの型を先に、狙いの句動詞を載せられる型をその次に出す', () => {
    const session = buildPatternSession({
      core: phrasalCore(),
      level: 1,
      // plain-a がいちばん苦手(従来ならこれが先頭)。無記録の型は習熟率 0 で最も苦手扱いなので plain-b にも記録を与える
      stats: [stats('plain-a', 10, 1), stats('plain-b', 10, 9)],
      history: new Map(),
      rng: () => 0,
      itemsPerFrame: 1,
      targets: { frameIds: ['plain-c'], phrasal: ['pick up'], recentContexts: new Map() },
    })

    expect(session.frames.map((item) => item.id)).toEqual(['plain-c', 'need-phrasal', 'plain-a'])
  })

  it('狙いの句動詞を含む組を、その型の半分まで使う', () => {
    const session = buildPatternSession({
      core: phrasalCore(),
      level: 1,
      stats: [],
      history: new Map(),
      rng: () => 0,
      framesPerSession: 1,
      itemsPerFrame: 4,
      targets: { frameIds: [], phrasal: ['pick up'], recentContexts: new Map() },
    })

    const withTarget = session.items.filter((item) => item.words.some((word) => word.text === 'pick up'))
    expect(session.frames[0].id).toBe('need-phrasal')
    expect(withTarget).toHaveLength(2)
  })

  it('その型で最近使った組は避ける', () => {
    const vocabulary = core([frame('a')])
    const recentCombo = comboContext([vocabulary.nouns[0]])
    const session = buildPatternSession({
      core: vocabulary,
      level: 1,
      stats: [],
      history: new Map(),
      rng: () => 0,
      itemsPerFrame: 1,
      targets: { frameIds: ['a'], phrasal: [], recentContexts: new Map([['frame:a', [recentCombo]]]) },
    })

    // rng 0 なら従来は nouns[0](one)が選ばれる。最近使った組なので次の候補になる
    expect(session.items[0].words[0].text).toBe('two')
  })

  it('狙いを渡さなければ従来と同じ', () => {
    const vocabulary = core([frame('c'), frame('b'), frame('a')])
    const params = {
      core: vocabulary,
      level: 1 as const,
      stats: [stats('a', 10, 5), stats('b', 4, 2), stats('c', 10, 2)],
      history: new Map(),
      rng: () => 0,
      itemsPerFrame: 2,
    }
    const plain = buildPatternSession(params)
    const withEmpty = buildPatternSession({ ...params, targets: { frameIds: [], phrasal: [], recentContexts: new Map() } })

    expect(withEmpty.items.map((item) => item.id)).toEqual(plain.items.map((item) => item.id))
  })
})
