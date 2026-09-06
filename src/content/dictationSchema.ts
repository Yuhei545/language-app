import { DICTATION_FEATURES, type DictationFeatureId } from './dictationFeatures'
import enDictationJson from './en/dictation.json'
import koDictationJson from './ko/dictation.json'

/** 文の中で音の現象が起きている箇所。span は text にそのまま含まれる語(句)。 */
export type DictationFeatureSpan = {
  id: DictationFeatureId
  span: string
}

export type DictationSentence = {
  id: string
  text: string
  focus: string[]
  /** 音の現象。無い文は全文書き取りだけに使う。 */
  features: DictationFeatureSpan[]
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
    const features: DictationFeatureSpan[] = []
    if (record.features !== undefined) {
      if (!Array.isArray(record.features)) {
        fail(label, `${path}.features`, 'は配列である必要があります')
      }
      const lang = record.id.slice(0, 2)
      const text = record.text
      record.features.forEach((value, featureIndex) => {
        const featurePath = `${path}.features[${featureIndex}]`
        if (typeof value !== 'object' || value === null || Array.isArray(value)) {
          fail(label, featurePath, 'はobjectである必要があります')
        }
        const item = value as Record<string, unknown>
        const feature = DICTATION_FEATURES.find((candidate) => candidate.id === item.id)
        if (!feature || feature.lang !== lang) {
          fail(label, `${featurePath}.id`, `は ${lang} の音の現象ではありません: ${String(item.id)}`)
        }
        if (typeof item.span !== 'string' || item.span.trim() === '') {
          fail(label, `${featurePath}.span`, 'は空でない文字列である必要があります')
        }
        if (!text.toLowerCase().includes(item.span.toLowerCase())) {
          fail(label, `${featurePath}.span`, `が本文に含まれていません: ${item.span}`)
        }
        features.push({ id: feature.id, span: item.span })
      })
    }

    return { id: record.id, text: record.text, focus, features }
  })
}

export function loadDictation(lang: 'en' | 'ko'): DictationSentence[] {
  return lang === 'en'
    ? validateDictation(enDictationJson, 'en/dictation.json')
    : validateDictation(koDictationJson, 'ko/dictation.json')
}
