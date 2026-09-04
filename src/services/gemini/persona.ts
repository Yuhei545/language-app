export type Lang = 'en' | 'ko'

export type Persona = {
  name: string
  city: string
  likes: string[]
}

const personas: Record<Lang, Persona> = {
  en: { name: 'Alex', city: 'London', likes: ['coffee', 'football'] },
  ko: { name: '지민', city: '서울', likes: ['카페', '산책'] },
}

export function getPersona(lang: Lang, customName: string): Persona {
  const persona = personas[lang]
  return {
    ...persona,
    name: customName.trim() || persona.name,
    likes: [...persona.likes],
  }
}
