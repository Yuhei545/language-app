import { describe, expect, it } from 'vitest'
import {
  buildMixingCheckPrompt,
  buildParentSystemPrompt,
  buildTranscribePrompt,
  buildVocabPrompt,
  type ParentPromptInput,
} from './prompts'

const baseInput: ParentPromptInput = {
  lang: 'en',
  personaName: 'Taylor',
  scenario: 'Ordering breakfast at a small cafe',
  knownWords: ['hello', 'coffee'],
  weekWords: ['toast', 'please'],
  targetWords: [],
  interests: ['travel'],
}

describe('buildParentSystemPrompt', () => {
  it('knownWordsとweekWordsを本文へ列挙する', () => {
    const prompt = buildParentSystemPrompt(baseInput)

    expect(prompt).toContain('Known words: hello, coffee')
    expect(prompt).toContain("This week's words: toast, please")
  })

  it('訂正しない規則と1-2文の制約を含む', () => {
    const prompt = buildParentSystemPrompt(baseInput)

    expect(prompt).toContain("NEVER correct the learner's mistakes")
    expect(prompt).toContain('1-2 short sentences')
    expect(prompt).toContain('Never use words like "wrong", "mistake", or "incorrect"')
  })

  it('targetWordsが空なら引き出しの指示を含めない', () => {
    const prompt = buildParentSystemPrompt(baseInput)
    expect(prompt).not.toContain('Try to naturally create openings')
  })

  it('targetWordsがあれば引き出しの指示と語を含める', () => {
    const prompt = buildParentSystemPrompt({
      ...baseInput,
      targetWords: ['ticket', 'station'],
    })

    expect(prompt).toContain('Try to naturally create openings')
    expect(prompt).toContain('ticket, station')
  })

  it('personaNameとscenarioを反映する', () => {
    const prompt = buildParentSystemPrompt(baseInput)

    expect(prompt).toContain('You are Taylor from London')
    expect(prompt).toContain('Scenario: Ordering breakfast at a small cafe')
  })
})

describe('buildVocabPrompt', () => {
  it('指定件数と既知語との重複禁止を含む', () => {
    const prompt = buildVocabPrompt({
      lang: 'ko',
      week: 3,
      knownWords: ['안녕', '친구'],
      interests: ['friends'],
      count: 12,
    })

    expect(prompt).toContain('exactly 12')
    expect(prompt).toContain('week 3')
    expect(prompt).toContain('Do not include any word already')
    expect(prompt).toContain('안녕, 친구')
  })
})

describe('buildTranscribePrompt', () => {
  it('韓国語はハングル限定で、ローマ字化と翻訳を禁止する', () => {
    const prompt = buildTranscribePrompt('ko')
    expect(prompt).toContain('Korean')
    expect(prompt).toContain('Hangul only')
    expect(prompt).toContain('no romanization')
    expect(prompt).toContain('no translation')
    expect(prompt).toContain('[NO_SPEECH]')
  })

  it('英語は英字限定で、余計な説明を禁止する', () => {
    const prompt = buildTranscribePrompt('en')
    expect(prompt).toContain('English')
    expect(prompt).toContain('English letters only')
    expect(prompt).toContain('no commentary')
    expect(prompt).toContain('[NO_SPEECH]')
  })
})

describe('buildMixingCheckPrompt', () => {
  it('意図した日本語と学習者の発話を本文に含める', () => {
    const prompt = buildMixingCheckPrompt({
      lang: 'ko',
      personaName: '지민',
      intendedMeaningJa: '水を飲みます',
      learnerText: '물 마셔요',
    })

    expect(prompt).toContain('水を飲みます')
    expect(prompt).toContain('물 마셔요')
    expect(prompt).toContain('Korean')
  })

  it('文法や発音を評価せず、訂正語を使わない規則を含める', () => {
    const prompt = buildMixingCheckPrompt({
      lang: 'en',
      personaName: 'Alex',
      intendedMeaningJa: '食べ物を食べます',
      learnerText: 'I eat food',
    })

    expect(prompt).toContain('Do not evaluate grammar or pronunciation')
    expect(prompt).toContain('Never correct the learner')
    expect(prompt).toContain('"wrong", "mistake", or "incorrect"')
  })
})
