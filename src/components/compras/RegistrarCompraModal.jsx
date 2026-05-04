import { useState, useRef, useEffect, useCallback } from 'react'
import { supabase }           from '../../lib/supabase'
import { searchCardsByName }  from '../../lib/pokemonTcg'
import { useDolar }           from '../../hooks/useDolar'
import { STORE_ID, CONDICIONES } from '../../constants'
import Spinner from '../ui/Spinner'

/* ─── Formatters ──────────────────────────────────────────────────────── */
const fmtARS = (n) =>
  n != null && n !== '' ? `$${Number(n).toLocaleString('es-AR', { maximumFractionDigits: 0 })}` : '—'
const fmtUSD = (n) =>
  n != null && n !== '' ? `U$D ${Number(n).toLocaleString('en', { maximumFractionDigits: 2, minimumFractionDigits: 2 })}` : '—'

/* ─── Fila vacía ──────────────────────────────────────────────────────── */
const emptyRow = () => ({
  _key:      crypto.randomUUID(),
  card_id:   null,
  card_name: '',
  quantity:  1,
  condition: 'NM',
  price_usd: '',
  price_ars: '',
  // autocomplete state
  suggestions: [],
  searching:   false,
})

/* ─── Debounce helper ─────────────────────────────────────────────────── */
function useDebounce(fn, delay) {
  const timer = useRef(null)
  return useCallback((...args) => {
    clearTimeout(timer.current)
    timer.current = setTimeout(() => fn(...args), delay)
  }, [fn, delay])
}

