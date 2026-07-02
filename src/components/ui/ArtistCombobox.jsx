import { useState, useRef, useEffect, useMemo } from 'react'
import { useArtists } from '../../hooks/useArtists'

/**
 * Combobox con autocomplete de artistas presentes en el stock de la tienda.
 * Props:
 *   value    {string}            artista seleccionado ('' = ninguno)
 *   onChange {(name:string)=>void}
 *   className
 */
export default function ArtistCombobox({ value = '', onChange, className = '' }) {
  const { artists } = useArtists()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const wrapRef = useRef(null)

  useEffect(() => {
    const h = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase()
    const arr = t ? artists.filter(a => a.name.toLowerCase().includes(t)) : artists
    return arr.slice(0, 60)
  }, [artists, q])

  return (
    <div ref={wrapRef} className={`relative shrink-0 ${className}`}>
      <button type="button" onClick={() => setOpen(o => !o)}
        className={`appearance-none flex items-center justify-between gap-1 rounded-xl pl-3 pr-2 py-1.5 text-sm
                    cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-200 min-w-[9rem] max-w-[12rem]
                    ${value ? 'border border-blue-300 bg-blue-50 text-blue-700 font-semibold'
                            : 'border border-gray-200 bg-white text-gray-500'}`}>
        <span className="truncate">{value || 'Artista'}</span>
        <span className="flex items-center gap-1 shrink-0">
          {value && (
            <span onClick={(e) => { e.stopPropagation(); onChange('') }}
              className="text-blue-400 hover:text-red-400 text-[11px] leading-none cursor-pointer" title="Quitar">✕</span>
          )}
          <span className="text-gray-400 text-[10px]">▾</span>
        </span>
      </button>

      {open && (
        <div className="absolute z-40 top-full right-0 mt-1 w-64 bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden">
          <div className="p-2 border-b border-gray-100">
            <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar artista…"
              className="w-full px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200" />
          </div>
          <div className="max-h-64 overflow-y-auto">
            {filtered.map(a => (
              <button key={a.name} type="button"
                onClick={() => { onChange(a.name); setOpen(false); setQ('') }}
                className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-left text-xs hover:bg-blue-50 transition
                  ${a.name === value ? 'bg-blue-50' : ''}`}>
                <span className="font-medium text-gray-800 truncate">{a.name}</span>
                <span className="text-gray-400 shrink-0">{a.card_count}</span>
              </button>
            ))}
            {!filtered.length && (
              <p className="text-xs text-gray-400 text-center py-4">Sin artistas</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
