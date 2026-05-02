import { useState, useEffect, useRef, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { scannerApi } from '../lib/scanner'
import { fetchCardImages } from '../lib/pokemonTcg'
import { supabase } from '../lib/supabase'
import { useDolar } from '../hooks/useDolar'
import { CONDICIONES, IDIOMAS, STORE_ID } from '../constants'
import Toast from '../components/ui/Toast'
import Spinner from '../components/ui/Spinner'

const fmtARS = (n) => n != null ? `$${Math.round(n).toLocaleString('es-AR')}` : '—'

export default function Ingresos() {
  const { blue, oficial } = useDolar()

  const [form, setForm] = useState({
    nombre: '', set: '', numero: '', cantidad: 1,
    condicion: 'NM', idioma: 'en', precioVenta: '',
  })
  const [loading,   setLoading]   = useState(false)
  const [toast,     setToast]     = useState({ visible: false, msg: '', tipo: 'success' })

  // Autocomplete
  const [suggestions,   setSuggestions]   = useState([])
  const [sugLoading,    setSugLoading]    = useState(false)
  const [showSug,       setShowSug]       = useState(false)
  const sugTimer = useRef(null)

  // Preview / precios de mercado
  const [preview,     setPreview]     = useState(null)   // { imagen, precio_usd }
  const [previewLoad, setPreviewLoad] = useState(false)

  const setField = (k, v) => setForm(f => ({ ...f, [k]: v }))

  // ── Autocomplete: busca mientras escribe ───────────────────────────────
  const handleNombreChange = (val) => {
    setField('nombre', val)
    clearTimeout(sugTimer.current)
    if (!val.trim() || val.length < 2) { setSuggestions([]); setShowSug(false); return }

    setSugLoading(true)
    sugTimer.current = setTimeout(async () => {
      try {
        const [apiRes, dbRes] = await Promise.allSettled([
          // 1. Backend scanner (incluye precios de mercado)
          scannerApi.buscar(val, form.idioma),
          // 2. Cartas ya en stock en Supabase
          supabase.from('cards')
            .select('name, set_name, card_number, image_url, language')
            .ilike('name', `%${val}%`)
            .limit(6),
        ])

        const fromApi = apiRes.status === 'fulfilled'
          ? (apiRes.value?.opciones ?? apiRes.value?.results ?? []).map(c => ({
              nombre:    c.nombre || c.name,
              set:       c.set || c.set_name,
              numero:    c.numero || c.number,
              imagen:    c.imagen || c.image_url,
              precio_usd: c.precio_usd || c.price_usd,
              source:    'market',
            }))
          : []

        const fromDb = dbRes.status === 'fulfilled'
          ? (dbRes.value?.data ?? []).map(c => ({
              nombre:    c.name,
              set:       c.set_name,
              numero:    c.card_number,
              imagen:    c.image_url,
              precio_usd: null,
              source:    'stock',
            }))
          : []

        // Combinar, deduplicar por nombre+set, dar prioridad a market (tiene precio)
        const seen = new Set()
        const merged = [...fromApi, ...fromDb].filter(c => {
          const k = `${c.nombre}|${c.set}|${c.numero}`
          if (seen.has(k)) return false
          seen.add(k)
          return true
        }).slice(0, 8)

        setSuggestions(merged)
        setShowSug(merged.length > 0)
      } catch (_) {}
      finally { setSugLoading(false) }
    }, 300)
  }

  // ── Seleccionar sugerencia ─────────────────────────────────────────────
  const selectSuggestion = useCallback((sug) => {
    setForm(f => ({
      ...f,
      nombre:  sug.nombre || '',
      set:     sug.set    || '',
      numero:  sug.numero || '',
    }))
    setShowSug(false)
    setSuggestions([])
    // Guardar preview con lo que ya tenemos
    setPreview({ imagen: sug.imagen, precio_usd: sug.precio_usd })
    // Si no tiene imagen, buscar
    if (!sug.imagen) fetchPreviewImage(sug.nombre, sug.numero, sug.set)
  }, [])

  // ── Preview: busca imagen si no viene en la sugerencia ─────────────────
  const fetchPreviewImage = async (nombre, numero, setName) => {
    if (!nombre) return
    setPreviewLoad(true)
    const imgs = await fetchCardImages(nombre, numero, setName)
    if (imgs?.large || imgs?.small) {
      setPreview(prev => ({ ...prev, imagen: imgs.large || imgs.small }))
    }
    setPreviewLoad(false)
  }

  // Cuando el usuario termina de escribir nombre + numero, busca preview
  const nombreBlurTimer = useRef(null)
  const handleNumeroChange = (val) => {
    setField('numero', val)
    clearTimeout(nombreBlurTimer.current)
    if (form.nombre && val) {
      nombreBlurTimer.current = setTimeout(() => {
        fetchPreviewImage(form.nombre, val, form.set)
      }, 600)
    }
  }

  // ── Cerrar dropdown al hacer click afuera ──────────────────────────────
  const wrapRef = useRef(null)
  useEffect(() => {
    const handler = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setShowSug(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // ── Precios calculados ──────────────────────────────────────────────────
  const usd     = preview?.precio_usd ?? null
  const arsOfic = usd != null && oficial ? usd * oficial : null
  const arsBlue = usd != null && blue    ? usd * blue    : null

  // ── Submit: escribe directo en Supabase ────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.nombre.trim()) return
    setLoading(true)
    try {
      const precioVenta = parseFloat(form.precioVenta) || null
      const precioUsd   = usd ?? precioVenta ?? null
      const cantidad    = parseInt(form.cantidad) || 1

      // 1. Buscar o crear la carta en `cards`
      let cardId = null
      // Buscar carta existente (cards es tabla global, sin store_id)
      let cardQuery = supabase
        .from('cards')
        .select('id')
        .ilike('name', form.nombre.trim())

      if (form.set.trim())    cardQuery = cardQuery.eq('set_name', form.set.trim())
      if (form.numero.trim()) cardQuery = cardQuery.eq('card_number', form.numero.trim())

      const { data: existing } = await cardQuery.maybeSingle()

      if (existing?.id) {
        cardId = existing.id
        // Actualizar imagen si tenemos una nueva
        if (preview?.imagen) {
          await supabase.from('cards').update({ image_url: preview.imagen }).eq('id', cardId)
        }
      } else {
        // Insertar nueva carta
        const { data: newCard, error: cardErr } = await supabase
          .from('cards')
          .insert({
            name:        form.nombre.trim(),
            set_name:    form.set.trim()    || null,
            card_number: form.numero.trim() || null,
            language:    form.idioma        || 'en',
            image_url:   preview?.imagen    || null,
          })
          .select('id')
          .single()
        if (cardErr) throw cardErr
        cardId = newCard.id
      }

      // 2. Insertar registro(s) en `inventory`
      const rows = Array.from({ length: cantidad }, () => ({
        store_id:          STORE_ID,
        card_id:           cardId,
        quantity:          1,
        condicion:         form.condicion,
        condition:         form.condicion,
        status:            'disponible',
        estado:            'disponible',
        price_usd:         precioUsd,
        price_ars_oficial: arsOfic   ?? null,
        price_ars_blue:    arsBlue   ?? null,
        scan_date:         new Date().toISOString(),
      }))

      const { error: invErr } = await supabase.from('inventory').insert(rows)
      if (invErr) throw invErr

      showToast(`✅ ${cantidad > 1 ? `${cantidad} cartas agregadas` : 'Carta agregada'} al stock`)
      setForm({ nombre: '', set: '', numero: '', cantidad: 1, condicion: 'NM', idioma: 'en', precioVenta: '' })
      setPreview(null)
    } catch (err) {
      console.error('Error al guardar carta:', err)
      showToast(err?.message || 'Error al guardar la carta', 'error')
    } finally {
      setLoading(false)
    }
  }

  const showToast = (msg, tipo = 'success') => {
    setToast({ visible: true, msg, tipo })
    setTimeout(() => setToast(t => ({ ...t, visible: false })), 2500)
  }

  const inputCls = "w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
  const labelCls = "text-xs text-gray-500 font-medium mb-1 block"

  return (
    <div className="max-w-4xl">
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="flex flex-col lg:flex-row">

          {/* ── Formulario (izq) ────────────────────────────────────────── */}
          <div className="flex-1 p-6">
            <h3 className="font-semibold text-gray-800 mb-5">Registrar nuevas cartas</h3>

            <form onSubmit={handleSubmit} className="space-y-4">

              {/* Nombre con autocomplete */}
              <div ref={wrapRef} className="relative">
                <label className={labelCls}>Nombre de la carta</label>
                <input
                  value={form.nombre}
                  onChange={e => handleNombreChange(e.target.value)}
                  onFocus={() => suggestions.length > 0 && setShowSug(true)}
                  placeholder="Ej: Charizard ex"
                  autoComplete="off"
                  className={inputCls}
                />
                {/* Spinner búsqueda */}
                {sugLoading && (
                  <div className="absolute right-3 top-8">
                    <div className="w-4 h-4 border-2 border-blue-300 border-t-transparent rounded-full animate-spin" />
                  </div>
                )}
                {/* Dropdown sugerencias */}
                {showSug && suggestions.length > 0 && (
                  <div className="absolute z-30 top-full left-0 right-0 mt-1
                                  bg-white border border-gray-200 rounded-2xl shadow-xl
                                  max-h-72 overflow-y-auto">
                    {suggestions.map((sug, i) => (
                      <button key={i} type="button"
                        onMouseDown={() => selectSuggestion(sug)}
                        className="w-full flex items-center gap-3 px-4 py-2.5
                                   hover:bg-blue-50 text-left border-b border-gray-100
                                   last:border-0 transition">
                        {sug.imagen
                          ? <img src={sug.imagen} alt="" className="w-7 h-10 object-cover rounded shrink-0" />
                          : <div className="w-7 h-10 bg-gray-100 rounded shrink-0 flex items-center justify-center text-gray-300 text-xs">?</div>
                        }
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-800 truncate">{sug.nombre}</p>
                          <p className="text-xs text-gray-400 truncate">
                            {sug.set}{sug.numero ? ` · #${sug.numero}` : ''}
                          </p>
                        </div>
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          {sug.precio_usd && (
                            <span className="text-xs font-bold text-emerald-600">
                              ${Number(sug.precio_usd).toFixed(2)}
                            </span>
                          )}
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium
                            ${sug.source === 'market'
                              ? 'bg-blue-100 text-blue-600'
                              : 'bg-gray-100 text-gray-500'}`}>
                            {sug.source === 'market' ? 'mercado' : 'stock'}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Set + Número */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Set / Edición</label>
                  <input value={form.set} onChange={e => setField('set', e.target.value)}
                    placeholder="Ej: Obsidian Flames" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Número de carta</label>
                  <input value={form.numero} onChange={e => handleNumeroChange(e.target.value)}
                    placeholder="Ej: 125" className={inputCls} />
                </div>
              </div>

              {/* Cantidad + Condición + Idioma */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className={labelCls}>Cantidad</label>
                  <input type="number" min="1" value={form.cantidad}
                    onChange={e => setField('cantidad', e.target.value)}
                    className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Condición</label>
                  <select value={form.condicion} onChange={e => setField('condicion', e.target.value)}
                    className={`${inputCls} bg-white`}>
                    {CONDICIONES.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Idioma</label>
                  <select value={form.idioma} onChange={e => setField('idioma', e.target.value)}
                    className={`${inputCls} bg-white`}>
                    {IDIOMAS.map(i => <option key={i.code} value={i.code}>{i.flag} {i.label}</option>)}
                  </select>
                </div>
              </div>

              {/* Precios de mercado (read-only) */}
              <div className="bg-gray-50 rounded-2xl p-4 space-y-2">
                <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide mb-3">
                  Precio de mercado
                </p>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: 'USD',        value: usd     != null ? `$${Number(usd).toFixed(2)}` : '—', color: 'text-emerald-600' },
                    { label: 'ARS Oficial',value: fmtARS(arsOfic),                                       color: 'text-gray-700'   },
                    { label: 'ARS Blue',   value: fmtARS(arsBlue),                                       color: 'text-blue-600'   },
                  ].map(p => (
                    <div key={p.label} className="bg-white rounded-xl p-3 border border-gray-200 text-center">
                      <p className="text-[10px] text-gray-400 mb-1">{p.label}</p>
                      <p className={`text-sm font-bold ${p.color}`}>{p.value}</p>
                    </div>
                  ))}
                </div>
                {usd == null && (
                  <p className="text-[11px] text-gray-400 text-center pt-1">
                    Seleccioná una carta del autocompletado para ver los precios
                  </p>
                )}
              </div>

              {/* Precio venta */}
              <div>
                <label className={labelCls}>Precio de venta (USD)</label>
                <input type="number" step="0.01" min="0"
                  value={form.precioVenta}
                  onChange={e => setField('precioVenta', e.target.value)}
                  placeholder={usd != null ? `Sugerido: $${Number(usd).toFixed(2)}` : 'Ej: 25.00'}
                  className={inputCls}
                />
              </div>

              {/* Tip scanner */}
              <p className="text-xs text-gray-400 bg-blue-50 rounded-xl px-4 py-3">
                También podés usar el{' '}
                <Link to="/scanner" className="text-blue-600 font-semibold hover:underline">
                  scanner por cámara
                </Link>
                {' '}desde el celular para identificar la carta automáticamente.
              </p>

              <button type="submit" disabled={loading || !form.nombre.trim()}
                className="w-full py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-50
                           text-white font-bold rounded-xl transition flex items-center justify-center gap-2">
                {loading ? <Spinner size={18} /> : 'Agregar al stock'}
              </button>
            </form>
          </div>

          {/* ── Panel preview (der) ──────────────────────────────────────── */}
          <div className="lg:w-64 border-t lg:border-t-0 lg:border-l border-gray-100
                          bg-gray-50 flex flex-col items-center justify-center p-6 gap-4">
            {previewLoad ? (
              <div className="flex flex-col items-center gap-3 text-gray-400">
                <div className="w-8 h-8 border-2 border-blue-300 border-t-transparent rounded-full animate-spin" />
                <p className="text-xs">Buscando imagen…</p>
              </div>
            ) : preview?.imagen ? (
              <>
                <div className="relative">
                  <img
                    src={preview.imagen}
                    alt={form.nombre}
                    className="w-40 rounded-2xl shadow-xl object-contain"
                    draggable={false}
                  />
                  {/* Badge verificado */}
                  <div className="absolute -top-2 -right-2 bg-emerald-500 text-white
                                  text-[10px] font-bold px-2 py-0.5 rounded-full shadow">
                    ✓
                  </div>
                </div>
                <div className="text-center">
                  <p className="text-sm font-semibold text-gray-800 leading-tight">{form.nombre}</p>
                  {form.set && <p className="text-xs text-gray-400 mt-0.5">{form.set}</p>}
                  {form.numero && <p className="text-xs text-gray-400">#{form.numero}</p>}
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center gap-3 text-center">
                <div className="w-40 h-56 bg-white border-2 border-dashed border-gray-200
                                rounded-2xl flex items-center justify-center">
                  <div className="text-center">
                    <p className="text-3xl mb-2">🃏</p>
                    <p className="text-xs text-gray-300">La imagen aparece<br/>al seleccionar la carta</p>
                  </div>
                </div>
              </div>
            )}
          </div>

        </div>
      </div>

      <Toast mensaje={toast.msg} tipo={toast.tipo} visible={toast.visible} />
    </div>
  )
}
