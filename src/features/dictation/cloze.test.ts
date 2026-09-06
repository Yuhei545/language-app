import { describe, expect, it } from 'vitest'
import type { DictationSentence } from '../../content/dictationSchema'
import { buildCloze, checkBlank } from './cloze'

function sentence(overrides: Partial<DictationSentence> = {}): DictationSentence {
  return {
    id: 'en-001',
    text: 'I want to go to the station.',
    focus: ['want to は wanna のように聞こえる'],
    features: [
      { id: 'reduction', span: 'want to' },
      { id: 'weak-form', span: 'to the' },
    ],
    ...overrides,
  }
}

describe('buildCloze', () => {
  it('現象のある箇所を空欄にし、前後の文字はそのまま残す', () => {
    const cloze = buildCloze(sentence())

    expect(cloze).not.toBeNull()
    expect(cloze!.blanks.map((blank) => blank.answer)).toEqual(['want to', 'to the'])
    expect(cloze!.blanks.map((blank) => blank.featureId)).toEqual(['reduction', 'weak-form'])
    expect(cloze!.segments).toEqual(['I ', ' go ', ' station.'])
    expect(cloze!.segments.length).toBe(cloze!.blanks.length + 1)
  })

  it('重なる箇所は先に見つかった方だけを空欄にする', () => {
    const cloze = buildCloze(sentence({
      features: [
        { id: 'reduction', span: 'want to' },
        { id: 'weak-form', span: 'to' },
      ],
    }))

    expect(cloze!.blanks).toHaveLength(1)
    expect(cloze!.blanks[0].answer).toBe('want to')
  })

  it('現象が無ければ null(全文書き取りにする)', () => {
    expect(buildCloze(sentence({ features: [] }))).toBeNull()
  })

  it('韓国語でも同じように空欄を作る', () => {
    const cloze = buildCloze({
      id: 'ko-001',
      text: '밥을 먹어요.',
      focus: ['연음'],
      features: [{ id: 'liaison', span: '밥을' }, { id: 'liaison', span: '먹어요' }],
    })

    expect(cloze!.blanks.map((blank) => blank.answer)).toEqual(['밥을', '먹어요'])
    expect(cloze!.segments).toEqual(['', ' ', '.'])
  })
})

describe('checkBlank', () => {
  it('大文字小文字・前後の空白・末尾の句読点は無視する', () => {
    expect(checkBlank(' Want To ', 'want to')).toBe(true)
    expect(checkBlank('want to.', 'want to')).toBe(true)
    expect(checkBlank('want  to', 'want to')).toBe(true)
  })

  it('違う語は不一致', () => {
    expect(checkBlank('wanna', 'want to')).toBe(false)
    expect(checkBlank('', 'want to')).toBe(false)
  })
})
