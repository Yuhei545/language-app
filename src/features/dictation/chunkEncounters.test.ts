import { describe, expect, it } from 'vitest'
import type { DictationSentence } from '../../content/dictationSchema'
import type { Chunk } from '../chunks/registry'
import type { Cloze } from './cloze'
import { dictationEncounterKind, dictationEncounters, indexSentenceChunks, sentencesWithTargets } from './chunkEncounters'

function chunk(key: string, anchor: string, variants: string[] = []): Chunk {
  return { key, kind: 'phrasal', lang: 'en', display: anchor, hintJa: '', anchor, variants }
}

function sentence(id: string, text: string): DictationSentence {
  return { id, text, focus: [], features: [] }
}

const pickUp = chunk('phrasal:pick up', 'pick up', ['picked up', 'picking up', 'picks up'])
const couldIGet = chunk('frame:en-could-i-get', 'could i get')

describe('indexSentenceChunks / sentencesWithTargets', () => {
  it('文ごとに含まれるチャンクを引き、狙いを含む文を選ぶ', () => {
    const sentences = [
      sentence('en-001', 'Could I get the check?'),
      sentence('en-002', 'I picked up the package.'),
      sentence('en-003', 'It was fine.'),
    ]
    const index = indexSentenceChunks(sentences, [pickUp, couldIGet], 'en')

    expect(index.get('en-001')?.map((item) => item.key)).toEqual(['frame:en-could-i-get'])
    expect(index.get('en-002')?.map((item) => item.key)).toEqual(['phrasal:pick up'])
    expect(index.has('en-003')).toBe(false)
    expect(sentencesWithTargets(index, [pickUp])).toEqual(new Set(['en-002']))
  })
})

describe('dictationEncounterKind', () => {
  it('全文: 書いた文に固定部分があれば said、無ければ seen', () => {
    expect(dictationEncounterKind({ chunk: pickUp, lang: 'en', cloze: null, written: 'I picked up the package' })).toBe('said')
    expect(dictationEncounterKind({ chunk: pickUp, lang: 'en', cloze: null, written: 'I picked the package' })).toBe('seen')
  })

  it('穴埋め: 空欄が固定部分にかかっていなければ seen、かかっていて埋められたら said', () => {
    // "I ___ the package." の空欄が picked up
    const covering: Cloze = { segments: ['I ', ' the package.'], blanks: [{ answer: 'picked up', featureId: 'linking' }] }
    expect(dictationEncounterKind({ chunk: pickUp, lang: 'en', cloze: covering, written: 'I picked up the package.' })).toBe('said')
    expect(dictationEncounterKind({ chunk: pickUp, lang: 'en', cloze: covering, written: 'I pick the package.' })).toBe('seen')

    // "I picked up the ___." の空欄は package。固定部分は見えているので試していない
    const notCovering: Cloze = { segments: ['I picked up the ', '.'], blanks: [{ answer: 'package', featureId: 'linking' }] }
    expect(dictationEncounterKind({ chunk: pickUp, lang: 'en', cloze: notCovering, written: 'I picked up the package.' })).toBe('seen')
  })

  it('文の台帳の行をまとめて作る(文脈は文の id)', () => {
    const entries = dictationEncounters({
      sentence: sentence('en-002', 'I picked up the package.'),
      chunks: [pickUp],
      lang: 'en',
      cloze: null,
      written: 'I picked up the package.',
    })
    expect(entries).toEqual([{ chunkKey: 'phrasal:pick up', mode: 'dictation', kind: 'said', context: 'en-002' }])
  })
})
