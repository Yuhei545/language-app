function suffixesFromStarts(answer: string, starts: number[]): string[] {
  if (starts.length < 3) {
    return [answer]
  }

  const result: string[] = []
  for (let count = 1; count < starts.length; count += 1) {
    result.push(answer.slice(starts[starts.length - count]))
  }
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
