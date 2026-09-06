import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LONG_GENERATION_TIMEOUT_MS, TRANSIENT_RETRY } from './client'
import {
  checkTopicTurn,
  generateQuickQuestions,
  judgeQuickAnswers,
  translatePersonalWord,
} from './speaking'

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

function respondWith(value: unknown): void {
  mocks.generateContent.mockResolvedValueOnce({ text: JSON.stringify(value) })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('checkTopicTurn', () => {
  const params = {
    lang: 'en' as const,
    personaName: 'Alex',
    topicJa: '週末の予定を話してください',
    learnerText: 'I will meet my friend.',
  }

  it('正常なJSONを型どおり返し、JSONスキーマとabortSignalを渡す', async () => {
    const expected = {
      understood: true,
      recast: 'I am meeting my friend this weekend.',
      ja: '今週末、友だちに会います。',
      follow_up: 'Where will you meet?',
      follow_up_ja: 'どこで会いますか？',
    }
    const controller = new AbortController()
    respondWith(expected)

    await expect(checkTopicTurn(params, { signal: controller.signal })).resolves.toEqual(expected)
    expect(mocks.generateContent).toHaveBeenCalledWith(expect.objectContaining({
      model: 'test-model',
      config: expect.objectContaining({
        responseMimeType: 'application/json',
        abortSignal: controller.signal,
      }),
    }))
  })

  it('必須項目が欠けたJSONはparseエラーにする', async () => {
    respondWith({ understood: true, recast: 'I will go.', ja: '行きます。', follow_up: '' })

    await expect(checkTopicTurn(params)).rejects.toMatchObject({ kind: 'parse' })
  })
})

describe('generateQuickQuestions', () => {
  const params = {
    lang: 'en' as const,
    frames: [{ pattern: 'Do you have {noun:thing}?', hint_ja: '{1}はありますか' }],
    personalWords: [{ text: 'Asakusa', kind: 'place' as const }],
    count: 2,
  }

  it('正常な配列を返し、長時間生成用の再試行設定を使う', async () => {
    const expected = [
      { q: 'Do you have a ticket?', ja: '切符を持っていますか？' },
      { q: 'Do you like Asakusa?', ja: '浅草が好きですか？' },
    ]
    respondWith(expected)

    await expect(generateQuickQuestions(params)).resolves.toEqual(expected)
    expect(mocks.generateContent).toHaveBeenCalledWith(expect.objectContaining({
      config: expect.objectContaining({
        responseMimeType: 'application/json',
        httpOptions: {
          timeout: LONG_GENERATION_TIMEOUT_MS,
          retryOptions: {
            ...TRANSIENT_RETRY,
            attempts: 4,
            initialDelay: 2,
            maxDelay: 15,
          },
        },
      }),
    }))
  })

  it('要素数が指定件数より少なければparseエラーにする', async () => {
    respondWith([{ q: 'Do you have a ticket?', ja: '切符を持っていますか？' }])

    await expect(generateQuickQuestions(params)).rejects.toMatchObject({ kind: 'parse' })
  })

  it('要素の必須項目が欠けていればparseエラーにする', async () => {
    respondWith([{ q: 'Question one?', ja: '質問1' }, { q: 'Question two?' }])

    await expect(generateQuickQuestions(params)).rejects.toMatchObject({ kind: 'parse' })
  })
})

describe('judgeQuickAnswers', () => {
  const params = {
    lang: 'ko' as const,
    items: [
      { q: '어디에 가요?', answer: '서울에 가요.' },
      { q: '뭐 먹어요?', answer: '김밥 먹어요.' },
    ],
  }

  it('正常な配列を型どおり返す', async () => {
    const expected = [
      { understood: true, better: '' },
      { understood: true, better: '김밥을 먹어요.' },
    ]
    respondWith(expected)

    await expect(judgeQuickAnswers(params)).resolves.toEqual(expected)
    expect(mocks.generateContent.mock.calls[0][0].config.httpOptions).toEqual({
      timeout: LONG_GENERATION_TIMEOUT_MS,
      retryOptions: {
        ...TRANSIENT_RETRY,
        attempts: 4,
        initialDelay: 2,
        maxDelay: 15,
      },
    })
  })

  it('要素数不足と必須項目欠けをparseエラーにする', async () => {
    respondWith([{ understood: true, better: '' }])
    await expect(judgeQuickAnswers(params)).rejects.toMatchObject({ kind: 'parse' })

    respondWith([{ understood: true }, { understood: false, better: '다시 말해 주세요.' }])
    await expect(judgeQuickAnswers(params)).rejects.toMatchObject({ kind: 'parse' })
  })
})

describe('translatePersonalWord', () => {
  const params = { ja: '東京タワー', kind: 'place' as const }

  it('正常なJSONを型どおり返す', async () => {
    respondWith({ en: 'Tokyo Tower', ko: '도쿄 타워' })

    await expect(translatePersonalWord(params)).resolves.toEqual({
      en: 'Tokyo Tower',
      ko: '도쿄 타워',
    })
  })

  it('JSON解析失敗と必須項目欠けをparseエラーにする', async () => {
    mocks.generateContent.mockResolvedValueOnce({ text: '{broken' })
    await expect(translatePersonalWord(params)).rejects.toMatchObject({ kind: 'parse' })

    respondWith({ en: 'Tokyo Tower' })
    await expect(translatePersonalWord(params)).rejects.toMatchObject({ kind: 'parse' })
  })
})
