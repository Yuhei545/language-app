import { describe, expect, it } from 'vitest'
import {
  buildDialoguePrompt,
  buildMixingCheckPrompt,
  buildParentSystemPrompt,
  buildQuickJudgePrompt,
  buildQuickQuestionsPrompt,
  buildTopicCheckPrompt,
  buildTranscribePrompt,
  buildTranslatePersonalWordPrompt,
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

describe('buildTopicCheckPrompt', () => {
  it('お題・学習者の発話・意味だけを判定する指示を含む', () => {
    const prompt = buildTopicCheckPrompt({
      lang: 'ko',
      personaName: '지민',
      topicJa: '週末の予定を2文で言ってください',
      learnerText: '주말에 친구를 만나요',
    })

    expect(prompt).toContain('週末の予定を2文で言ってください')
    expect(prompt).toContain('주말에 친구를 만나요')
    expect(prompt).toContain('Do not evaluate grammar or pronunciation')
    expect(prompt).toContain('"wrong", a "mistake", or "incorrect"')
    expect(prompt).toContain('information the learner has not said yet')
  })

  it('2ターン目は前の質問と答えを含む', () => {
    const prompt = buildTopicCheckPrompt({
      lang: 'en',
      personaName: 'Alex',
      topicJa: '好きな場所について話してください',
      learnerText: 'On Sundays.',
      previousTurn: {
        question: 'When do you go there?',
        answer: 'I like Asakusa.',
      },
    })

    expect(prompt).toContain('This is the second turn')
    expect(prompt).toContain('When do you go there?')
    expect(prompt).toContain('I like Asakusa.')
  })
})

describe('buildQuickQuestionsPrompt', () => {
  it('指定件数・練習した型・自分の語・禁止語の指示を含む', () => {
    const prompt = buildQuickQuestionsPrompt({
      lang: 'en',
      frames: [{ pattern: 'Do you have {noun:thing}?', hint_ja: '{1}はありますか' }],
      personalWords: [{ text: 'Asakusa', kind: 'place' }],
      count: 6,
    })

    expect(prompt).toContain('exactly 6')
    expect(prompt).toContain('Do you have {noun:thing}?')
    expect(prompt).toContain('Asakusa (place)')
    expect(prompt).toContain('consecutive questions do not keep using the same pattern')
    expect(prompt).toContain('"wrong", "mistake", or "incorrect"')
    expect(prompt).not.toContain('Target expressions')
  })

  it('今日の狙いを渡すと、各質問に入れる指示を含む', () => {
    const prompt = buildQuickQuestionsPrompt({
      lang: 'en',
      frames: [],
      personalWords: [],
      targetExpressions: ['Could I get ___?', 'pick up'],
    })

    expect(prompt).toContain('Target expressions')
    expect(prompt).toContain('- Could I get ___?')
    expect(prompt).toContain('- pick up')
  })
})

describe('buildQuickJudgePrompt', () => {
  it('質問と答え、件数、順番維持、意味だけを判定する指示を含む', () => {
    const prompt = buildQuickJudgePrompt({
      lang: 'ko',
      items: [
        { q: '어디에 가요?', answer: '서울에 가요.' },
        { q: '뭐 먹어요?', answer: '김밥 먹어요.' },
      ],
    })

    expect(prompt).toContain('어디에 가요?')
    expect(prompt).toContain('서울에 가요.')
    expect(prompt).toContain('same order as the 2 input items')
    expect(prompt).toContain('Do not evaluate grammar or pronunciation')
    expect(prompt).toContain('"wrong", a "mistake", or "incorrect"')
  })
})

describe('buildTranslatePersonalWordPrompt', () => {
  it('日本語・種類・固有名詞の表記規則・禁止語の指示を含む', () => {
    const prompt = buildTranslatePersonalWordPrompt({ ja: '東京タワー', kind: 'place' })

    expect(prompt).toContain('東京タワー')
    expect(prompt).toContain('Kind: place')
    expect(prompt).toContain('proper noun')
    expect(prompt).toContain('romanization')
    expect(prompt).toContain('Hangul transcription')
    expect(prompt).toContain('"wrong", "mistake", or "incorrect"')
  })
})

describe('buildDialoguePrompt', () => {
  it('場面・既知語・英語レベルを本文に含める', () => {
    const prompt = buildDialoguePrompt({
      lang: 'en',
      sceneJa: 'ホテルでチェックインする',
      interests: ['travel'],
      knownWords: ['hello', 'room'],
      level: 'practical-b1',
    })

    expect(prompt).toContain('ホテルでチェックインする')
    expect(prompt).toContain('hello, room')
    expect(prompt).toContain('practical everyday English at CEFR B1')
    expect(prompt).not.toContain('Target expressions')
  })

  it('今日の狙いを渡すと、半分以上を台詞に入れる指示を含む', () => {
    const prompt = buildDialoguePrompt({
      lang: 'en',
      sceneJa: 'カフェで注文する',
      interests: [],
      knownWords: ['hello'],
      level: 'practical-b1',
      targetExpressions: ['Could I get ___?', 'pick up', 'to be honest'],
    })

    expect(prompt).toContain('10. Target expressions')
    expect(prompt).toContain('at least 2 of these')
    expect(prompt).toContain('- Could I get ___?')
    expect(prompt).toContain('- to be honest')
  })

  it('韓国語レベルと再試行時の問題を列挙する', () => {
    const prompt = buildDialoguePrompt({
      lang: 'ko',
      sceneJa: '友人と週末について話す',
      interests: ['friends'],
      knownWords: ['안녕하세요'],
      level: 'beginner',
      retryIssues: [
        { code: 'length', message: '各行を短くしてください' },
        { code: 'ratio', message: '既知語を増やしてください' },
      ],
    })

    expect(prompt).toContain('beginner Korean, polite -요 forms')
    expect(prompt).toContain('Your previous attempt had these problems:')
    expect(prompt).toContain('各行を短くしてください')
    expect(prompt).toContain('既知語を増やしてください')
  })

  it('既知語は先頭300語だけを列挙する', () => {
    const knownWords = Array.from({ length: 301 }, (_, index) => `known${String(index).padStart(3, '0')}`)
    const prompt = buildDialoguePrompt({
      lang: 'en',
      sceneJa: '友人と話す',
      interests: [],
      knownWords,
      level: 'practical-b1',
    })

    expect(prompt).toContain('known299')
    expect(prompt).not.toContain('known300')
  })
})
