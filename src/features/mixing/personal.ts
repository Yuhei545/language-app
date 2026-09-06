import type { CoreNoun, CoreVocab } from '../../content/coreSchema'
import type { Topic, TopicUse } from '../../content/topicsSchema'
import type { PersonalWord, PersonalWordKind } from '../../services/settings'

export const PERSONAL_EMOJI: Record<PersonalWordKind, string> = {
  place: '📍',
  person: '👤',
  thing: '📦',
  media: '🎬',
}

function randomIndex(length: number, rng: () => number): number {
  const value = Math.min(Math.max(rng(), 0), 1 - Number.EPSILON)
  return Math.floor(value * length)
}

export function withPersonalWords(
  core: CoreVocab,
  words: PersonalWord[],
  lang: 'en' | 'ko',
): CoreVocab {
  const texts = new Set(core.nouns.map((noun) => noun.text))
  const personalNouns: CoreNoun[] = []

  words.forEach((word) => {
    const text = word[lang]
    if (text.trim() === '' || texts.has(text)) {
      return
    }

    texts.add(text)
    personalNouns.push({
      text,
      emoji: PERSONAL_EMOJI[word.kind],
      hint_ja: word.ja,
      kind: word.kind,
    })
  })

  return {
    ...core,
    nouns: [...core.nouns, ...personalNouns],
  }
}

export function fillTopic(
  topic: Topic,
  words: PersonalWord[],
  core: CoreVocab,
  lang: 'en' | 'ko',
  rng: () => number = Math.random,
): { text: string; used: string[] } {
  const used: string[] = []
  const text = topic.ja.replace(/\{(place|person|thing|media)\}/g, (_match, kind: TopicUse) => {
    const personalCandidates = words.filter((word) => word.kind === kind)
    const coreCandidates = core.nouns.filter((noun) => noun.kind === kind)
    const candidates = personalCandidates.length > 0
      ? personalCandidates.map((word) => word.ja)
      : coreCandidates.map((word) => word.hint_ja)

    if (candidates.length === 0) {
      throw new Error(`${lang} のお題 ${topic.id} に使える ${kind} の語がありません`)
    }

    const selected = candidates[randomIndex(candidates.length, rng)]
    used.push(selected)
    return selected
  })

  return { text, used }
}
