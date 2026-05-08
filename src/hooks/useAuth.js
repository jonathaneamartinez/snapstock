import { useState, useCallback } from 'react'

const KEY = 'ss_auth'

function checkSession() {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return false
    const { ok, expiry } = JSON.parse(raw)
    if (!ok || Date.now() > expiry) {
      localStorage.removeItem(KEY)
      return false
    }
    return true
  } catch {
    return false
  }
}

export function useAuth() {
  const [authenticated, setAuthenticated] = useState(() => checkSession())

  const unlock = useCallback(() => setAuthenticated(true), [])

  const logout = useCallback(() => {
    localStorage.removeItem(KEY)
    setAuthenticated(false)
  }, [])

  return { authenticated, unlock, logout }
}
