import { useState, useRef, useEffect } from 'react'
import { fetchAllSets } from '../../lib/pokemonTcg'
import { scannerApi } from '../../lib/scanner'
import { translateSetName } from '../../lib/setTranslations'
import { STORE_ID } from '../../constants'

// ── Sets personalizados en localStorage ───────────────────────────────────────
const LS_KEY = `custom_sets_${STORE_ID}`

function loadCustomSets() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]') } catch { return [] }
}

function saveCustomSet(name) {
  const existing = loadCustomSets()
  if (existing.some(s => s.name.toLowerCase() === name.toLowerCase())) return
  existing.unshift({ id: `custom_${Date.now()}`, name, custom: true })
  localStorage.setItem(LS_KEY, JSON.stringify(existing))
}

/**
 * Dropdown buscable con todos los sets del TCG.
 *
 * Props:
 *   value   {string}   — nombre del set seleccionado (para mostrar)
 *   setId   {string}   — id de la API ("sv3pt5", "base1"…), para marcar el activo
 *   onChange({set_name, set_id}) — callback al elegir o limpiar
 *   disabled  {bool}    — deshabilitar el control
 *   className {string}  — clases extra para el wrapper
 *   size      {'sm'|'md'} — 'sm' = compacto (CardRow), 'md' = formulario (default)
 *   lang      {string}  — 'en' | 'jp' | 'cn' — filtra sets por idioma (default: 'en')
 */
const _normLang = (l = 'en') => {
  if (['ja', 'jp', 'japanese'].includes(l)) return 'jp'
  if (['zh', 'cn', 'chinese'].includes(l))  return 'cn'
  return 'en'
}

