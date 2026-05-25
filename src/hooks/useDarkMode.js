import { useState, useEffect } from 'react'

const KEY = 'snapstock_theme'

/**
 * Persiste y aplica el modo oscuro toggling la clase 'dark' en <html>.
 * Lee la preferencia del usuario desde localStorage; si no existe, usa
 * prefers-color-scheme del navegador como default.
 */
export function useDarkMode() {
  const [dark, setDark] = useState(() => {
    const saved = localStorage.getItem(KEY)
    if (saved !== null) return saved === 'dark'
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  })

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    localStorage.setItem(KEY, dark ? 'dark' : 'light')
  }, [dark])

  const toggle = () => setDark(d => !d)

  return { dark, toggle }
}
