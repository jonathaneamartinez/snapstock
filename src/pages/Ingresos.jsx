import { useState, useEffect, useRef, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { scannerApi } from '../lib/scanner'
import {
  fetchCardImages,
  fetchCardsBySet,
  fetchCardBySetAndNumber,
} from '../lib/pokemonTcg'
import { supabase } from '../lib/supabase'
import { useDolar } from '../hooks/useDolar'
import { useSettings } from '../hooks/useSettings'
import { CONDICIONES, IDIOMAS, STORE_ID } from '../constants'
import Toast      from '../components/ui/Toast'
import Spinner    from '../components/ui/Spinner'
import SetSelect  from '../components/ui/SetSelect'
import ImportarCartasModal from '../components/ingresos/ImportarCartasModal'

const fmtARS = (n) => n != null ? `$${Math.round(n).toLocaleString('es-AR')}` : '—'

export default function Ingresos() {
  const navigate = useNavigate()
  const { blue, oficial } = useDolar()
  const { margen } = useSettings()
  const [showImport, setShowImport] = useState(false)

  const [form, setForm] = useState({
    nombre: '', set: '', set_id: null, numero: '', cantidad: 1,
    condicion: 'NM', idioma: 'en', precioVenta: '',
  })
  const [loading,   setLoading]   = useState(false)
  const [toast,     setToast]     = useState({ visible: false, msg: '', tipo: 'success' })

  // Autocomplete
  const [suggestions,   setSuggestions]   = useState([])
  const [sugLoading,    setSugLoading]    = useState(false)
  const [showSug,       setShowSug]       = useState(false)
  const sugTimer       = useRef(null)
  // Cache de cartas del set seleccionado (para JP/CN — permite filtrar client-side)
  const allSetCardsRef = useRef([])

  // Preview / precios de mercado
  const [preview,     setPreview]     = useState(null)   // { imagen, precio_usd }
  const [previewLoad, setPreviewLoad] = useState(false)

  const setField = (k, v) => setForm(f => ({ ...f, [k]: v }))

  // ── Normaliza "078/217" → "78", "TG30" → "TG30" ──────────────────────
  const normalizeNum = (raw) => {
    const s    = String(raw).trim()
    const left = s.includes('/') ? s.split('/')[0] : s
    if (/^\d+$/.test(left)) return String(parseInt(left, 10))
    return left
  }

  // ── Normaliza idioma al formato que usa el backend ────────────────────
  const normLang = (idioma) => {
    if (['ja', 'jp', 'japanese'].includes(idioma)) return 'jp'
    if (['zh', 'cn', 'chinese'].includes(idioma))  return 'cn'
    return 'en'
  }

  /**
   * Busca imagen desde el índice local del backend (card_phash.json → R2).
   * Funciona para EN, JP y CN. Es la fuente primaria para cualquier idioma.
   * Si numero es vacío, busca solo por nombre (útil al cambiar idioma JP/CN).
   * @returns {Promise<{url, set_name, number}|null>}
   */
  const fetchImageFromBackend = async (nombre, numero, idioma, setId = '') => {
    if (!nombre) return null
    const lang = normLang(idioma)
    const num  = numero ? normalizeNum(numero) : ''
    return scannerApi.cardImageUrl(nombre, num, lang, { setId })
  }

  // ── Autocomplete: busca mientras escribe ───────────────────────────────
  const handleNombreChange = (val) => {
    setField('nombre', val)
    clearTimeout(sugTimer.current)
    if (!val.trim() || val.length < 2) { setSuggestions([]); setShowSug(false); return }

    setSugLoading(true)
    sugTimer.current = setTimeout(async () => {
      try {
        const lang = normLang(form.idioma)

        // Si hay set seleccionado y el idioma es EN → búsqueda pokemontcg.io (con precio)
        if (form.set_id && lang === 'en') {
          const cards = await fetchCardsBySet(form.set_id, val.trim())
          const mapped = cards.slice(0, 60).map(c => ({
            nombre:     c.name,
            set:        c.set_name,
            set_id:     c.set_id,
            numero:     c.card_number,
            imagen:     c.image_url,
            precio_usd: c.price_usd,
            source:     'market',
          }))
          setSuggestions(mapped)
          setShowSug(mapped.length > 0)
          return
        }

        // Si hay set seleccionado y el idioma es JP/CN
        if (form.set_id && (lang === 'jp' || lang === 'cn')) {
          // Si ya tenemos las cartas del set cargadas, filtrar client-side (rápido, sin API call)
          if (allSetCardsRef.current.length > 0) {
            const q_lower = val.trim().toLowerCase()
            const filtered = q_lower
              ? allSetCardsRef.current.filter(c =>
                  (c.nombre?.toLowerCase().includes(q_lower)) ||
                  (c.numero?.toLowerCase().includes(q_lower))
                )
              : allSetCardsRef.current
            setSuggestions(filtered.slice(0, 60))
            setShowSug(filtered.length > 0)
            setSugLoading(false)
            return
          }
          // Si aún no están cargadas, buscar en el backend
          const res = await scannerApi.buscar(val.trim(), lang, form.set_id)
          const mapped = (res?.results ?? []).map(c => ({
            nombre:     c.nombre,
            set:        c.set_name,
            set_id:     c.set_code,
            numero:     c.numero,
            imagen:     c.imagen,
            precio_usd: null,
            source:     'phash',
          }))
          setSuggestions(mapped)
          setShowSug(mapped.length > 0)
          return
        }

        // Sin set: búsqueda global (scanner + Supabase)
        const [apiRes, dbRes] = await Promise.allSettled([
          scannerApi.buscar(val, form.idioma),
          supabase.from('cards')
            .select('name, set_name, card_number, image_url, language')
            .ilike('name', `%${val}%`)
            .limit(6),
        ])

        const fromApi = apiRes.status === 'fulfilled'
          ? (apiRes.value?.opciones ?? apiRes.value?.results ?? []).map(c => ({
              nombre:     c.nombre || c.name,
              set:        c.set || c.set_name,
              set_id:     null,
              numero:     c.numero || c.number,
              imagen:     c.imagen || c.image_url,
              precio_usd: c.precio_usd || c.price_usd,
              source:     'market',
            }))
          : []

        const fromDb = dbRes.status === 'fulfilled'
          ? (dbRes.value?.data ?? []).map(c => ({
              nombre:     c.name,
              set:        c.set_name,
              set_id:     null,
              numero:     c.card_number,
              imagen:     c.image_url,
              precio_usd: null,
              source:     'stock',
            }))
          : []

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

  // ── Focus en nombre con set seleccionado → cargar todas las cartas del set ──
  const handleNombreFocus = async () => {
    if (!form.set_id) return
    if (suggestions.length > 0) { setShowSug(true); return }
    const lang = normLang(form.idioma)

    setSugLoading(true)

    if (lang === 'en') {
      // EN: usar pokemontcg.io (trae precios)
      const cards = await fetchCardsBySet(form.set_id)
      const mapped = cards.slice(0, 80).map(c => ({
        nombre:     c.name,
        set:        c.set_name,
        set_id:     c.set_id,
        numero:     c.card_number,
        imagen:     c.image_url,
        precio_usd: c.price_usd,
        source:     'market',
      }))
      allSetCardsRef.current = mapped
      setSuggestions(mapped)
      setShowSug(mapped.length > 0)
    } else {
      // JP/CN: precargar todas las cartas del set desde el índice local (q vacío + set_id)
      try {
        const res = await scannerApi.buscar('', lang, form.set_id, 200)
        const mapped = (res?.results ?? []).map(c => ({
          nombre:     c.nombre,
          set:        c.set_name,
          set_id:     c.set_code,
          numero:     c.numero,
          imagen:     c.imagen,
          precio_usd: null,
          source:     'phash',
        }))
        allSetCardsRef.current = mapped
        setSuggestions(mapped.slice(0, 60))
        setShowSug(mapped.length > 0)
      } catch (_) {}
    }

    setSugLoading(false)
  }

  // ── Seleccionar sugerencia ─────────────────────────────────────────────
  const selectSuggestion = useCallback((sug) => {
    let autoPrice = ''
    if (sug.precio_usd && blue) {
      const m = margen ?? 0
      const raw = sug.precio_usd * blue * (1 + m / 100)
      autoPrice = String(Math.round(raw / 500) * 500)
    }

    setForm(f => ({
      ...f,
      nombre:      sug.nombre  || '',
      set:         sug.set     || '',
      set_id:      sug.set_id  ?? f.set_id,  // conservar set_id si ya hay uno
      numero:      sug.numero  || '',
      precioVenta: autoPrice   || f.precioVenta,
    }))
    setShowSug(false)
    setSuggestions([])
    setPreview({ imagen: sug.imagen, precio_usd: sug.precio_usd })
    if (!sug.imagen) fetchPreviewImage(sug.nombre, sug.numero, sug.set)
  }, [blue, margen])

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

  // Cuando el usuario escribe un número: busca la carta exacta
  const numTimer = useRef(null)
  const handleNumeroChange = (val) => {
    setField('numero', val)
    clearTimeout(numTimer.current)
    if (!val.trim()) return

    numTimer.current = setTimeout(async () => {
      const numNorm = normalizeNum(val.trim())

      setSugLoading(true)
      try {
        // 1. Buscar en índice local del backend (cubre EN, JP, CN desde R2)
        if (form.nombre) {
          const res = await fetchImageFromBackend(form.nombre, numNorm, form.idioma, form.set_id || '')
          if (res?.url) {
            setPreview(prev => ({ ...prev, imagen: res.url }))
            setSugLoading(false)
            return
          }
        }

        // 2. Inglés con set: intentar pokemontcg.io API (trae nombre+precio)
        if (form.set_id && normLang(form.idioma) === 'en') {
          const card = await fetchCardBySetAndNumber(form.set_id, val.trim())
          if (card) {
            selectSuggestion({
              nombre:     card.name,
              set:        card.set_name,
              set_id:     card.set_id,
              numero:     card.card_number,
              imagen:     card.image_url,
              precio_usd: card.price_usd,
              source:     'market',
            })
            return
          }
        }

        // 3. Fallback: buscar imagen por nombre+número+set en pokemontcg.io
        if (form.nombre) {
          fetchPreviewImage(form.nombre, numNorm, form.set)
        }
      } finally {
        setSugLoading(false)
      }
    }, 400)
  }

  // ── Al cambiar idioma con carta ya seleccionada → re-buscar imagen desde R2 ──
  const prevIdiomaRef = useRef(form.idioma)
  useEffect(() => {
    const prev = prevIdiomaRef.current
    prevIdiomaRef.current = form.idioma
    if (!form.nombre || form.idioma === prev) return

    const lang = normLang(form.idioma)

    // Para todos los idiomas: buscar primero en nuestro índice R2
    // (tenemos EN + JP + CN descargados). Fallback a pokemontcg.io solo para EN.
    fetchImageFromBackend(form.nombre, lang === 'en' ? form.numero : '', form.idioma)
      .then(res => {
        if (res?.url) {
          setPreview(prev => ({ ...prev, imagen: res.url }))
          setForm(f => ({
            ...f,
            set:    res.set_name || f.set,
            numero: res.number   || (lang === 'en' ? f.numero : ''),
            set_id: lang === 'en' ? f.set_id : null,
          }))
          return
        }
        // Sin resultado en R2 → fallback a pokemontcg.io (solo EN tiene precios)
        if (lang === 'en') {
          fetchPreviewImage(form.nombre, form.numero, form.set)
        }
      })
  }, [form.idioma]) // eslint-disable-line react-hooks/exhaustive-deps

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
      const precioUsd   = usd ?? null   // NUNCA usar el precio ARS como USD
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

      // 2. Upsert en inventory: si ya existe la carta con misma condición, suma el quantity
      const { data: existingInv } = await supabase
        .from('inventory')
        .select('id, quantity')
        .eq('store_id', STORE_ID)
        .eq('card_id',  cardId)
        .eq('condition', form.condicion)
        .eq('status', 'disponible')
        .maybeSingle()

      if (existingInv) {
        const { error: invErr } = await supabase
          .from('inventory')
          .update({
            quantity:          (existingInv.quantity || 1) + cantidad,
            price_usd:         precioUsd,
            price_ars_oficial: arsOfic   ?? null,
            price_ars_blue:    arsBlue   ?? null,
            sale_price_ars:    form.precioVenta ? parseFloat(form.precioVenta) : null,
          })
          .eq('id', existingInv.id)
        if (invErr) throw invErr
      } else {
        const { error: invErr } = await supabase
          .from('inventory')
          .insert({
            store_id:          STORE_ID,
            card_id:           cardId,
            quantity:          cantidad,
            condicion:         form.condicion,
            condition:         form.condicion,
            status:            'disponible',
            estado:            'disponible',
            price_usd:         precioUsd,
            price_ars_oficial: arsOfic   ?? null,
            price_ars_blue:    arsBlue   ?? null,
            sale_price_ars:    form.precioVenta ? parseFloat(form.precioVenta) : null,
            scan_date:         new Date().toISOString(),
          })
        if (invErr) throw invErr
      }

      showToast(`✅ ${cantidad > 1 ? `${cantidad} cartas agregadas` : 'Carta agregada'} al stock`)
      setForm({ nombre: '', set: '', set_id: null, numero: '', cantidad: 1, condicion: 'NM', idioma: 'en', precioVenta: '' })
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
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-semibold text-gray-800">Registrar nuevas cartas</h3>
              <button
                onClick={() => setShowImport(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 hover:bg-gray-200
                           text-gray-600 text-xs font-semibold rounded-xl transition"
              >
                📥 Importar CSV / Excel
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">

              {/* Nombre con autocomplete */}
              <div ref={wrapRef} className="relative">
                <label className={labelCls}>Nombre de la carta</label>
                <input
                  value={form.nombre}
                  onChange={e => handleNombreChange(e.target.value)}
                  onFocus={handleNombreFocus}
                  placeholder={form.set_id ? 'Buscar en el set…' : 'Ej: Charizard ex'}
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
                  <SetSelect
                    value={form.set}
                    setId={form.set_id}
                    lang={form.idioma}
                    onChange={({ set_name, set_id }) => {
                      setForm(f => ({ ...f, set: set_name, set_id, numero: '', nombre: '' }))
                      setSuggestions([])
                      setShowSug(false)
                      setPreview(null)
                      allSetCardsRef.current = []   // limpiar cache al cambiar set
                    }}
                    className="w-full"
                  />
                </div>
                <div>
                  <label className={labelCls}>Número de carta</label>
                  <input
                    value={form.numero}
                    onChange={e => handleNumeroChange(e.target.value)}
                    placeholder={form.set_id ? '1, TG30…' : 'Ej: 125'}
                    disabled={!form.set_id && !form.nombre}
                    className={`${inputCls} disabled:opacity-50`}
                  />
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
                  <select value={form.idioma}
                    onChange={e => {
                      setField('idioma', e.target.value)
                      allSetCardsRef.current = []   // limpiar cache al cambiar idioma
                      setSuggestions([])
                    }}
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
                <label className={labelCls}>Precio de venta (ARS)</label>
                <input type="number" step="0.01" min="0"
                  value={form.precioVenta}
                  onChange={e => setField('precioVenta', e.target.value)}
                  placeholder={usd != null ? `Sugerido: ${fmtARS(arsBlue)}` : 'Ej: 14000'}
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

      {showImport && (
        <ImportarCartasModal
          onClose={() => setShowImport(false)}
          onDone={() => navigate('/stock')}
        />
      )}
    </div>
  )
}
