import enDictationJson from './en/dictation.json'
import koDictationJson from './ko/dictation.json'

export type DictationSentence = {
  id: string
  text: string
  focus: string[]
}

const ID_PATTERN = /^(en|ko)-\d{3}$/

function fail(label: string, path: string, reason: string): never {
  throw new Error(`${label}: ${path} ${reason}`)
}

export function validateDictation(json: unknown, label: string): DictationSentence[] {
  if (!Array.isArray(json)) {
    fail(label, 'root', 'は配列である必要があります')
  }

  const ids = new Set<string>()

  return json.map((value, index) => {
    const path = `[${index}]`
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      fail(label, path, 'はobjectである必要があります')
    }

    const record = value as Record<string, unknown>
    if (typeof record.id !== 'string' || !ID_PATTERN.test(record.id)) {
      fail(label, `${path}.id`, 'は en-001 または ko-001 形式である必要があります')
    }
    if (ids.has(record.id)) {
      fail(label, `${path}.id`, `が重複しています: ${record.id}`)
    }
    if (typeof record.text !== 'string' || record.text.trim() === '') {
      fail(label, `${path}.text`, 'は空でない文字列である必要があります')
    }
    if (!Array.isArray(record.focus) || record.focus.length === 0) {
      fail(label, `${path}.focus`, 'は1件以上の文字列を持つ配列である必要があります')
    }

    const focus = record.focus.map((item, focusIndex) => {
      if (typeof item !== 'string' || item.trim() === '') {
        fail(label, `${path}.focus[${focusIndex}]`, 'は空でない文字列である必要があります')
      }
      return item
    })

    ids.add(record.id)
    return { id: record.id, text: record.text, focus }
  })
}

export function loadDictation(lang: 'en' | 'ko'): DictationSentence[] {
  return lang === 'en'
    ? validateDictation(enDictationJson, 'en/dictation.json')
    : validateDictation(koDictationJson, 'ko/dictation.json')
}
