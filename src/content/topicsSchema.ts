import enTopicsJson from './en/topics.json'
import koTopicsJson from './ko/topics.json'

export type TopicUse = 'place' | 'person' | 'thing' | 'media'

export type Topic = {
  id: string
  level: 1 | 2 | 3
  ja: string
  uses: TopicUse[]
}

type UnknownRecord = Record<string, unknown>

const TOPIC_USES = new Set<TopicUse>(['place', 'person', 'thing', 'media'])

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

export function validateTopics(json: unknown, label: string): Topic[] {
  const record = requireRecord(json, label, 'root')
  if (record.version !== 1) {
    fail(label, 'version', 'は1である必要があります')
  }
  if (!Array.isArray(record.topics)) {
    fail(label, 'topics', 'は配列ではありません')
  }

  const ids = new Set<string>()
  return record.topics.map((value, index) => {
    const path = `topics[${index}]`
    const topic = requireRecord(value, label, path)
    const id = requireString(topic, 'id', label, path)
    const ja = requireString(topic, 'ja', label, path)

    if (ids.has(id)) {
      fail(label, `${path}.id`, `が重複しています: ${id}`)
    }
    ids.add(id)

    if (topic.level !== 1 && topic.level !== 2 && topic.level !== 3) {
      fail(label, `${path}.level`, 'は1、2、3のいずれかである必要があります')
    }
    if (!Array.isArray(topic.uses)) {
      fail(label, `${path}.uses`, 'は配列ではありません')
    }

    const uses = topic.uses.map((use, useIndex): TopicUse => {
      if (typeof use !== 'string' || !TOPIC_USES.has(use as TopicUse)) {
        fail(label, `${path}.uses[${useIndex}]`, `が不正です: ${String(use)}`)
      }
      return use as TopicUse
    })
    const placeholders = Array.from(
      ja.matchAll(/\{([^{}]+)\}/g),
      (match) => match[1],
    )

    if (
      placeholders.length !== uses.length
      || placeholders.some((placeholder, useIndex) => placeholder !== uses[useIndex])
    ) {
      fail(label, path, 'のusesとja内のプレースホルダが一致しません')
    }

    return { id, level: topic.level, ja, uses }
  })
}

export function loadTopics(lang: 'en' | 'ko'): Topic[] {
  return lang === 'en'
    ? validateTopics(enTopicsJson, 'en/topics.json')
    : validateTopics(koTopicsJson, 'ko/topics.json')
}
