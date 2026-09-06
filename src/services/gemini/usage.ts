/**
 * Gemini の呼び出し回数を数える。無料枠は「1 分あたり」と「1 日あたり」で別々に上限があるため、
 * どちらに当たっているのかを推測せず、実際の回数を見て判断できるようにする。
 */
const STORAGE_KEY = 'lla.gemini.usage'
const MINUTE_MS = 60_000

type StoredUsage = {
  /** ローカル時刻の YYYY-MM-DD。日付が変わったら 0 に戻す。 */
  date: string
  count: number
  /** 直近の呼び出し時刻(ミリ秒)。1 分より古いものは捨てる。 */
  recent: number[]
}

export type GeminiUsage = {
  today: number
  lastMinute: number
}

function todayKey(now: number): string {
  const date = new Date(now)
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

function read(now: number): StoredUsage {
  const empty: StoredUsage = { date: todayKey(now), count: 0, recent: [] }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      return empty
    }
    const parsed = JSON.parse(raw) as unknown
    if (
      typeof parsed !== 'object' || parsed === null
      || typeof (parsed as StoredUsage).date !== 'string'
      || typeof (parsed as StoredUsage).count !== 'number'
      || !Array.isArray((parsed as StoredUsage).recent)
    ) {
      return empty
    }
    const stored = parsed as StoredUsage
    if (stored.date !== todayKey(now)) {
      return empty
    }
    return {
      date: stored.date,
      count: stored.count,
      recent: stored.recent.filter((time) => typeof time === 'number' && now - time < MINUTE_MS),
    }
  } catch (error) {
    console.error('Gemini の利用回数を読み込めませんでした', error)
    return empty
  }
}

function write(usage: StoredUsage): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(usage))
  } catch (error) {
    console.error('Gemini の利用回数を保存できませんでした', error)
  }
}

export function recordGeminiRequest(now: number = Date.now()): void {
  const usage = read(now)
  write({
    date: usage.date,
    count: usage.count + 1,
    recent: [...usage.recent, now],
  })
}

export function getGeminiUsage(now: number = Date.now()): GeminiUsage {
  const usage = read(now)
  return { today: usage.count, lastMinute: usage.recent.length }
}

export function resetGeminiUsage(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch (error) {
    console.error('Gemini の利用回数を消せませんでした', error)
  }
}
