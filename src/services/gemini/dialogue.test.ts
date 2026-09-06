import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Chunk } from '../../features/chunks/registry'
import type { LessonDialogue } from '../../features/lesson/lessonDialogueSchema'
import { generateDialogue } from './dialogue'

const mocks = vi.hoisted(() => ({
  generateContent: vi.fn(),
}))

vi.mock('./client', () => ({
  getGeminiClient: () => ({ models: { generateContent: mocks.generateContent } }),
  getModelId: () => 'test-model',
  LONG_GENERATION_TIMEOUT_MS: 120_000,
  TRANSIENT_RETRY: {
    attempts: 3,
    initialDelay: 1,
    maxDelay: 8,
    httpStatusCodes: [500, 502, 503],
  },
}))

const dialogue: LessonDialogue = {
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

const knownWords = dialogue.turns.flatMap((turn) => (
  turn.text.toLowerCase().replace(/[^\p{L}\p{N}'\s]/gu, '').split(/\s+/)
))

function chunk(key: string, anchor: string, display = anchor): Chunk {
  return { key, kind: 'phrasal', lang: 'en', display, hintJa: '', anchor, variants: [] }
}

const pickUp = chunk('phrasal:pick up', 'pick up')
const lookFor = chunk('phrasal:look for', 'look for')

function respondWith(value: unknown): void {
  mocks.generateContent.mockResolvedValueOnce({ text: JSON.stringify(value) })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

describe('generateDialogue と今日の狙い', () => {
  const params = {
    lang: 'en' as const,
    sceneJa: 'カフェで注文する',
    interests: [],
    knownWords,
    level: 'practical-b1' as const,
  }

  it('狙いをプロンプトに入れ、2 回とも狙いだけが足りなければ採用する', async () => {
    respondWith(dialogue)
    respondWith(dialogue)

    const result = await generateDialogue({ ...params, targets: [pickUp, lookFor] })

    expect(result.attempts).toBe(2)
    expect(result.dialogue.turns).toHaveLength(6)
    const firstPrompt = mocks.generateContent.mock.calls[0][0].contents[0].parts[0].text as string
    const secondPrompt = mocks.generateContent.mock.calls[1][0].contents[0].parts[0].text as string
    expect(firstPrompt).toContain('- pick up')
    expect(secondPrompt).toContain('狙いの表現のうち')
  })

  it('狙いが入っていれば 1 回で採用する', async () => {
    respondWith(dialogue)

    const result = await generateDialogue({
      ...params,
      targets: [chunk('frame:en-could-i-get', 'could i get', 'Could I get ___?'), pickUp],
    })

    expect(result.attempts).toBe(1)
    expect(mocks.generateContent).toHaveBeenCalledTimes(1)
  })

  it('狙い以外の問題が残れば失敗させる', async () => {
    const broken = { ...dialogue, turns: dialogue.turns.slice(0, 2) }
    respondWith(broken)
    respondWith(broken)

    await expect(generateDialogue({ ...params, targets: [pickUp] })).rejects.toThrow('条件に合う会話を作れませんでした')
  })
})
