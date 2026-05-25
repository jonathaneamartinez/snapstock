import { createContext, useContext, useState } from 'react'
import es from './es'
import en from './en'

const TRANSLATIONS = { es, en }
const KEY = 'snapstock_lang'

const I18nContext = createContext({ t: k => k, lang: 'es', setLang: () => {} })

export function I18nProvider({ children }) {
  const [lang, setLangState] = useState(() => {
    const saved = localStorage.getItem(KEY)
    if (saved === 'en' || saved === 'es') return saved
    return navigator.language?.startsWith('en') ? 'en' : 'es'
  })

  const setLang = (l) => {
    setLangState(l)
    localStorage.setItem(KEY, l)
  }

  const t = (key) => TRANSLATIONS[lang]?.[key] ?? TRANSLATIONS.es?.[key] ?? key

  return (
    <I18nContext.Provider value={{ t, lang, setLang }}>
      {children}
    </I18nContext.Provider>
  )
}

export function useI18n() {
  return useContext(I18nContext)
}
