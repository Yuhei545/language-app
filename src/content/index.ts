import enWeek1 from './en/week1.json'
import enWeek2 from './en/week2.json'
import enWeek3 from './en/week3.json'
import enWeek4 from './en/week4.json'
import koWeek1 from './ko/week1.json'
import koWeek2 from './ko/week2.json'
import koWeek3 from './ko/week3.json'
import koWeek4 from './ko/week4.json'
import { validateWeek, type BundledVocab } from './schema'

const bundledWeeks = {
  en: [enWeek1, enWeek2, enWeek3, enWeek4],
  ko: [koWeek1, koWeek2, koWeek3, koWeek4],
} as const

export function loadBundledWeeks(
  lang: 'en' | 'ko',
): { week: number; items: BundledVocab[] }[] {
  return bundledWeeks[lang].map((json, index) => {
    const week = index + 1
    return {
      week,
      items: validateWeek(json, `${lang}/week${week}.json`),
    }
  })
}
