import enCoreJson from './en/core.json'
import koCoreJson from './ko/core.json'

export type CoreWord = {
  text: string
  emoji: string
  hint_ja: string
}

export type CoreVerb = CoreWord & {
  takes: 'place' | 'thing' | 'person' | 'none'
}

export type CoreNoun = CoreWord & {
  kind: 'thing' | 'place' | 'person' | 'time' | 'media'
}

export type CoreAdjective = CoreWord

export type CorePhrasal = CoreWord & {
  takes: 'thing' | 'none' | 'media'
}

/** 型の使い方を見せる例文。 */
export type CoreExample = {
  text: string
  ja: string
}

export type CoreFrame = {
  id: string
  level: 1 | 2 | 3
  pattern: string
  slots: string[]
  hint_ja: string
  /** 型の短い解説(日本語)。練習に入る前に見せる。 */
  note_ja: string
  /** 完成した文の見本。2 つ以上。 */
  examples: CoreExample[]
}

export type CoreVocab = {
  version: 1
  verbs: CoreVerb[]
  nouns: CoreNoun[]
  adjectives: CoreAdjective[]
  phrasal: CorePhrasal[]
  frames: CoreFrame[]
}

type UnknownRecord = Record<string, unknown>

const VERB_TAKES = new Set(['place', 'thing', 'person', 'none'])
const NOUN_KINDS = new Set(['thing', 'place', 'person', 'time', 'media'])
const PHRASAL_TAKES = new Set(['thing', 'none', 'media'])
const SLOT_PATTERN = /^(?:verb:(?:place|thing|person|none)|noun:(?:thing|place|person|time|media)|adj|phrasal:(?:thing|none|media))$/

function fail(label: string, path: string, reason: string): never {
  throw new Error(`${label}: ${path} ${reason}`)
}

function requireRecord(value: unknown, label: string, path: string): UnknownRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    fail(label, path, 'はobjectではありません')
  }

  return value as UnknownRecord
}

function requireString(
  record: UnknownRecord,
  key: string,
  label: string,
  path: string,
): string {
  const value = record[key]
  if (typeof value !== 'string') {
    fail(label, `${path}.${key}`, 'は必須のstringです')
  }

  return value
}

function validateWord(value: unknown, label: string, path: string): CoreWord {
  const record = requireRecord(value, label, path)
  return {
    text: requireString(record, 'text', label, path),
    emoji: requireString(record, 'emoji', label, path),
    hint_ja: requireString(record, 'hint_ja', label, path),
  }
}

function requireArray(record: UnknownRecord, key: string, label: string): unknown[] {
  const value = record[key]
  if (!Array.isArray(value)) {
    fail(label, key, 'は配列ではありません')
  }

  return value
}

function validateFrame(value: unknown, label: string, index: number): CoreFrame {
  const path = `frames[${index}]`
  const record = requireRecord(value, label, path)
  const id = requireString(record, 'id', label, path)
  const pattern = requireString(record, 'pattern', label, path)
  const hintJa = requireString(record, 'hint_ja', label, path)
  const level = record.level

  if (level !== 1 && level !== 2 && level !== 3) {
    fail(label, `${path}.level`, 'は1、2、3のいずれかである必要があります')
  }

  if (!Array.isArray(record.slots)) {
    fail(label, `${path}.slots`, 'は配列ではありません')
  }

  const slots = record.slots.map((slot, slotIndex) => {
    if (typeof slot !== 'string') {
      fail(label, `${path}.slots[${slotIndex}]`, 'はstringではありません')
    }
    if (!SLOT_PATTERN.test(slot)) {
      fail(label, `${path}.slots[${slotIndex}]`, `に不正なスロットがあります: ${slot}`)
    }
    return slot
  })
  const patternTokens = Array.from(
    pattern.matchAll(/\{([^{}]+)\}/g),
    (match) => match[1],
  )

  if (
    slots.length !== patternTokens.length
    || slots.some((slot, slotIndex) => slot !== patternTokens[slotIndex])
  ) {
    fail(label, path, 'のslotsとpattern内のトークンが一致しません')
  }

  for (const match of hintJa.matchAll(/\{(\d+)\}/g)) {
    const slotNumber = Number(match[1])
    if (slotNumber < 1 || slotNumber > slots.length) {
      fail(label, `${path}.hint_ja`, `の{${slotNumber}}がスロット数を超えています`)
    }
  }

  const noteJa = requireString(record, 'note_ja', label, path)
  if (!Array.isArray(record.examples) || record.examples.length < 2) {
    fail(label, `${path}.examples`, 'は2つ以上の配列である必要があります')
  }
  const examples = record.examples.map((value, exampleIndex): CoreExample => {
    const examplePath = `${path}.examples[${exampleIndex}]`
    const example = requireRecord(value, label, examplePath)
    return {
      text: requireString(example, 'text', label, examplePath),
      ja: requireString(example, 'ja', label, examplePath),
    }
  })

  return { id, level, pattern, slots, hint_ja: hintJa, note_ja: noteJa, examples }
}

export function validateCore(json: unknown, label: string): CoreVocab {
  const record = requireRecord(json, label, 'root')
  if (record.version !== 1) {
    fail(label, 'version', 'は1である必要があります')
  }

  const verbs = requireArray(record, 'verbs', label).map((value, index): CoreVerb => {
    const path = `verbs[${index}]`
    const source = requireRecord(value, label, path)
    const word = validateWord(source, label, path)
    if (typeof source.takes !== 'string' || !VERB_TAKES.has(source.takes)) {
      fail(label, `${path}.takes`, `が不正です: ${String(source.takes)}`)
    }
    return { ...word, takes: source.takes as CoreVerb['takes'] }
  })

  const nouns = requireArray(record, 'nouns', label).map((value, index): CoreNoun => {
    const path = `nouns[${index}]`
    const source = requireRecord(value, label, path)
    const word = validateWord(source, label, path)
    if (typeof source.kind !== 'string' || !NOUN_KINDS.has(source.kind)) {
      fail(label, `${path}.kind`, `が不正です: ${String(source.kind)}`)
    }
    return { ...word, kind: source.kind as CoreNoun['kind'] }
  })

  const adjectives = requireArray(record, 'adjectives', label).map(
    (value, index) => validateWord(value, label, `adjectives[${index}]`),
  )

  const phrasal = requireArray(record, 'phrasal', label).map((value, index): CorePhrasal => {
    const path = `phrasal[${index}]`
    const source = requireRecord(value, label, path)
    const word = validateWord(source, label, path)
    if (typeof source.takes !== 'string' || !PHRASAL_TAKES.has(source.takes)) {
      fail(label, `${path}.takes`, `が不正です: ${String(source.takes)}`)
    }
    return { ...word, takes: source.takes as CorePhrasal['takes'] }
  })

  const frames = requireArray(record, 'frames', label).map(
    (value, index) => validateFrame(value, label, index),
  )

  return { version: 1, verbs, nouns, adjectives, phrasal, frames }
}

export function loadCore(lang: 'en' | 'ko'): CoreVocab {
  return lang === 'en'
    ? validateCore(enCoreJson, 'en/core.json')
    : validateCore(koCoreJson, 'ko/core.json')
}
