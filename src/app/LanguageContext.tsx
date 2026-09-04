import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'

export type TargetLanguage = 'en' | 'ko'

type LanguageContextValue = {
  language: TargetLanguage
  setLanguage: (language: TargetLanguage) => void
}

const STORAGE_KEY = 'lla.lang'
const LanguageContext = createContext<LanguageContextValue | null>(null)

function getInitialLanguage(): TargetLanguage {
  const saved = localStorage.getItem(STORAGE_KEY)
  return saved === 'ko' ? 'ko' : 'en'
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<TargetLanguage>(getInitialLanguage)

  const value = useMemo<LanguageContextValue>(() => ({
    language,
    setLanguage: (nextLanguage) => {
      localStorage.setItem(STORAGE_KEY, nextLanguage)
      setLanguageState(nextLanguage)
    },
  }), [language])

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
}

export function useLanguage() {
  const context = useContext(LanguageContext)

  if (!context) {
    throw new Error('useLanguage must be used within LanguageProvider')
  }

  return context
}
