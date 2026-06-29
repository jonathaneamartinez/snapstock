import { useState, useRef, useEffect } from 'react'
import { STORE_CONFIG } from '../../constants'

const LOGO = '⚡'
const APP_NAME = 'Snap Stock'
// Nombre de la tienda según el cliente (VITE_CLIENT_ID), no hardcodeado.
const STORE_NAME = STORE_CONFIG?.displayName || STORE_CONFIG?.name || ''

export default function LockScreen({ onUnlock }) {
  const [value,   setValue]   = useState('')
  const [error,   setError]   = useState(false)
  const [shake,   setShake]   = useState(false)
  const [loading, setLoading] = useState(false)
  const inputRef = useRef(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  const handleSubmit = async (e) => {
    e?.preventDefault()
    if (!value.trim()) return

    setLoading(true)
    // Pequeño delay para que no se vea instantáneo (UX)
    await new Promise(r => setTimeout(r, 350))

    const correct = import.meta.env.VITE_APP_PASS
    if (value.trim() === correct) {
      // Guardar sesión por 30 días
      const expiry = Date.now() + 30 * 24 * 60 * 60 * 1000
      localStorage.setItem('ss_auth', JSON.stringify({ ok: true, expiry }))
      onUnlock()
    } else {
      setLoading(false)
      setError(true)
      setShake(true)
      setValue('')
      setTimeout(() => setShake(false), 600)
      setTimeout(() => setError(false), 2500)
      inputRef.current?.focus()
    }
  }

  return (
    <div className="fixed inset-0 z-[9999] bg-gradient-to-br from-gray-950 via-gray-900 to-gray-800
                    flex items-center justify-center p-4">

      {/* Fondo decorativo */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full
                        bg-blue-600/10 blur-3xl" />
        <div className="absolute -bottom-24 -right-24 w-80 h-80 rounded-full
                        bg-violet-600/10 blur-3xl" />
      </div>

      {/* Card */}
      <div className={`relative w-full max-w-sm transition-all duration-150
                       ${shake ? 'translate-x-0' : ''}`}
           style={shake ? { animation: 'shake 0.5s ease' } : {}}>

        {/* Logo */}
        <div className="flex flex-col items-center mb-8 gap-3">
          <div className="w-16 h-16 rounded-2xl bg-blue-600 flex items-center justify-center
                          shadow-lg shadow-blue-500/30 text-3xl">
            {LOGO}
          </div>
          <div className="text-center">
            <h1 className="text-white text-2xl font-extrabold tracking-tight">{APP_NAME}</h1>
            {STORE_NAME && <p className="text-white/40 text-sm mt-0.5">{STORE_NAME}</p>}
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="relative">
            <input
              ref={inputRef}
              type="password"
              value={value}
              onChange={e => { setValue(e.target.value); setError(false) }}
              placeholder="Contraseña"
              autoComplete="current-password"
              className={`w-full px-4 py-3.5 rounded-2xl text-sm font-medium
                         bg-white/8 border text-white placeholder:text-white/25
                         focus:outline-none focus:ring-2 transition-all
                         ${error
                           ? 'border-red-500/60 bg-red-500/8 focus:ring-red-500/30'
                           : 'border-white/10 focus:ring-blue-500/40 focus:border-blue-500/40'}`}
            />
            {error && (
              <p className="absolute -bottom-5 left-1 text-[11px] text-red-400 font-medium">
                Contraseña incorrecta
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={loading || !value.trim()}
            className="w-full py-3.5 mt-6 rounded-2xl bg-blue-600 hover:bg-blue-500
                       text-white text-sm font-bold transition-all
                       disabled:opacity-40 disabled:cursor-not-allowed
                       active:scale-[.98] shadow-lg shadow-blue-600/20"
          >
            {loading
              ? <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white
                                   rounded-full animate-spin" />
                  Verificando…
                </span>
              : 'Ingresar →'
            }
          </button>
        </form>

        <p className="text-center text-white/20 text-xs mt-8">
          Ingresá la contraseña para continuar
        </p>
      </div>

      {/* Animación shake */}
      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          15%       { transform: translateX(-8px); }
          30%       { transform: translateX(8px); }
          45%       { transform: translateX(-6px); }
          60%       { transform: translateX(6px); }
          75%       { transform: translateX(-3px); }
          90%       { transform: translateX(3px); }
        }
      `}</style>
    </div>
  )
}
