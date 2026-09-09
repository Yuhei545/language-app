import { describe, expect, it } from 'vitest'
import { loadTwoWord, questionsOfLevel, stripOptional, wordCount } from './twoWordSchema'

const set = loadTwoWord()

describe('2 語トレの読み込み', () => {
  it('コア動詞 25 語と、2〜4 語の問題を持つ', () => {
    expect(set.verbs).toHaveLength(25)
    expect(new Set(set.verbs.map((verb) => verb.text)).size).toBe(25)
    expect(questionsOfLevel(set, 2).length).toBeGreaterThanOrEqual(50)
    expect(questionsOfLevel(set, 3).length).toBeGreaterThanOrEqual(20)
    expect(questionsOfLevel(set, 4).length).toBeGreaterThanOrEqual(15)
  })

  it('id は重複せず、解答例を必ず持つ', () => {
    expect(new Set(set.questions.map((question) => question.id)).size).toBe(set.questions.length)
    expect(set.questions.every((question) => question.answers.length > 0)).toBe(true)
  })

  it('場面設定の問題は相手の発話と、複数の解答例を持つ', () => {
    const scenes = set.questions.filter((question) => question.kind === 'scene')
    expect(scenes.length).toBeGreaterThanOrEqual(10)
    for (const scene of scenes) {
      expect(scene.prompt, `${scene.id} に相手の発話がありません`).toBeTruthy()
      expect(scene.promptJa).toBeTruthy()
      expect(scene.answers.length, `${scene.id} の解答例が 1 つしかありません`).toBeGreaterThanOrEqual(3)
    }
  })

  it('基礎の 2 語は括弧を外すと 2 語。場面設定は前置詞などを足してもよい(短く返す)', () => {
    for (const question of questionsOfLevel(set, 2)) {
      // 場面設定は「必要に応じて前置詞などを入れて 2 語以上になってもよい」(教材の方針)
      const limit = question.kind === 'scene' ? 5 : 2
      for (const answer of question.answers) {
        expect(wordCount(answer), `${question.id}: 「${answer}」が ${limit} 語を超えています`).toBeLessThanOrEqual(limit)
      }
    }
  })

  it('3 語・4 語の問題は語数が増えている', () => {
    for (const question of questionsOfLevel(set, 3)) {
      expect(wordCount(question.answers[0]), `${question.id}`).toBeGreaterThanOrEqual(2)
    }
    for (const question of questionsOfLevel(set, 4)) {
      expect(wordCount(question.answers[0]), `${question.id}`).toBeGreaterThanOrEqual(3)
    }
  })
})

describe('括弧の扱い', () => {
  it('括弧の中は数えない(冠詞や三単現は気にしない)', () => {
    expect(stripOptional('keep (the) change')).toBe('keep change')
    expect(wordCount('keep (the) change')).toBe(2)
    expect(wordCount('My teacher brought lunch (at) noon')).toBe(5)
    expect(stripOptional('(The) reporter told (us the) news')).toBe('reporter told news')
  })
})