export default function SetSelect({ value, setId, onChange, disabled = false, className = '', size = 'md', lang = 'en' }) {
  const [open,       setOpen]       = useState(false)
  const [query,      setQuery]      = useState('')
  const [sets,       setSets]       = useState([])
  const [customSets, setCustomSets] = useState([])
  const [loading,    setLoading]    = useState(false)
  const wrapRef    = useRef(null)
  const inputRef   = useRef(null)
  const loadedLang = useRef(null)

  const normalizedLang = _normLang(lang)

  // Cargar sets al abrir (o si cambió el idioma)
  const openDropdown = async () => {
    if (disabled) return
    setOpen(true)
    setQuery('')
    setCustomSets(loadCustomSets())
    if (sets.length === 0 || loadedLang.current !== normalizedLang) {
      setLoading(true)
      let data = []
      if (normalizedLang === 'en') {
        const raw = await fetchAllSets()
        data = raw
      } else {
        const raw = await scannerApi.availableSets(normalizedLang)
        const seen = new Map()
        for (const s of raw) {
          const en = translateSetName(s.name, s.id)
          if (!seen.has(en)) {
            seen.set(en, s)
          } else {
            const isLocal = (id) => !/^[A-Za-z]{1,3}\d/.test(id)
            if (isLocal(s.id) && !isLocal(seen.get(en).id)) seen.set(en, s)
          }
        }
        data = Array.from(seen.values())
          .sort((a, b) => translateSetName(a.name, a.id).localeCompare(translateSetName(b.name, b.id)))
      }
      setSets(data)
      loadedLang.current = normalizedLang
      setLoading(false)
    }
    setTimeout(() => inputRef.current?.focus(), 50)
  }

  const handleAddCustom = () => {
    const name = query.trim()
    if (!name) return
    saveCustomSet(name)
    setCustomSets(loadCustomSets())
    onChange({ set_name: name, set_id: null })
    setOpen(false)
  }

  const handleRemoveCustom = (e, customId) => {
    e.stopPropagation()
    const updated = loadCustomSets().filter(s => s.id !== customId)
    localStorage.setItem(LS_KEY, JSON.stringify(updated))
    setCustomSets(updated)
  }

  // Reiniciar sets cacheados cuando cambia el idioma
  useEffect(() => {
    if (loadedLang.current !== null && loadedLang.current !== normalizedLang) {
      setSets([])
      loadedLang.current = null
    }
  }, [normalizedLang])

  // Cerrar al click fuera
  useEffect(() => {
    if (!open) return
    const handler = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const q = query.trim().toLowerCase()
  const filtered = q
    ? sets.filter(s => {
        const en  = translateSetName(s.name, s.id).toLowerCase()
        const raw = s.name.toLowerCase()
        return en.includes(q) || raw.includes(q) ||
               s.series?.toLowerCase().includes(q) ||
               s.year?.includes(q)
      })
    : sets

  const filteredCustom = q
    ? customSets.filter(s => s.name.toLowerCase().includes(q))
    : customSets

  // Si hay query escrito y no coincide exactamente con ningún set, ofrecemos agregar
  const queryIsNew = q && !filtered.some(s => translateSetName(s.name, s.id).toLowerCase() === q)
                       && !filteredCustom.some(s => s.name.toLowerCase() === q)

  const handleSelect = (set) => {
    onChange({ set_name: set.name, set_id: set.id })
    setOpen(false)
  }

  const handleClear = (e) => {
    e.stopPropagation()
    onChange({ set_name: '', set_id: null })
  }

  return (
    <div ref={wrapRef} className={`relative ${className}`}>
      {/* Trigger */}
      <button
        type="button"
        onClick={openDropdown}
        disabled={disabled}
        className={`w-full flex items-center justify-between gap-1 text-left transition
                    focus:outline-none focus:ring-2 focus:ring-blue-200
                    disabled:opacity-40 disabled:cursor-not-allowed
                    ${size === 'sm'
                      ? 'px-2.5 py-1.5 border rounded-lg text-xs'
                      : 'px-3 py-2 border rounded-xl text-sm'}
                    ${setId
                      ? 'border-blue-200 bg-blue-50 text-blue-700'
                      : size === 'sm'
                        ? 'border-gray-100 bg-gray-50 text-gray-400 hover:bg-white hover:border-gray-200'
                        : 'border-gray-200 bg-white text-gray-400 hover:border-gray-300'}`}
      >
        <span className="truncate font-medium">
          {value ? translateSetName(value) : 'Elegir set…'}
        </span>
        <div className="flex items-center gap-1 shrink-0">
          {setId && (
            <span
              onClick={handleClear}
              className="text-blue-400 hover:text-red-400 transition text-[10px] leading-none cursor-pointer"
              title="Quitar set"
            >✕</span>
          )}
          <span className="text-gray-400 text-[10px]">▾</span>
        </div>
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute top-full left-0 z-[80] mt-1 w-72 bg-white border
                        border-gray-200 rounded-xl shadow-xl overflow-hidden"
        >
          {/* Search input */}
          <div className="p-2 border-b border-gray-100">
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Buscar set o serie…"
              className="w-full px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg
                         focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
          </div>

          {/* List */}
          <div className="overflow-y-auto max-h-60">
            {loading && (
              <div className="flex justify-center py-6">
                <div className="w-5 h-5 border-2 border-blue-200 border-t-blue-500 rounded-full animate-spin" />
              </div>
            )}

            {/* Sets personalizados guardados */}
            {!loading && filteredCustom.length > 0 && (
              <>
                <p className="px-3 pt-2 pb-1 text-[10px] text-gray-400 font-semibold uppercase tracking-wide">
                  Personalizados
                </p>
                {filteredCustom.map(s => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => { onChange({ set_name: s.name, set_id: null }); setOpen(false) }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-left text-xs hover:bg-purple-50 transition group"
                  >
                    <span className="w-5 h-5 shrink-0 text-purple-300 flex items-center justify-center">✏️</span>
                    <span className="flex-1 font-medium text-gray-800 truncate">{s.name}</span>
                    <span
                      onClick={(e) => handleRemoveCustom(e, s.id)}
                      className="text-gray-300 hover:text-red-400 opacity-0 group-hover:opacity-100 transition text-[10px] cursor-pointer"
                      title="Eliminar set personalizado"
                    >✕</span>
                  </button>
                ))}
                {filtered.length > 0 && <div className="border-t border-gray-100 my-1" />}
              </>
            )}

            {/* Sets oficiales */}
            {!loading && filtered.map(s => (
              <button
                key={s.id}
                type="button"
                onClick={() => handleSelect(s)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 text-left text-xs
                            hover:bg-blue-50 transition
                            ${s.id === setId ? 'bg-blue-50' : ''}`}
              >
                {s.symbol
                  ? <img src={s.symbol} alt="" className="w-5 h-5 object-contain shrink-0" />
                  : <span className="w-5 h-5 shrink-0 text-gray-300 flex items-center justify-center">🃏</span>
                }
                <div className="flex-1 min-w-0">
                  <span className="font-medium text-gray-800 block truncate">
                    {translateSetName(s.name, s.id)}
                  </span>
                  {(s.series || s.year || s.total) && (
                    <span className="text-gray-400 text-[10px]">
                      {[s.series, s.year, s.total ? `${s.total} cartas` : null].filter(Boolean).join(' · ')}
                    </span>
                  )}
                </div>
                {s.id === setId && <span className="text-blue-500 text-[10px] shrink-0">✓</span>}
              </button>
            ))}

            {/* Sin resultados + botón para agregar set personalizado */}
            {!loading && filtered.length === 0 && filteredCustom.length === 0 && !queryIsNew && (
              <p className="text-xs text-gray-400 text-center py-4">Sin resultados</p>
            )}
            {!loading && queryIsNew && (
              <div className="border-t border-gray-100">
                <button
                  type="button"
                  onClick={handleAddCustom}
                  className="w-full flex items-center gap-2 px-3 py-2.5 text-xs text-left
                             hover:bg-purple-50 text-purple-600 transition font-medium"
                >
                  <span className="text-base leading-none">+</span>
                  <span>Agregar <strong>"{query.trim()}"</strong> como set personalizado</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
