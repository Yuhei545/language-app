/** 同梱 JSON を読むときの共通の検証。壊れた内容は起動時に throw で気づけるようにする。 */
export type UnknownRecord = Record<string, unknown>

export function fail(label: string, path: string, reason: string): never {
  throw new Error(`${label}: ${path} ${reason}`)
}

export function requireRecord(value: unknown, label: string, path: string): UnknownRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    fail(label, path, 'はobjectではありません')
  }
  return value as UnknownRecord
}

export function requireString(record: UnknownRecord, key: string, label: string, path: string): string {
  const value = record[key]
  if (typeof value !== 'string') {
    fail(label, `${path}.${key}`, 'は必須のstringです')
  }
  return value
}

export function requireNonEmptyString(record: UnknownRecord, key: string, label: string, path: string): string {
  const value = requireString(record, key, label, path)
  if (value.trim().length === 0) {
    fail(label, `${path}.${key}`, 'が空です')
  }
  return value
}

export function requireArray(record: UnknownRecord, key: string, label: string, path: string): unknown[] {
  const value = record[key]
  if (!Array.isArray(value)) {
    fail(label, `${path}.${key}`, 'は配列ではありません')
  }
  return value
}

export function requireInteger(record: UnknownRecord, key: string, label: string, path: string): number {
  const value = record[key]
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    fail(label, `${path}.${key}`, 'は整数である必要があります')
  }
  return value
}
