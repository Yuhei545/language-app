import type { CoreVocab, CoreWord } from '../../content/coreSchema'

export function slotPool(core: CoreVocab, slot: string): CoreWord[] {
  if (slot === 'adj') {
    return core.adjectives
  }

  const [type, subtype] = slot.split(':')
  if (type === 'verb') {
    return core.verbs.filter((word) => word.takes === subtype)
  }
  if (type === 'noun') {
    return core.nouns.filter((word) => word.kind === subtype)
  }
  if (type === 'phrasal') {
    return core.phrasal.filter((word) => word.takes === subtype)
  }

  return []
}

export function countCombinations(core: CoreVocab): number {
  return core.frames.reduce((total, frame) => (
    total + frame.slots.reduce(
      (frameTotal, slot) => frameTotal * slotPool(core, slot).length,
      1,
    )
  ), 0)
}

export function wordCount(core: CoreVocab): number {
  return core.verbs.length
    + core.nouns.length
    + core.adjectives.length
    + core.phrasal.length
}
