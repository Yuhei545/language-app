import { describe, expect, it } from 'vitest'
import { isMatch, levenshtein, normalizeText, similarity } from './normalize'

describe('normalizeText', () => {
  it('英字を小文字化して句読点と記号を除去する', () => {
    expect(normalizeText('Hello, WORLD! "Nice."', 'en')).toBe('hello world nice')
  })

  it('全角ASCIIと全角空白を半角へ揃える', () => {
    expect(normalizeText('ＨＥＬＬＯ！　ＷＯＲＬＤ', 'en')).toBe('hello world')
  })

  it('連続する空白を1つにして前後を除去する', () => {
    expect(normalizeText('  hello\t\n  world  ', 'en')).toBe('hello world')
  })

  it('韓国語のNFD文字列をNFCへ正規化する', () => {
    const nfd = '한글'.normalize('NFD')
    expect(normalizeText(nfd, 'ko')).toBe('한글')
  })
})

describe('levenshtein', () => {
  it('編集距離を返す', () => {
    expect(levenshtein('kitten', 'sitting')).toBe(3)
  })
})

describe('similarity', () => {
  it('同一文字列と両方空のときは1を返す', () => {
    expect(similarity('Hello!', 'hello', 'en')).toBe(1)
    expect(similarity('', '', 'en')).toBe(1)
  })

  it('完全に異なる文字列と片方だけ空のときは0を返す', () => {
    expect(similarity('abc', 'xyz', 'en')).toBe(0)
    expect(similarity('hello', '', 'en')).toBe(0)
  })
})

describe('isMatch', () => {
  it('しきい値以上の類似度だけ一致と判定する', () => {
    expect(isMatch('hello', 'hallo', 'en')).toBe(true)
    expect(isMatch('hello', 'hallo', 'en', 0.81)).toBe(false)
  })
})
