import { describe, expect, it } from 'vitest'
import { validateWeek } from './schema'

describe('validateWeek', () => {
  it('正常な配列を返す', () => {
    const input = [{
      text: 'hello',
      emoji: '👋',
      category: 'toolbox',
      hint_ja: 'こんにちは',
      example: 'Hello, how are you?',
    }]

    expect(validateWeek(input, 'en/week1.json')).toEqual(input)
  })

  it('空配列を許可する', () => {
    expect(validateWeek([], 'en/week1.json')).toEqual([])
  })

  it('必須フィールドがない場合はlabel付きでthrowする', () => {
    const input = [{
      text: 'hello',
      emoji: '👋',
      category: 'toolbox',
      hint_ja: 'こんにちは',
    }]

    expect(() => validateWeek(input, 'en/week2.json')).toThrow(/en\/week2\.json.*example/)
  })

  it('不正なcategoryの場合はlabel付きでthrowする', () => {
    const input = [{
      text: 'hello',
      emoji: '👋',
      category: 'unknown',
      hint_ja: 'こんにちは',
      example: 'Hello!',
    }]

    expect(() => validateWeek(input, 'en/week3.json')).toThrow(/en\/week3\.json.*category.*不正/)
  })

  it('配列でない場合はlabel付きでthrowする', () => {
    expect(() => validateWeek({}, 'ko/week1.json')).toThrow(/ko\/week1\.json.*配列/)
  })
})
