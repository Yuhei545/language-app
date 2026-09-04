const DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1000

type DateParts = {
  year: number
  month: number
  day: number
}

function parseDateOnly(value: string): DateParts {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
  if (!match) {
    throw new Error(`日付の形式が正しくありません: ${value}`)
  }

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(year, month - 1, day)

  if (
    date.getFullYear() !== year
    || date.getMonth() !== month - 1
    || date.getDate() !== day
  ) {
    throw new Error(`存在しない日付です: ${value}`)
  }

  return { year, month, day }
}

function serialDay(parts: DateParts): number {
  return Date.UTC(parts.year, parts.month - 1, parts.day) / DAY_IN_MILLISECONDS
}

function serialLocalDate(date: Date): number {
  return serialDay({
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    day: date.getDate(),
  })
}

function daysSince(startedAt: string, now: Date): number {
  return serialLocalDate(now) - serialDay(parseDateOnly(startedAt))
}

export function weekNumberFor(startedAt: string, now: Date): number {
  const elapsedDays = Math.max(0, daysSince(startedAt, now))
  return Math.min(26, Math.floor(elapsedDays / 7) + 1)
}

export function dayInWeek(startedAt: string, now: Date): number {
  const elapsedDays = Math.max(0, daysSince(startedAt, now))
  return (elapsedDays % 7) + 1
}

export function updateStreak(
  current: { streak: number; last_active_date: string | null },
  today: string,
): { streak: number; last_active_date: string } {
  const todaySerial = serialDay(parseDateOnly(today))

  if (current.last_active_date === null) {
    return { streak: 1, last_active_date: today }
  }

  const elapsedDays = todaySerial - serialDay(parseDateOnly(current.last_active_date))
  if (elapsedDays === 0) {
    return { streak: current.streak, last_active_date: today }
  }

  return {
    streak: elapsedDays === 1 ? current.streak + 1 : 1,
    last_active_date: today,
  }
}

export function daysUntil(eventDate: string, now: Date): number {
  return serialDay(parseDateOnly(eventDate)) - serialLocalDate(now)
}
