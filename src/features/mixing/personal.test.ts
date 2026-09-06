import { describe, expect, it } from 'vitest'
import type { CoreVocab } from '../../content/coreSchema'
import type { Topic } from '../../content/topicsSchema'
import type { PersonalWord } from '../../services/settings'
import { fillTopic, PERSONAL_EMOJI, withPersonalWords } from './personal'

function core(): CoreVocab {
  return {
    version: 1,
    verbs: [],
    adjectives: [],
    phrasal: [],
    frames: [],
    nouns: [
      { text: 'station', emoji: '🚉', hint_ja: '駅', kind: 'place' },
      { text: 'book', emoji: '📕', hint_ja: '本', kind: 'thing' },
    ],
  }
}

const words: PersonalWord[] = [
  { ja: '浅草', en: 'Asakusa', ko: '아사쿠사', kind: 'place' },
  { ja: '推し', en: 'my favorite artist', ko: '', kind: 'person' },
  { ja: '既存の駅', en: 'station', ko: '역', kind: 'place' },
]

describe('withPersonalWords', () => {
  it('対象言語の語を種類別絵文字付きで nouns に追加する', () => {
    const result = withPersonalWords(core(), words, 'en')

    expect(result.nouns).toContainEqual({
      text: 'Asakusa',
      emoji: PERSONAL_EMOJI.place,
      hint_ja: '浅草',
      kind: 'place',
    })
    expect(result.nouns).toContainEqual({
      text: 'my favorite artist',
      emoji: PERSONAL_EMOJI.person,
      hint_ja: '推し',
      kind: 'person',
    })
  })

  it('対象言語が空の語と同じ text の語は追加しない', () => {
    const result = withPersonalWords(core(), words, 'ko')

    expect(result.nouns.some((noun) => noun.hint_ja === '推し')).toBe(false)
    expect(withPersonalWords(core(), words, 'en').nouns.filter((noun) => noun.text === 'station'))
      .toHaveLength(1)
  })

  it('元の core を変更しない', () => {
    const original = core()
    const originalNouns = [...original.nouns]

    const result = withPersonalWords(original, words, 'en')

    expect(original.nouns).toEqual(originalNouns)
    expect(result).not.toBe(original)
    expect(result.nouns).not.toBe(original.nouns)
  })
})

describe('fillTopic', () => {
  const topic: Topic = {
    id: 'place-and-thing',
    level: 1,
    ja: '{place}で{thing}について話してください',
    uses: ['place', 'thing'],
  }

  it('種類が一致する自分の語を core より優先して穴埋めする', () => {
    const result = fillTopic(topic, words, core(), 'en', () => 0)

    expect(result).toEqual({
      text: '浅草で本について話してください',
      used: ['浅草', '本'],
    })
  })

  it('自分の語がなければ core の同じ kind から選ぶ', () => {
    expect(fillTopic(topic, [], core(), 'ko', () => 0)).toEqual({
      text: '駅で本について話してください',
      used: ['駅', '本'],
    })
  })

  it('一致する語がどちらにもなければ例外にする', () => {
    const mediaTopic: Topic = {
      id: 'media',
      level: 1,
      ja: '{media}について話してください',
      uses: ['media'],
    }

    expect(() => fillTopic(mediaTopic, [], core(), 'en', () => 0))
      .toThrow(/media.*語がありません/)
  })
})
