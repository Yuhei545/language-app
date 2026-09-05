/** 末尾からの部分は最大 3 段。1 語(1 音節)ずつ増やすと長い文で十数回の繰り返しになるため間引く。 */
export const MAX_BACK_CHAIN_PARTIALS = 3

/** 部分に含める単位数(末尾から数える)を、少なければ 1 ずつ、多ければ 3 段に間引いて返す。 */
function partialUnitCounts(unitCount: number): number[] {
  const partials = unitCount - 1
  if (partials <= MAX_BACK_CHAIN_PARTIALS) {
    return Array.from({ length: partials }, (_, index) => index + 1)
  }
  const counts: number[] = []
  for (let step = 1; step <= MAX_BACK_CHAIN_PARTIALS; step += 1) {
    const target = Math.round((unitCount * step) / (MAX_BACK_CHAIN_PARTIALS + 1))
    const previous = counts[counts.length - 1] ?? 0
    counts.push(Math.min(unitCount - 1, Math.max(previous + 1, target)))
  }
  return Array.from(new Set(counts))
}

function suffixesFromStarts(answer: string, starts: number[]): string[] {
  if (starts.length < 3) {
    return [answer]
  }

  const result = partialUnitCounts(starts.length)
    .map((count) => answer.slice(starts[starts.length - count]))
  result.push(answer)
  return result
}

export function backChainSteps(answer: string, lang: 'en' | 'ko'): string[] {
  if (lang === 'en') {
    const starts = Array.from(answer.matchAll(/\S+/g), (match) => match.index)
    return suffixesFromStarts(answer, starts)
  }

  const starts: number[] = []
  for (let index = 0; index < answer.length; index += 1) {
    const code = answer.charCodeAt(index)
    if (code >= 0xAC00 && code <= 0xD7A3) {
      starts.push(index)
    }
  }
  return suffixesFromStarts(answer, starts)
}