/* ═══════════════════════════════════════════════════════════════════════ */
export default function RegistrarCompraModal({ onClose, onDone }) {
  const { blue } = useDolar()

  /* ── Campos del encabezado ─────────────────────────────────────────── */
  const [vendor,    setVendor]    = useState('')
  const [fecha,     setFecha]     = useState(new Date().toISOString().slice(0, 10))
  const [estado,    setEstado]    = useState('pagada')
  const [notas,     setNotas]     = useState('')

  /* ── Filas de cartas ───────────────────────────────────────────────── */
  const [rows, setRows] = useState([emptyRow()])

  /* ── UI state ──────────────────────────────────────────────────────── */
  const [saving,       setSaving]       = useState(false)
  const [errors,       setErrors]       = useState({})
  const [showConfirm,  setShowConfirm]  = useState(false)

  /* ── Totales calculados ────────────────────────────────────────────── */
  const totalUSD = rows.reduce((s, r) => s + (parseFloat(r.price_usd) || 0) * (r.quantity || 1), 0)
  const totalARS = rows.reduce((s, r) => s + (parseFloat(r.price_ars) || 0) * (r.quantity || 1), 0)

  /* ── Validación ────────────────────────────────────────────────────── */
  const validate = () => {
    const e = {}
    if (!vendor.trim()) e.vendor = 'Requerido'
    if (!fecha)         e.fecha  = 'Requerido'
    const hasCard = rows.some(r => r.card_id || r._market)
    if (!hasCard) e.rows = 'Agregá al menos una carta con nombre válido'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  /* ── Buscar cartas (PokémonTCG API + Supabase stock) ───────────────── */
  const searchCards = async (query, key) => {
    if (!query || query.length < 2) {
      updateRow(key, { suggestions: [], searching: false })
      return
    }
    updateRow(key, { searching: true })

    const [tcgCards, dbRes] = await Promise.allSettled([
      searchCardsByName(query, 25),   // hasta 25 resultados de la API pública
      supabase.from('cards').select('id, name, image_url, set_name').ilike('name', `%${query}%`).limit(8),
    ])

    // Resultados de PokémonTCG (muchos, con set + precio)
    const fromTcg = tcgCards.status === 'fulfilled' ? (tcgCards.value ?? []) : []

    // Resultados del stock propio (ya tienen card_id en Supabase)
    const fromDb = dbRes.status === 'fulfilled'
      ? (dbRes.value?.data ?? []).map(c => ({
          id:        c.id,
          name:      c.name,
          set_name:  c.set_name || null,
          image_url: c.image_url,
          price_usd: null,
          source:    'stock',
        }))
      : []

    // Unir: primero stock propio (ya tenemos el id), luego API
    // Deduplicar por nombre+set para no repetir
    const seen = new Set()
    const merged = [...fromDb, ...fromTcg].filter(c => {
      const k = `${c.name?.toLowerCase()}|${(c.set_name || '').toLowerCase()}`
      if (seen.has(k)) return false
      seen.add(k)
      return true
    })

    updateRow(key, { suggestions: merged, searching: false })
  }

  const debouncedSearch = useDebounce(searchCards, 300)

  /* ── Helpers de filas ──────────────────────────────────────────────── */
  const updateRow = (key, patch) =>
    setRows(prev => prev.map(r => r._key === key ? { ...r, ...patch } : r))

  const removeRow = (key) =>
    setRows(prev => prev.filter(r => r._key !== key))

  const addRow = () =>
    setRows(prev => [...prev, emptyRow()])

  const selectCard = (key, card) => {
    const usd = card.price_usd ? parseFloat(card.price_usd).toFixed(2) : ''
    const ars = usd && blue ? String(Math.round(parseFloat(usd) * blue)) : ''
    updateRow(key, {
      card_id:     card.id,    // puede ser null si viene de API, se resuelve al guardar
      card_name:   card.name,
      _market:     card,       // guardar para resolver card_id al guardar
      price_usd:   usd,
      price_ars:   ars,
      suggestions: [],
    })
  }

  /* ── Submit ────────────────────────────────────────────────────────── */
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

      // 1b. Resolver card_id para filas que vinieron de la API (no tienen id en Supabase aún)
      for (const r of rows) {
        if (!r.card_id && r._market) {
          const m = r._market
          // Buscar si ya existe
          const { data: existing } = await supabase
            .from('cards')
            .select('id')
            .ilike('name', m.name)
            .maybeSingle()

          if (existing) {
            r.card_id = existing.id
          } else {
            // Crear la carta
            const { data: newCard } = await supabase
              .from('cards')
              .insert({
                name:        m.name,
                set_name:    m.set_name   || null,
                card_number: m.card_number || null,
                image_url:   m.image_url  || null,
                language:    'en',
              })
              .select('id')
              .single()
            if (newCard) r.card_id = newCard.id
          }
        }
      }

      // 2. Insertar purchase_items (solo filas con card_id)
      const validRows = rows.filter(r => r.card_id)
      if (validRows.length > 0) {
        const items = validRows.map(r => ({
          purchase_id: purchase.id,
          card_id:     r.card_id,
          quantity:    r.quantity || 1,
          condition:   r.condition || 'NM',
          price_usd:   parseFloat(r.price_usd) || null,
          price_ars:   parseFloat(r.price_ars) || null,
        }))

        const { error: errI } = await supabase
          .from('purchase_items')
          .insert(items)

        if (errI) throw errI

        // 3. Upsert inventory: agregar al stock como "disponible"
        for (const r of validRows) {
          // Buscar si ya existe en inventory con mismo card_id, store, condition
          const { data: existing } = await supabase
            .from('inventory')
            .select('id, quantity')
            .eq('store_id', STORE_ID)
            .eq('card_id', r.card_id)
            .eq('condition', r.condition || 'NM')
            .eq('status', 'disponible')
            .maybeSingle()

          if (existing) {
            // Sumar al quantity existente
            await supabase
              .from('inventory')
              .update({ quantity: (existing.quantity || 1) + (r.quantity || 1) })
              .eq('id', existing.id)
          } else {
            // Crear nueva fila
            await supabase
              .from('inventory')
              .insert({
                store_id:       STORE_ID,
                card_id:        r.card_id,
                quantity:       r.quantity || 1,
                condition:      r.condition || 'NM',
                status:         'disponible',
                price_ars_blue: parseFloat(r.price_ars) || null,
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

  /* ── Render ────────────────────────────────────────────────────────── */
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col">

        {/* ── Header ─────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <h3 className="font-bold text-gray-800">📦 Registrar compra</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-2xl leading-none">×</button>
        </div>

        {/* ── Scroll body ─────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">

          {/* Campos del encabezado */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {/* Vendedor */}
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-gray-500 mb-1">
                Vendedor / Origen <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={vendor}
                onChange={e => { setVendor(e.target.value); setErrors(x => ({...x, vendor: null})) }}
                placeholder="Ej: TCG Argentina"
                className={`w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300
                  ${errors.vendor ? 'border-red-400 bg-red-50' : 'border-gray-200 bg-white'}`}
              />
              {errors.vendor && <p className="text-red-500 text-xs mt-0.5">{errors.vendor}</p>}
            </div>

            {/* Fecha */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">
                Fecha <span className="text-red-400">*</span>
              </label>
              <input
                type="date"
                value={fecha}
                onChange={e => setFecha(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white
                           focus:outline-none focus:ring-2 focus:ring-blue-300"
              />
            </div>

            {/* Estado de pago */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Estado de pago</label>
              <select
                value={estado}
                onChange={e => setEstado(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white
                           focus:outline-none focus:ring-2 focus:ring-blue-300 cursor-pointer"
              >
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
            <textarea
              value={notas}
              onChange={e => setNotas(e.target.value)}
              rows={2}
              placeholder="Observaciones, condiciones del vendedor, etc."
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white
                         focus:outline-none focus:ring-2 focus:ring-blue-300 resize-none"
            />
          </div>

          {/* ── Tabla de cartas ─────────────────────────────────────── */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-gray-500">
                Cartas compradas <span className="text-red-400">*</span>
              </label>
              <button
                onClick={addRow}
                className="text-xs text-blue-600 font-semibold hover:underline"
              >
                + Añadir fila
              </button>
            </div>
            {errors.rows && <p className="text-red-500 text-xs mb-2">{errors.rows}</p>}

            <div className="border border-gray-200 rounded-xl overflow-visible">
              {/* Header de tabla */}
              <div className="grid grid-cols-[2fr_80px_80px_90px_90px_32px] gap-2 bg-gray-50 px-3 py-2
                              text-xs font-semibold text-gray-400 uppercase border-b border-gray-200">
                <span>Carta</span>
                <span>Cond.</span>
                <span>Qty</span>
                <span>USD</span>
                <span>ARS</span>
                <span></span>
              </div>

              {/* Filas */}
              <div className="divide-y divide-gray-100">
                {rows.map((row, idx) => (
                  <CardRow
                    key={row._key}
                    row={row}
                    isLast={rows.length === 1}
                    onChange={patch => updateRow(row._key, patch)}
                    onSearch={q => debouncedSearch(q, row._key)}
                    onSelect={card => selectCard(row._key, card)}
                    onRemove={() => removeRow(row._key)}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* ── Resumen ─────────────────────────────────────────────── */}
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

          {/* Error de submit */}
          {errors.submit && (
            <p className="text-red-500 text-sm bg-red-50 rounded-xl px-4 py-3">{errors.submit}</p>
          )}
        </div>

        {/* ── Footer ─────────────────────────────────────────────────── */}
        <div className="px-5 py-4 border-t border-gray-100 shrink-0 flex items-center justify-between gap-3">
          <button
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 bg-gray-100 text-gray-600 text-sm font-medium rounded-xl
                       hover:bg-gray-200 transition disabled:opacity-50"
          >
            Cancelar
          </button>

          {showConfirm ? (
            <div className="flex items-center gap-3">
              <p className="text-sm text-gray-600 font-medium">
                ¿Confirmar registro de compra?
              </p>
              <button
                onClick={() => setShowConfirm(false)}
                className="px-3 py-1.5 bg-gray-100 text-gray-600 text-sm font-medium rounded-xl hover:bg-gray-200 transition"
              >
                No
              </button>
              <button
                onClick={handleSubmit}
                disabled={saving}
                className="px-4 py-2 bg-blue-600 text-white text-sm font-bold rounded-xl
                           hover:bg-blue-500 disabled:opacity-50 transition flex items-center gap-2"
              >
                {saving && <Spinner size={14} className="text-white" />}
                {saving ? 'Guardando…' : 'Sí, registrar'}
              </button>
            </div>
          ) : (
            <button
              onClick={() => { if (validate()) setShowConfirm(true) }}
              disabled={saving}
              className="px-5 py-2 bg-blue-600 text-white text-sm font-bold rounded-xl
                         hover:bg-blue-500 disabled:opacity-50 transition"
            >
              Registrar compra →
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

/* ════════════════════════════════════════════════════════════════════════
   CardRow — fila individual de carta con autocomplete
════════════════════════════════════════════════════════════════════════ */
function CardRow({ row, isLast, onChange, onSearch, onSelect, onRemove }) {
  const wrapRef = useRef(null)

  // Cerrar dropdown al click afuera
  useEffect(() => {
    const close = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        onChange({ suggestions: [] })
      }
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  return (
    <div className="grid grid-cols-[2fr_80px_80px_90px_90px_32px] gap-2 px-3 py-2 items-center">

      {/* Nombre de carta con autocomplete */}
      <div ref={wrapRef} className="relative">
        <div className="flex items-center gap-1.5">
          {row.card_id && (
            <span className="text-emerald-500 text-xs">✓</span>
          )}
          <input
            type="text"
            value={row.card_name}
            onChange={e => {
              onChange({ card_name: e.target.value, card_id: null })
              onSearch(e.target.value)
            }}
            placeholder="Buscar carta…"
            className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs bg-white
                       focus:outline-none focus:ring-2 focus:ring-blue-200"
          />
          {row.searching && <Spinner size={12} className="text-gray-400 shrink-0" />}
        </div>

        {/* Dropdown sugerencias */}
        {row.suggestions.length > 0 && (
          <div className="absolute top-full left-0 z-[70] mt-1 bg-white border border-gray-200 rounded-xl
                          shadow-xl max-h-64 overflow-y-auto"
               style={{ minWidth: '260px', width: 'max-content', maxWidth: '380px' }}>
            {row.suggestions.map((card, idx) => (
              <button
                key={`${card.name}|${card.set_name}|${idx}`}
                onClick={() => onSelect(card)}
                className="w-full flex items-center gap-2 px-3 py-2 text-left text-xs hover:bg-blue-50 transition"
              >
                {card.image_url ? (
                  <img
                    src={card.image_url}
                    alt={card.name}
                    className="w-6 h-8 object-cover rounded shadow-sm bg-gray-100 shrink-0"
                  />
                ) : (
                  <div className="w-6 h-8 bg-gray-100 rounded shrink-0 flex items-center justify-center text-gray-300 text-xs">🃏</div>
                )}
                <div className="flex-1 min-w-0">
                  <span className="font-medium text-gray-800 leading-tight line-clamp-1">{card.name}</span>
                  <span className="block text-gray-400 leading-tight truncate">
                    {[card.set_name, card.card_number ? `#${card.card_number}` : null].filter(Boolean).join(' · ')}
                  </span>
                  {card.price_usd && (
                    <span className="text-emerald-600 font-bold">
                      U$D {parseFloat(card.price_usd).toFixed(2)}
                    </span>
                  )}
                </div>
                {card.source === 'stock' ? (
                  <span className="text-[9px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded font-semibold shrink-0">
                    stock
                  </span>
                ) : (
                  <span className="text-[9px] bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded font-semibold shrink-0">
                    tcg
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Condición */}
      <select
        value={row.condition}
        onChange={e => onChange({ condition: e.target.value })}
        className="border border-gray-200 rounded-lg px-1.5 py-1.5 text-xs bg-white
                   focus:outline-none focus:ring-2 focus:ring-blue-200 cursor-pointer"
      >
        {CONDICIONES.map(c => (
          <option key={c} value={c}>{c}</option>
        ))}
      </select>

      {/* Cantidad */}
      <input
        type="number"
        min="1"
        value={row.quantity}
        onChange={e => onChange({ quantity: Math.max(1, parseInt(e.target.value) || 1) })}
        className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs bg-white text-center
                   focus:outline-none focus:ring-2 focus:ring-blue-200"
      />

      {/* Precio USD */}
      <input
        type="number"
        min="0"
        step="0.01"
        value={row.price_usd}
        onChange={e => onChange({ price_usd: e.target.value })}
        placeholder="0.00"
        className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs bg-white text-right
                   focus:outline-none focus:ring-2 focus:ring-blue-200"
      />

      {/* Precio ARS */}
      <input
        type="number"
        min="0"
        value={row.price_ars}
        onChange={e => onChange({ price_ars: e.target.value })}
        placeholder="0"
        className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs bg-white text-right
                   focus:outline-none focus:ring-2 focus:ring-blue-200"
      />

      {/* Eliminar */}
      <button
        onClick={onRemove}
        disabled={isLast}
        className="text-gray-300 hover:text-red-400 transition disabled:opacity-20 text-sm leading-none"
        title="Eliminar fila"
      >
        ✕
      </button>
    </div>
  )
}
