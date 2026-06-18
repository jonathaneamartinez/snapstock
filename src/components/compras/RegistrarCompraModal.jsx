import { useState, useRef, useEffect, useCallback } from 'react'
import { useCardImage } from '../../hooks/useCardImage'
import { supabase }           from '../../lib/supabase'
import {
  searchCardsByName,
  fetchCardsBySet,
  fetchCardBySetAndNumber,
  fetchCardImages,
} from '../../lib/pokemonTcg'
import { scannerApi }         from '../../lib/scanner'
import { useDolar }           from '../../hooks/useDolar'
import { STORE_ID, CONDICIONES, IDIOMAS, FIRST_ED_SETS } from '../../constants'
import Spinner      from '../ui/Spinner'
import SetSelect    from '../ui/SetSelect'
import FinishSelect from '../ui/FinishSelect'

const BACKEND = 'https://stock-tcg-production.up.railway.app'

const GRADE_OPTIONS = [
  { value: 'ungraded', label: 'Sin graduar' },
  { value: 'psa9',     label: 'PSA 9'       },
  { value: 'psa10',    label: 'PSA 10'      },
  { value: 'bgs10',    label: 'BGS 10'      },
]

const CARD_BACK_URL = 'https://images.pokemontcg.io/back.png'

function SuggestionThumb({ card }) {
  const [imgSrc, onImgError] = useCardImage(card.image_url, { name: card.name, number: card.card_number, lang: card.language })
  return imgSrc
    ? <img src={imgSrc} alt={card.name} onError={onImgError} className="w-6 h-8 object-cover rounded shadow-sm bg-gray-100 shrink-0" />
    : <img src={CARD_BACK_URL} alt="" className="w-6 h-8 object-cover rounded shrink-0 opacity-50 bg-gray-100" />
}

const normLang = (idioma) => {
  if (['ja', 'jp', 'japanese'].includes(idioma)) return 'jp'
  if (['zh', 'cn', 'chinese'].includes(idioma))  return 'cn'
  return 'en'
}

/* ─── Formatters ─────────────────────────────────────────────────────────── */
const fmtARS = (n) =>
  n != null && n !== '' ? `$${Number(n).toLocaleString('es-AR', { maximumFractionDigits: 0 })}` : '—'
const fmtUSD = (n) =>
  n != null && n !== '' ? `U$D ${Number(n).toLocaleString('en', { maximumFractionDigits: 2, minimumFractionDigits: 2 })}` : '—'


const detectFirstEdition = (card) => {
  // Subtipo explícito en la API
  if (card.subtypes?.includes('1st Edition'))
    return { detected: true, possible: true, reason: 'Detectado por la API ✓' }
  // TCGplayer tiene precio específico de 1ª ed
  if (card.has_first_ed_price)
    return { detected: false, possible: true, reason: 'Set con 1ª edición disponible' }
  // Set WotC clásico
  if (FIRST_ED_SETS.some(s => (card.set_name || '').includes(s)))
    return { detected: false, possible: true, reason: 'Set que tuvo 1ª edición' }
  return { detected: false, possible: false, reason: '' }
}

/* ─── Enriquecer sugerencias con precios PC (batch desde price_history) ──── */
async function enrichSuggestionsWithPCPrices(suggestions, lang = 'en') {
  if (!suggestions.length) return suggestions
  const names = [...new Set(suggestions.map(s => s.name).filter(Boolean))]
  if (!names.length) return suggestions

  // Buscar card_ids en Supabase por nombre + idioma
  const { data: cards } = await supabase
    .from('cards')
    .select('id, name, card_number, set_name')
    .in('name', names)
    .eq('language', lang)
    .limit(100)

  const cardList = cards ?? []

  // Fallback ilike para los que no matchearon exacto
  const matched  = new Set(cardList.map(c => c.name.toLowerCase()))
  const missing  = names.filter(n => !matched.has(n.toLowerCase()))
  if (missing.length > 0) {
    for (const nm of missing.slice(0, 5)) {
      const { data: like } = await supabase
        .from('cards')
        .select('id, name, card_number, set_name')
        .ilike('name', `%${nm}%`)
        .eq('language', lang)
        .limit(3)
      if (like?.length) cardList.push(...like)
    }
  }

  if (!cardList.length) return suggestions

  // Batch query price_history
  const ids = cardList.map(c => c.id)
  const { data: prices } = await supabase
    .from('price_history')
    .select('card_id, price_usd')
    .in('card_id', ids)
    .eq('source', 'pricecharting')
    .eq('grade', 'ungraded')
    .order('snapshot_date', { ascending: false })

  // Construir map: card_id → price
  const priceById = {}
  for (const p of (prices ?? [])) {
    if (!priceById[p.card_id]) priceById[p.card_id] = p.price_usd
  }

  // Mapas de matching
  const byNameNum  = {}   // "nombre|numero" → price_usd
  const byName     = {}   // "nombre" → price_usd
  for (const c of cardList) {
    const prc = priceById[c.id]
    if (!prc) continue
    const key = c.name.toLowerCase()
    const numKey = `${key}|${(c.card_number || '').toLowerCase()}`
    byNameNum[numKey] = prc
    if (!byName[key]) byName[key] = prc
  }

  return suggestions.map(s => {
    const key    = (s.name || '').toLowerCase()
    const numKey = `${key}|${(s.card_number || '').toLowerCase()}`
    const pcPrice = byNameNum[numKey] ?? byName[key]
    if (pcPrice) return { ...s, price_usd: pcPrice, source_price: 'pc' }
    return s
  })
}

/* ─── Fila vacía ──────────────────────────────────────────────────────────── */
const emptyRow = () => ({
  _key:             crypto.randomUUID(),
  card_id:          null,
  card_name:        '',
  set_name:         '',
  set_id:           null,   // id de la API ("sv3pt5", "base1"…)
  language:         'en',
  is_first_edition: false,
  can_be_first_ed:  false,
  first_ed_reason:  '',
  finish:           'normal',
  grade:            'ungraded',
  quantity:         1,
  condition:        'NM',
  price_usd:        '',      // costo real pagado (entrada manual)
  price_ars:        '',      // = price_usd × blue (auto)
  price_market_usd: null,    // precio PC de referencia (informativo)
  suggestions:      [],
  searching:        false,
  _setCards:        [],       // cartas preloadeadas del set seleccionado
})

/* ─── Debounce ────────────────────────────────────────────────────────────── */
function useDebounce(fn, delay) {
  const timer = useRef(null)
  return useCallback((...args) => {
    clearTimeout(timer.current)
    timer.current = setTimeout(() => fn(...args), delay)
  }, [fn, delay])
}

/* ══════════════════════════════════════════════════════════════════════════ */
export default function RegistrarCompraModal({ onClose, onDone }) {
  const { blue } = useDolar()

  const [vendor,    setVendor]    = useState('')
  const [fecha,     setFecha]     = useState(new Date().toISOString().slice(0, 10))
  const [estado,    setEstado]    = useState('pagada')
  const [notas,     setNotas]     = useState('')
  const [rows,      setRows]      = useState([emptyRow()])
  const [saving,    setSaving]    = useState(false)
  const [errors,    setErrors]    = useState({})
  const [showConfirm, setShowConfirm] = useState(false)

  const totalUSD = rows.reduce((s, r) => s + (parseFloat(r.price_usd) || 0) * (r.quantity || 1), 0)
  const totalARS = rows.reduce((s, r) => s + (parseFloat(r.price_ars) || 0) * (r.quantity || 1), 0)

  /* ── Validación ────────────────────────────────────────────────────────── */
  const validate = () => {
    const e = {}
    if (!vendor.trim()) e.vendor = 'Requerido'
    if (!fecha)         e.fecha  = 'Requerido'
    const hasCard = rows.some(r => r.card_id || r._market)
    if (!hasCard) e.rows = 'Agregá al menos una carta con nombre válido'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  /* ── Buscar cartas ─────────────────────────────────────────────────────── */
  const searchCards = async (query, key, language = 'en') => {
    if (!query || query.length < 2) {
      updateRow(key, { suggestions: [], searching: false })
      return
    }
    updateRow(key, { searching: true })

    const lang = normLang(language)

    const [tcgCards, dbRes] = await Promise.allSettled([
      lang === 'en' ? searchCardsByName(query, 25) : Promise.resolve({ results: [] }),
      supabase.from('cards').select('id, name, image_url, set_name, card_number, language')
        .ilike('name', `%${query}%`)
        .eq('language', lang)
        .limit(8),
    ])

    const fromTcg = tcgCards.status === 'fulfilled' ? (tcgCards.value?.results ?? []) : []
    const fromDb  = dbRes.status === 'fulfilled'
      ? (dbRes.value?.data ?? []).map(c => ({
          id: c.id, name: c.name, set_name: c.set_name || null,
          card_number: c.card_number, image_url: c.image_url,
          price_usd: null, source: 'stock',
          subtypes: [], has_first_ed_price: false,
        }))
      : []

    // Para JP/CN, buscar en scanner backend
    let fromScanner = []
    if (lang !== 'en') {
      try {
        const res = await scannerApi.buscar(query, lang, null, 20)
        fromScanner = (res?.results ?? []).map(c => ({
          name: c.nombre || c.name, set_name: c.set_name || c.set,
          card_number: c.numero || c.number, image_url: c.imagen || c.image_url,
          price_usd: null, source: 'scanner', subtypes: [], has_first_ed_price: false,
        }))
      } catch (_) {}
    }

    const seen = new Set()
    const merged = [...fromDb, ...fromTcg, ...fromScanner].filter(c => {
      const k = `${c.name?.toLowerCase()}|${(c.set_name || '').toLowerCase()}`
      if (seen.has(k)) return false
      seen.add(k)
      return true
    })

    // Enriquecer con precios PC en background
    const enriched = await enrichSuggestionsWithPCPrices(merged, lang)
    updateRow(key, { suggestions: enriched, searching: false })
  }

  const debouncedSearch = useDebounce((q, key, lang) => searchCards(q, key, lang), 150)

  /* ── Preload de cartas del set seleccionado ────────────────────────────── */
  const preloadSetCards = async (setId, language, key) => {
    if (!setId) return
    const lang = normLang(language)
    updateRow(key, { searching: true, _setCards: [] })
    try {
      let mapped = []
      if (lang === 'en') {
        const cards = await fetchCardsBySet(setId)
        mapped = cards.map(c => ({
          name:               c.name,
          set_name:           c.set_name,
          set_id:             c.set_id || setId,
          card_number:        c.card_number,
          image_url:          c.image_url,
          price_usd:          c.price_usd,
          subtypes:           c.subtypes || [],
          has_first_ed_price: c.has_first_ed_price || false,
          source:             'tcg',
        }))
      } else {
        const res = await scannerApi.buscar('', lang, setId, 200)
        mapped = (res?.results ?? []).map(c => ({
          name:               c.nombre || c.name,
          set_name:           c.set_name || c.set,
          set_id:             setId,
          card_number:        c.numero  || c.number,
          image_url:          c.imagen  || c.image_url,
          price_usd:          null,
          subtypes:           [],
          has_first_ed_price: false,
          source:             'scanner',
        }))
      }
      updateRow(key, { _setCards: mapped, searching: false })
    } catch (_) {
      updateRow(key, { searching: false })
    }
  }

  /* ── Helpers de filas ──────────────────────────────────────────────────── */
  const updateRow = (key, patch) =>
    setRows(prev => prev.map(r => r._key === key ? { ...r, ...patch } : r))

  const removeRow = (key) =>
    setRows(prev => prev.filter(r => r._key !== key))

  const addRow = () =>
    setRows(prev => [...prev, emptyRow()])

  const selectCard = async (key, card, language = 'en', grade = 'ungraded') => {
    const firstEd = detectFirstEdition(card)
    const isStockCard = card.source === 'stock' && card.id

    // PC reference price (si ya vino enriquecida del dropdown)
    const marketUsd = card.source_price === 'pc' && card.price_usd
      ? parseFloat(card.price_usd)
      : null

    updateRow(key, {
      card_id:          isStockCard ? card.id : null,
      card_name:        card.name,
      set_name:         card.set_name || '',
      set_id:           card.set_id   || null,
      _market:          isStockCard ? null : card,
      price_usd:        '',              // usuario ingresa el costo real
      price_ars:        '',
      price_market_usd: marketUsd,
      is_first_edition: firstEd.detected,
      can_be_first_ed:  firstEd.possible,
      first_ed_reason:  firstEd.reason,
      suggestions:      [],
    })

    // Si no hay precio PC referencia, buscar on-demand
    if (!marketUsd && card.name) {
      try {
        const lang = normLang(language)
        const params = new URLSearchParams({ name: card.name, lang, grade })
        if (card.card_number) params.set('number',   card.card_number)
        if (card.set_name)    params.set('set_name', card.set_name)
        if (isStockCard)      params.set('card_id',  card.id)

        const res = await fetch(`${BACKEND}/card-price?${params}`)
        if (res.ok) {
          const json = await res.json()
          if (json.price_usd) {
            updateRow(key, { price_market_usd: json.price_usd })
          }
        }
      } catch (_) {}
    }
  }

  /* ── Submit ────────────────────────────────────────────────────────────── */
  const handleSubmit = async () => {
    if (!validate()) return
    setSaving(true)
    try {
      // 1. Insertar purchase
      const { data: purchase, error: errP } = await supabase
        .from('purchases')
        .insert({
          store_id:       STORE_ID,
          vendor_name:    vendor.trim(),
          purchased_at:   fecha,
          total_usd:      totalUSD || null,
          total_ars:      totalARS || null,
          payment_status: estado,
          notes:          notas.trim() || null,
        })
        .select('id')
        .single()

      if (errP) throw errP

      // 2. Resolver card_id para filas que vinieron de la API
      for (const r of rows) {
        if (!r.card_id && r._market) {
          const m = r._market

          const cardFinish = r.finish || 'normal'
          const { data: existing } = await supabase
            .from('cards')
            .select('id')
            .ilike('name', m.name)
            .eq('set_name', m.set_name || '')
            .eq('finish', cardFinish)
            .maybeSingle()

          if (existing) {
            r.card_id = existing.id
          } else {
            const { data: newCard } = await supabase
              .from('cards')
              .insert({
                name:        m.name,
                set_name:    m.set_name    || null,
                card_number: m.card_number || null,
                image_url:   m.image_url   || null,
                language:    r.language    || 'en',
                finish:      cardFinish,
                variant:     r.finish !== 'normal' ? r.finish : (r.is_first_edition ? 'first_edition' : 'normal'),
              })
              .select('id')
              .single()
            if (newCard) r.card_id = newCard.id
          }
        }
      }

      // 3. Insertar purchase_items
      const validRows = rows.filter(r => r.card_id)
      if (validRows.length > 0) {
        const items = validRows.map(r => ({
          purchase_id:      purchase.id,
          card_id:          r.card_id,
          quantity:         r.quantity || 1,
          condition:        r.condition || 'NM',
          finish:           r.finish || 'normal',
          grade:            r.grade || 'ungraded',
          price_usd:        parseFloat(r.price_usd) || null,     // costo real pagado
          price_ars:        parseFloat(r.price_ars) || null,
          price_market_usd: r.price_market_usd || null,          // precio PC referencia
        }))

        const { error: errI } = await supabase.from('purchase_items').insert(items)
        if (errI) throw errI

        // 4. Upsert inventory — price_usd = precio PC de mercado (no el costo)
        for (const r of validRows) {
          const grade = r.grade || 'ungraded'
          const { data: existing } = await supabase
            .from('inventory')
            .select('id, quantity')
            .eq('store_id', STORE_ID)
            .eq('card_id', r.card_id)
            .eq('condition', r.condition || 'NM')
            .eq('finish', r.finish || 'normal')
            .eq('grade', grade)
            .eq('status', 'disponible')
            .maybeSingle()

          if (existing) {
            await supabase
              .from('inventory')
              .update({ quantity: (existing.quantity || 1) + (r.quantity || 1) })
              .eq('id', existing.id)
          } else {
            const mktUsd = r.price_market_usd || null
            const arsBlue = (mktUsd && blue) ? Math.round(mktUsd * blue) : null
            await supabase
              .from('inventory')
              .insert({
                store_id:         STORE_ID,
                card_id:          r.card_id,
                quantity:         r.quantity || 1,
                condition:        r.condition || 'NM',
                condicion:        r.condition || 'NM',
                finish:           r.finish || 'normal',
                holo:             ['holofoil','reverse_holo','gold_star'].includes(r.finish),
                grade,
                status:           'disponible',
                estado:           'disponible',
                price_usd:        mktUsd,        // precio PC mercado, null si no hay
                price_ars_blue:   arsBlue,
                scan_date:        new Date().toISOString(),
              })
          }
        }
      }

      onDone?.()
      onClose()
    } catch (err) {
      console.error('[RegistrarCompra]', err)
      setErrors({ submit: err.message || 'Error al guardar' })
      setSaving(false)
    }
  }

  /* ── Render ─────────────────────────────────────────────────────────────── */
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <h3 className="font-bold text-gray-800">📦 Registrar compra</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-2xl leading-none">×</button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">

          {/* Encabezado */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-gray-500 mb-1">
                Vendedor / Origen <span className="text-red-400">*</span>
              </label>
              <input
                type="text" value={vendor}
                onChange={e => { setVendor(e.target.value); setErrors(x => ({...x, vendor: null})) }}
                placeholder="Ej: TCG Argentina"
                className={`w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300
                  ${errors.vendor ? 'border-red-400 bg-red-50' : 'border-gray-200 bg-white'}`}
              />
              {errors.vendor && <p className="text-red-500 text-xs mt-0.5">{errors.vendor}</p>}
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">
                Fecha <span className="text-red-400">*</span>
              </label>
              <input type="date" value={fecha} onChange={e => setFecha(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white
                           focus:outline-none focus:ring-2 focus:ring-blue-300" />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Estado de pago</label>
              <select value={estado} onChange={e => setEstado(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white
                           focus:outline-none focus:ring-2 focus:ring-blue-300 cursor-pointer">
                <option value="pagada">Pagada</option>
                <option value="pendiente">Pendiente</option>
                <option value="deuda parcial">Deuda parcial</option>
                <option value="deuda">Deuda</option>
              </select>
            </div>
          </div>

          {/* Notas */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Notas (opcional)</label>
            <textarea value={notas} onChange={e => setNotas(e.target.value)}
              rows={2} placeholder="Observaciones, condiciones del vendedor, etc."
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white
                         focus:outline-none focus:ring-2 focus:ring-blue-300 resize-none" />
          </div>

          {/* Tabla de cartas */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-gray-500">
                Cartas compradas <span className="text-red-400">*</span>
              </label>
              <button onClick={addRow} className="text-xs text-blue-600 font-semibold hover:underline">
                + Añadir fila
              </button>
            </div>
            {errors.rows && <p className="text-red-500 text-xs mb-2">{errors.rows}</p>}

            <div className="border border-gray-200 rounded-xl overflow-visible divide-y divide-gray-100">
              {/* Encabezados de columnas */}
              <div className="grid grid-cols-[2fr_72px_64px_88px_88px_28px] gap-2 px-3 py-1.5 bg-gray-50 rounded-t-xl">
                <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Carta</span>
                <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Cond.</span>
                <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide text-center">Cant.</span>
                <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide text-right">USD</span>
                <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide text-right">ARS</span>
                <span />
              </div>
              {rows.map((row) => (
                <CardRow
                  key={row._key}
                  row={row}
                  isLast={rows.length === 1}
                  onChange={patch => updateRow(row._key, patch)}
                  onSearch={q => debouncedSearch(q, row._key, row.language)}
                  onSelect={(card, lang, grade) => selectCard(row._key, card, lang ?? row.language, grade ?? row.grade)}
                  onRemove={() => removeRow(row._key)}
                  onPreload={(setId, lang) => preloadSetCards(setId, lang, row._key)}
                />
              ))}
            </div>
          </div>

          {/* Resumen */}
          <div className="grid grid-cols-3 gap-3 bg-gray-50 rounded-xl p-4">
            <div className="text-center">
              <p className="text-xs text-gray-400 mb-0.5">Cartas</p>
              <p className="font-bold text-gray-800">
                {rows.filter(r => r.card_id || r._market).reduce((s, r) => s + (r.quantity || 1), 0)}
              </p>
            </div>
            <div className="text-center">
              <p className="text-xs text-gray-400 mb-0.5">Total USD</p>
              <p className="font-bold text-emerald-600">{fmtUSD(totalUSD)}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-gray-400 mb-0.5">Total ARS</p>
              <p className="font-bold text-blue-600">{fmtARS(totalARS)}</p>
            </div>
          </div>

          {errors.submit && (
            <p className="text-red-500 text-sm bg-red-50 rounded-xl px-4 py-3">{errors.submit}</p>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-100 shrink-0 flex items-center justify-between gap-3">
          <button onClick={onClose} disabled={saving}
            className="px-4 py-2 bg-gray-100 text-gray-600 text-sm font-medium rounded-xl
                       hover:bg-gray-200 transition disabled:opacity-50">
            Cancelar
          </button>

          {showConfirm ? (
            <div className="flex items-center gap-3">
              <p className="text-sm text-gray-600 font-medium">¿Confirmar registro?</p>
              <button onClick={() => setShowConfirm(false)}
                className="px-3 py-1.5 bg-gray-100 text-gray-600 text-sm font-medium rounded-xl hover:bg-gray-200 transition">
                No
              </button>
              <button onClick={handleSubmit} disabled={saving}
                className="px-4 py-2 bg-blue-600 text-white text-sm font-bold rounded-xl
                           hover:bg-blue-500 disabled:opacity-50 transition flex items-center gap-2">
                {saving && <Spinner size={14} className="text-white" />}
                {saving ? 'Guardando…' : 'Sí, registrar'}
              </button>
            </div>
          ) : (
            <button onClick={() => { if (validate()) setShowConfirm(true) }} disabled={saving}
              className="px-5 py-2 bg-blue-600 text-white text-sm font-bold rounded-xl
                         hover:bg-blue-500 disabled:opacity-50 transition">
              Registrar compra →
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════════════
   CardRow — fila con autocomplete + set + idioma + 1ª edición
══════════════════════════════════════════════════════════════════════════ */
const IDIOMA_FLAG = { en: '🇬🇧', es: '🇪🇸', ja: '🇯🇵', fr: '🇫🇷', de: '🇩🇪', pt: '🇧🇷' }

function CardRow({ row, isLast, onChange, onSearch, onSelect, onRemove, onPreload, onGradeChange }) {
  const wrapRef    = useRef(null)
  const numTimer   = useRef(null)
  const [numInput,   setNumInput]   = useState(row.card_number || '')
  const [pcUrl,      setPcUrl]      = useState('')
  const [pcLoading,  setPcLoading]  = useState(false)

  const handlePcUrl = async (url) => {
    setPcUrl(url)
    if (!url.includes('pricecharting.com/game/')) return
    setPcLoading(true)
    try {
      const result = await scannerApi.resolvePcUrl(url)
      if (!result || result.error) return
      onChange({
        card_name:        result.name        || row.card_name,
        set_name:         result.set_name    || row.set_name,
        set_id:           null,
        card_number:      result.card_number || row.card_number,
        language:         result.lang        || row.language,
        price_market_usd: result.price_usd   ?? row.price_market_usd,
        price_usd:        result.price_buy_usd != null
                            ? String(result.price_buy_usd)
                            : (result.price_usd != null ? String(result.price_usd) : row.price_usd),
        suggestions:      [],
        _setCards:        [],
      })
      if (result.card_number) setNumInput(result.card_number)
      setPcUrl('')
    } finally {
      setPcLoading(false)
    }
  }

  // Cerrar sugerencias al click fuera
  useEffect(() => {
    const close = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target))
        onChange({ suggestions: [] })
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  // ── Cuando se escribe un número con set seleccionado → buscar esa carta ──
  const handleNumberChange = (val) => {
    setNumInput(val)
    if (!row.set_id || !val.trim()) return
    clearTimeout(numTimer.current)
    numTimer.current = setTimeout(async () => {
      onChange({ searching: true })
      const card = await fetchCardBySetAndNumber(row.set_id, val.trim())
      onChange({ searching: false })
      if (card) onSelect(card)
    }, 400)
  }

  // ── Al hacer focus en nombre con set ya elegido → cargas instantáneas ───
  const handleNameFocus = async () => {
    if (row.card_id) return
    // Preloaded → mostrar al instante (0ms)
    if (row._setCards?.length > 0) {
      const q = row.card_name.trim().toLowerCase()
      const filtered = q
        ? row._setCards.filter(c =>
            c.name?.toLowerCase().includes(q) ||
            c.card_number?.toLowerCase()?.startsWith(q)
          ).slice(0, 60)
        : row._setCards.slice(0, 60)
      if (filtered.length > 0) { onChange({ suggestions: filtered }); return }
    }
    if (!row.set_id) return
    if (row.suggestions.length > 0) return
    // Fallback: fetch de la API si el preload todavía no terminó
    onChange({ searching: true, suggestions: [] })
    const cards = await fetchCardsBySet(row.set_id)
    onChange({ searching: false, suggestions: cards.slice(0, 80) })
  }

  // ── Búsqueda por nombre (con o sin set) ──────────────────────────────────
  const handleNameChange = (val) => {
    onChange({ card_name: val, card_id: null })

    if (!val.trim() || val.length < 2) {
      // Si hay cartas preloadeadas del set, mostrarlas todas (no ocultar el dropdown)
      if (row._setCards?.length > 0 && row.set_id) {
        onChange({ suggestions: row._setCards.slice(0, 60) })
      } else {
        onChange({ suggestions: [] })
      }
      return
    }

    // Filtro instantáneo desde caché si el set está preloadeado
    if (row._setCards?.length > 0) {
      const q = val.trim().toLowerCase()
      const filtered = row._setCards.filter(c =>
        c.name?.toLowerCase().includes(q) ||
        c.card_number?.toLowerCase()?.startsWith(q)
      ).slice(0, 60)
      onChange({ suggestions: filtered })
      return
    }

    if (row.set_id) {
      // Fallback: fetch del set con filtro (si el preload aún no terminó)
      onChange({ searching: true })
      fetchCardsBySet(row.set_id, val.trim()).then(cards => {
        onChange({ searching: false, suggestions: cards.slice(0, 60) })
      })
    } else {
      onSearch(val)   // búsqueda global sin set → debounced 150ms
    }
  }

  return (
    <div className="px-3 py-2.5 space-y-2">

      {/* ── PC URL ──────────────────────────────────────────────────────── */}
      <div className="relative">
        <input
          value={pcUrl}
          onChange={e => handlePcUrl(e.target.value)}
          placeholder="Pegá URL de PriceCharting para autocompletar…"
          className="w-full border border-gray-100 bg-gray-50 rounded-lg px-2.5 py-1.5 text-[11px] text-gray-500
                     focus:outline-none focus:ring-2 focus:ring-blue-200 focus:bg-white transition pr-7"
        />
        {pcLoading && (
          <div className="absolute right-2.5 top-2">
            <div className="w-3.5 h-3.5 border-2 border-blue-300 border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </div>

      {/* ── Fila 1: Carta | Cond | Qty | USD | ARS | × ─────────────────── */}
      <div className="grid grid-cols-[2fr_72px_64px_88px_88px_28px] gap-2 items-center">

        {/* Carta con autocomplete */}
        <div ref={wrapRef} className="relative">
          <div className="flex items-center gap-1.5">
            {row.card_id && <span className="text-emerald-500 text-xs shrink-0">✓</span>}
            <input
              type="text" value={row.card_name}
              onFocus={handleNameFocus}
              onChange={e => handleNameChange(e.target.value)}
              placeholder={row.set_id ? 'Buscar en el set…' : 'Buscar carta…'}
              className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs bg-white
                         focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
            {row.searching && <Spinner size={12} className="text-gray-400 shrink-0" />}
          </div>

          {row.suggestions.length > 0 && (
            <div className="absolute top-full left-0 z-[70] mt-1 bg-white border border-gray-200
                            rounded-xl shadow-xl max-h-64 overflow-y-auto"
                 style={{ minWidth: '260px', width: 'max-content', maxWidth: '420px' }}>
              {row.suggestions.map((card, idx) => {
                const fe = detectFirstEdition(card)
                return (
                  <button key={`${card.id || card.name}|${idx}`}
                    onClick={() => { onSelect(card, row.language, row.grade); onChange({ suggestions: [] }) }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-left text-xs hover:bg-blue-50 transition">
                    <SuggestionThumb card={card} />
                    <div className="flex-1 min-w-0">
                      <span className="font-medium text-gray-800 leading-tight line-clamp-1">{card.name}</span>
                      <span className="block text-gray-400 leading-tight truncate">
                        {[card.set_name, card.card_number ? `#${card.card_number}` : null].filter(Boolean).join(' · ')}
                      </span>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        {card.price_usd && (
                          <span className={`font-bold text-[10px] ${card.source_price === 'pc' ? 'text-emerald-600' : 'text-blue-600'}`}>
                            U$D {parseFloat(card.price_usd).toFixed(2)}
                          </span>
                        )}
                        {card.source_price === 'pc' && (
                          <span className="text-[9px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded font-bold">PC</span>
                        )}
                        {fe.possible && (
                          <span className="text-[9px] bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded font-semibold">
                            {fe.detected ? '★ 1ª Ed' : '1ª Ed posible'}
                          </span>
                        )}
                      </div>
                    </div>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded font-semibold shrink-0
                      ${card.source === 'stock' ? 'bg-gray-100 text-gray-500' : 'bg-blue-100 text-blue-600'}`}>
                      {card.card_number ? `#${card.card_number}` : (card.source === 'stock' ? 'stock' : 'tcg')}
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Finish / Variante */}
        <FinishSelect
          value={row.finish || 'normal'}
          onChange={v => onChange({ finish: v })}
          size="sm"
        />

        {/* Condición */}
        <select value={row.condition} onChange={e => onChange({ condition: e.target.value })}
          className="border border-gray-200 rounded-lg px-1.5 py-1.5 text-xs bg-white
                     focus:outline-none focus:ring-2 focus:ring-blue-200 cursor-pointer">
          {CONDICIONES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>

        {/* Cantidad */}
        <input type="number" min="1" value={row.quantity}
          onChange={e => onChange({ quantity: Math.max(1, parseInt(e.target.value) || 1) })}
          className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs bg-white text-center
                     focus:outline-none focus:ring-2 focus:ring-blue-200" />

        {/* USD */}
        <input type="number" min="0" step="0.01" value={row.price_usd}
          onChange={e => onChange({ price_usd: e.target.value })}
          placeholder="0.00"
          className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs bg-white text-right
                     focus:outline-none focus:ring-2 focus:ring-blue-200" />

        {/* ARS */}
        <input type="number" min="0" value={row.price_ars}
          onChange={e => onChange({ price_ars: e.target.value })}
          placeholder="0"
          className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs bg-white text-right
                     focus:outline-none focus:ring-2 focus:ring-blue-200" />

        {/* Eliminar */}
        <button onClick={onRemove} disabled={isLast}
          className="text-gray-300 hover:text-red-400 transition disabled:opacity-20 text-sm leading-none">
          ✕
        </button>
      </div>

      {/* ── Fila 2: Set | Nº | Idioma | 1ª Edición ─────────────────────── */}
      <div className="flex flex-wrap items-center gap-2 pl-1">

        {/* Set — desplegable con todos los sets */}
        <div className="flex items-center gap-1.5 flex-1 min-w-[200px]">
          <span className="text-[10px] font-semibold text-gray-400 shrink-0 uppercase tracking-wide">Set</span>
          <SetSelect
            value={row.set_name}
            setId={row.set_id}
            onChange={patch => {
              onChange({ ...patch, _setCards: [], suggestions: [] })
              if (patch.set_id) onPreload(patch.set_id, row.language)
            }}
            className="flex-1 min-w-[160px]"
            size="sm"
          />
        </div>

        {/* Número — cuando hay set, busca la carta exacta */}
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-semibold text-gray-400 shrink-0 uppercase tracking-wide">Nº</span>
          <input
            type="text"
            value={numInput}
            onChange={e => handleNumberChange(e.target.value)}
            placeholder={row.set_id ? '1, TG30…' : '—'}
            disabled={!row.set_id}
            className="w-16 border border-gray-100 bg-gray-50 rounded-lg px-2 py-1 text-xs text-center
                       focus:outline-none focus:ring-2 focus:ring-blue-200 focus:bg-white transition
                       disabled:opacity-40 disabled:cursor-not-allowed"
          />
        </div>

        {/* Idioma */}
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-semibold text-gray-400 shrink-0 uppercase tracking-wide">Idioma</span>
          <select
            value={row.language}
            onChange={e => {
              const newLang = e.target.value
              onChange({ language: newLang, _setCards: [], suggestions: [] })
              if (row.set_id) onPreload(row.set_id, newLang)
            }}
            className="border border-gray-100 bg-gray-50 rounded-lg px-2 py-1 text-xs
                       focus:outline-none focus:ring-2 focus:ring-blue-200 cursor-pointer"
          >
            {IDIOMAS.map(i => (
              <option key={i.code} value={i.code}>{IDIOMA_FLAG[i.code]} {i.label}</option>
            ))}
          </select>
        </div>

        {/* 1ª Edición */}
        {(row.can_be_first_ed || row.is_first_edition) && (
          <button
            type="button"
            onClick={() => onChange({ is_first_edition: !row.is_first_edition })}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold
              border transition select-none
              ${row.is_first_edition
                ? 'bg-yellow-400 border-yellow-500 text-yellow-900'
                : 'bg-gray-100 border-gray-200 text-gray-500 hover:bg-yellow-50 hover:border-yellow-300'}`}
            title={row.first_ed_reason}
          >
            ★ 1ª Ed
            {row.is_first_edition
              ? <span className="text-yellow-800 text-[10px]">✓</span>
              : <span className="text-gray-400 text-[10px]">○</span>
            }
          </button>
        )}
      </div>

      {/* ── Fila 3: Grado + Badge precio PC referencia ─────────────────── */}
      <div className="flex flex-wrap items-center gap-2 pl-1">
        <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide shrink-0">Grado</span>
        {GRADE_OPTIONS.map(g => (
          <button
            key={g.value}
            type="button"
            onClick={() => {
              onChange({ grade: g.value })
              // Re-fetch precio PC referencia para el nuevo grado
              if (row.card_name) {
                const params = new URLSearchParams({ name: row.card_name, lang: normLang(row.language), finish: row.finish || 'normal', grade: g.value })
                if (row.set_name)    params.set('set_name', row.set_name)
                if (row.card_number) params.set('number', row.card_number)
                fetch(`${BACKEND}/card-price?${params}`)
                  .then(r => r.ok ? r.json() : null)
                  .then(json => {
                    if (json?.price_usd) onChange({ price_market_usd: json.price_usd })
                    else onChange({ price_market_usd: null })
                  })
                  .catch(() => {})
              }
            }}
            className={`px-2 py-0.5 rounded-lg text-[10px] font-semibold border transition
              ${row.grade === g.value
                ? 'bg-slate-800 text-white border-slate-800'
                : 'bg-gray-50 text-gray-500 border-gray-200 hover:border-gray-400'}`}
          >
            {g.label}
          </button>
        ))}

        {/* Badge precio PC referencia */}
        {row.price_market_usd != null && (
          <span className="inline-flex items-center gap-1 text-[10px] bg-emerald-50 text-emerald-700
                           border border-emerald-200 px-2 py-0.5 rounded-full font-semibold">
            ● Mercado PC: U$D {Number(row.price_market_usd).toFixed(2)}
          </span>
        )}
      </div>
    </div>
  )
}
