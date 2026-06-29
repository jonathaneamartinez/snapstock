import { useState, useRef, useCallback, useEffect } from 'react'
import { useCardImage } from '../hooks/useCardImage'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useI18n } from '../lib/i18n'
import { useClaims } from '../hooks/useClaims'
import { supabase }  from '../lib/supabase'
import { STORE_ID }  from '../constants'
import FinishBadge   from '../components/ui/FinishBadge'
import Spinner       from '../components/ui/Spinner'
import EmptyState    from '../components/ui/EmptyState'
import { AnimatePresence, motion } from 'framer-motion'
import ClaimOptionsModal from '../components/stock/ClaimOptionsModal'
import { sealedLabel } from '../lib/sealedSearch'

const CARD_BACK = 'https://images.pokemontcg.io/back.png'

function ClaimAddThumb({ row }) {
  const [imgSrc, onImgError] = useCardImage(row.cards?.image_url, { name: row.cards?.name, number: row.cards?.card_number, lang: row.cards?.language })
  return imgSrc
    ? <img src={imgSrc} alt="" onError={onImgError} className="w-7 h-10 object-cover rounded shrink-0" />
    : <div className="w-7 h-10 bg-gray-100 rounded shrink-0" />
}
const BACKEND   = 'https://stock-tcg-production.up.railway.app'

/* ── Enriquecer cartas del claim con precio PC si falta ──────────────── */
async function enrichClaimCardsWithPC(cards) {
  const missing = cards.filter(c => !c.usd && c.id)
  if (!missing.length) return cards

  // Paso 1: batch desde price_history
  const cardIds = [...new Set(missing.map(c => c.id))]
  const { data: prices } = await supabase
    .from('price_history')
    .select('card_id, price_usd')
    .in('card_id', cardIds)
    .eq('source', 'pricecharting')
    .eq('grade', 'ungraded')
    .order('snapshot_date', { ascending: false })

  const priceMap = {}
  for (const p of (prices ?? [])) {
    if (!priceMap[p.card_id]) priceMap[p.card_id] = p.price_usd
  }

  // Paso 2: on-demand para los que siguen sin precio (máx 5 para no saturar)
  const stillMissing = missing.filter(c => !priceMap[c.id]).slice(0, 5)
  for (const c of stillMissing) {
    try {
      const params = new URLSearchParams({ name: c.name || c.nombre || '', finish: c.finish || 'normal', grade: c.grade || 'ungraded' })
      if (c.lang) params.set('lang', c.lang)
      if (c.id)   params.set('card_id', c.id)
      const res = await fetch(`${BACKEND}/card-price?${params}`)
      if (res.ok) {
        const json = await res.json()
        if (json.price_usd) priceMap[c.id] = json.price_usd
      }
    } catch (_) {}
  }

  return cards.map(c => {
    if (c.usd || !c.id || !priceMap[c.id]) return c
    return { ...c, usd: priceMap[c.id] }
  })
}

const fmtFecha = (s) =>
  s ? new Date(s).toLocaleDateString('es-AR', {
    day: '2-digit', month: '2-digit', year: '2-digit',
  }) : '—'
const fmtHora = (s) =>
  s ? new Date(s).toLocaleTimeString('es-AR', {
    hour: '2-digit', minute: '2-digit',
  }) : ''
const fmtARS = (n) =>
  n != null ? `$${Number(n).toLocaleString('es-AR', { maximumFractionDigits: 0 })}` : '—'
const fmtUSD = (n) =>
  n != null ? `$${Number(n).toFixed(2)}` : null

/* ─── Canales de venta disponibles ──────────────────────────────────── */
const CANALES_VENTA = [
  { value: 'claims',          label: '🃏 Claims'          },
  { value: 'charly',          label: '👤 Charly'          },
  { value: 'fuera_de_evento', label: '📍 Fuera de evento' },
  { value: 'instagram',       label: '📸 Instagram'       },
  { value: 'whatsapp',        label: '💬 WhatsApp'        },
]

/* ─── Visor de imagen fullscreen ────────────────────────────────────── */
function ImagenFullscreen({ src, onClose }) {
  return (
    <div
      className="fixed inset-0 z-[70] bg-black/90 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <img
        src={src}
        alt="Claim"
        className="max-h-full max-w-full object-contain rounded-xl shadow-2xl"
        onClick={e => e.stopPropagation()}
      />
      <button
        onClick={onClose}
        className="absolute top-4 right-4 text-white/70 hover:text-white text-3xl leading-none"
      >
        ×
      </button>
    </div>
  )
}

/* ─── Floating Bulk Action Bar (portal → fixed bottom center) ────────── */
function BulkActionBar({ selected, onSell, onReserve, onReturn, onClear }) {
  const { t } = useI18n()
  const [action,  setAction]  = useState(null) // 'vender' | 'reservar' | null
  const [buyer,   setBuyer]   = useState('')
  const [canal,   setCanal]   = useState('claims')
  const [loading, setLoading] = useState(false)

  const reset = () => { setAction(null); setBuyer(''); setCanal('claims') }

  const handleExecute = async () => {
    setLoading(true)
    try {
      if (action === 'vender')   await onSell(buyer, canal)
      if (action === 'reservar') await onReserve(buyer, canal)
    } finally {
      setLoading(false)
      reset()
      onClear()
    }
  }

  const handleReturn = async () => {
    setLoading(true)
    try { await onReturn() }
    finally { setLoading(false); onClear() }
  }

  const bar = (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.96 }}
      animate={{ opacity: 1, y: 0,  scale: 1    }}
      exit={{    opacity: 0, y: 16, scale: 0.96  }}
      transition={{ type: 'spring', stiffness: 420, damping: 30 }}
      style={{ zIndex: 9999 }}
      className="fixed bottom-6 left-1/2 -translate-x-1/2
                 bg-gray-900 shadow-2xl shadow-black/40
                 rounded-2xl px-4 py-3
                 flex flex-wrap items-center gap-2
                 min-w-[320px] max-w-[calc(100vw-32px)]"
    >
      {/* Contador */}
      <div className="flex items-center gap-2 shrink-0">
        <span className="inline-flex items-center justify-center
                         min-w-[24px] h-6 px-1.5
                         bg-violet-500 text-white text-xs font-bold rounded-full">
          {selected.size}
        </span>
        <span className="text-xs text-white/70 font-medium whitespace-nowrap">
          {selected.size === 1 ? t('claims_card_selected') : t('claims_cards_selected')}
        </span>
      </div>

      {action ? (
        /* ── Modo confirmación ────────────────────────────────── */
        <>
          <div className="w-px h-5 bg-white/15 shrink-0" />

          {/* Canal — solo ventas */}
          {action === 'vender' && (
            <select
              value={canal}
              onChange={e => setCanal(e.target.value)}
              className="border border-white/20 rounded-lg px-2.5 py-1.5 text-xs
                         bg-gray-800 text-white focus:outline-none focus:ring-2
                         focus:ring-violet-400 cursor-pointer"
            >
              {CANALES_VENTA.map(c => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          )}

          {/* Nombre comprador */}
          <input
            autoFocus
            type="text"
            placeholder={action === 'vender' ? t('claims_buyer_ph') : t('claims_name_ph')}
            value={buyer}
            onChange={e => setBuyer(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleExecute()}
            className="flex-1 min-w-[130px] border border-white/20 rounded-lg px-2.5 py-1.5
                       text-xs bg-gray-800 text-white placeholder:text-white/30
                       focus:outline-none focus:ring-2 focus:ring-violet-400"
          />

          <button
            onClick={handleExecute}
            disabled={loading}
            className={`px-3 py-1.5 text-white text-xs font-bold rounded-lg transition
                        whitespace-nowrap disabled:opacity-50
                        ${action === 'vender'
                          ? 'bg-emerald-500 hover:bg-emerald-400'
                          : 'bg-amber-500 hover:bg-amber-400'}`}
          >
            {loading ? '…' : t('confirm')}
          </button>
          <button
            onClick={reset}
            className="px-3 py-1.5 bg-white/10 hover:bg-white/20
                       text-white/70 text-xs font-semibold rounded-lg transition whitespace-nowrap"
          >
            {t('claims_back')}
          </button>
        </>
      ) : (
        /* ── Modo botones principales ─────────────────────────── */
        <>
          <div className="w-px h-5 bg-white/15 shrink-0" />
          <button
            onClick={() => setAction('vender')}
            className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400
                       text-white text-xs font-semibold rounded-lg transition whitespace-nowrap"
          >
            {t('claims_action_sell')}
          </button>
          <button
            onClick={() => setAction('reservar')}
            className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400
                       text-white text-xs font-semibold rounded-lg transition whitespace-nowrap"
          >
            {t('claims_action_reserve')}
          </button>
          <button
            onClick={handleReturn}
            disabled={loading}
            className="px-3 py-1.5 bg-blue-500 hover:bg-blue-400
                       text-white text-xs font-semibold rounded-lg transition
                       disabled:opacity-50 whitespace-nowrap"
          >
            {loading ? '…' : t('claims_action_stock')}
          </button>

          {/* Cerrar */}
          <button
            onClick={onClear}
            className="ml-auto w-7 h-7 flex items-center justify-center rounded-full
                       bg-white/10 hover:bg-white/20 text-white/50 hover:text-white
                       text-base transition shrink-0"
            title={t('claims_deselect')}
          >
            ×
          </button>
        </>
      )}
    </motion.div>
  )

  return createPortal(bar, document.body)
}

/* ─── Tabla de cartas del claim (con workflow post-claim) ────────────── */
function CardTable({ cards, claimId, onRemove, editMode }) {
  const qc = useQueryClient()
  const { t } = useI18n()
  const [selected,    setSelected]    = useState(new Set())
  const [sellError,   setSellError]   = useState(null)

  /* ── Cantidad disponible por carta (para venta/reserva parcial) ──────── */
  const [availQty, setAvailQty] = useState({})   // inventory_id → cantidad en stock
  const [qtyMap,   setQtyMap]   = useState({})   // inventory_id → cantidad elegida
  useEffect(() => {
    const ids = cards.map(c => c.inventory_id).filter(Boolean)
    if (!ids.length) return
    let cancelled = false
    supabase.from('inventory').select('id, quantity').in('id', ids)
      .then(({ data }) => {
        if (cancelled || !data) return
        const m = {}; data.forEach(r => { m[r.id] = r.quantity ?? 1 })
        setAvailQty(m)
      })
    return () => { cancelled = true }
  }, [cards])

  const setQty = (id, v, max) => {
    const n = Math.max(1, Math.min(max, parseInt(v, 10) || 1))
    setQtyMap(p => ({ ...p, [id]: n }))
  }

  /**
   * Toma `take` unidades de una fila de inventory. Si take < disponible,
   * parte la fila: inserta una fila nueva con las unidades tomadas (sobre la
   * que se aplica vendida/reservada) y decrementa la original. Devuelve el id
   * a accionar. Inserta ANTES de decrementar para no perder unidades si falla.
   */
  const takeQuantity = async (invId, take) => {
    const { data: row } = await supabase.from('inventory').select('*').eq('id', invId).maybeSingle()
    if (!row) return invId
    const avail = row.quantity ?? 1
    if (!take || take >= avail) return invId            // toda la fila
    const clone = { ...row, quantity: take }
    delete clone.id; delete clone.created_at; delete clone.updated_at
    const { data: ins, error } = await supabase.from('inventory').insert(clone).select('id').maybeSingle()
    if (error || !ins) return invId                     // si falla el split, accionar la fila entera
    await supabase.from('inventory').update({ quantity: avail - take }).eq('id', invId)
    return ins.id
  }

  /* ── Tags por inventory_id ──────────────────────────────────────────── */
  const [localTags,  setLocalTags]  = useState(() => {
    const map = {}
    cards.forEach(c => { if (c.inventory_id) map[c.inventory_id] = c.tags ?? [] })
    return map
  })
  const [tagInputs,  setTagInputs]  = useState({})  // inventory_id → string en edición
  const saveTimer = useRef({})

  const persistTags = (inventoryId, newTags) => {
    clearTimeout(saveTimer.current[inventoryId])
    saveTimer.current[inventoryId] = setTimeout(async () => {
      if (!claimId) return
      const updatedCards = cards.map(c =>
        c.inventory_id === inventoryId ? { ...c, tags: newTags } : c
      )
      await supabase.from('claims').update({ cards_data: updatedCards }).eq('id', claimId)
      qc.invalidateQueries({ queryKey: ['claims'] })
    }, 600)
  }

  const addTag = (inventoryId, raw) => {
    const tag = raw.trim()
    if (!tag) return
    const current = localTags[inventoryId] ?? []
    if (current.some(t => t.toLowerCase() === tag.toLowerCase())) {
      setTagInputs(p => ({ ...p, [inventoryId]: '' }))
      return
    }
    const newTags = [...current, tag]
    setLocalTags(p => ({ ...p, [inventoryId]: newTags }))
    setTagInputs(p => ({ ...p, [inventoryId]: '' }))
    persistTags(inventoryId, newTags)
  }

  const removeTag = (inventoryId, tag) => {
    const newTags = (localTags[inventoryId] ?? []).filter(t => t !== tag)
    setLocalTags(p => ({ ...p, [inventoryId]: newTags }))
    persistTags(inventoryId, newTags)
  }

  const hasInventoryIds = cards.some(c => c.inventory_id)

  const allActionable = cards.filter(c => c.inventory_id)
  const allSelected   = allActionable.length > 0 && allActionable.every(c => selected.has(c.inventory_id))
  const someSelected  = selected.size > 0

  const toggleAll = () => {
    if (allSelected) setSelected(new Set())
    else setSelected(new Set(allActionable.map(c => c.inventory_id)))
  }
  const toggleOne = (id) => {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const refreshAll = () => {
    qc.invalidateQueries({ queryKey: ['stock'] })
    qc.invalidateQueries({ queryKey: ['metricas'] })
    qc.invalidateQueries({ queryKey: ['deudas'] })
    qc.invalidateQueries({ queryKey: ['ventas'] })
  }

  /* Cartas seleccionadas con todos sus datos */
  const selectedCards = cards.filter(c => c.inventory_id && selected.has(c.inventory_id))

  /* ── Vender: actualiza inventory + inserta en sales (cantidad parcial) ── */
  const handleSell = async (buyerName, channel) => {
    const now = new Date().toISOString()
    const salesRows = []
    try {
      for (const c of selectedCards) {
        const take     = qtyMap[c.inventory_id] ?? availQty[c.inventory_id] ?? 1
        const targetId = await takeQuantity(c.inventory_id, take)   // parte la fila si es parcial
        await supabase.from('inventory')
          .update({ status: 'vendida', estado: 'vendida', sold_at_date: now, buyer_name: buyerName || null })
          .eq('id', targetId)
        const unit = c.sale ?? c.ars ?? null
        salesRows.push({
          store_id:     STORE_ID,
          channel:      channel   || 'claims',
          buyer_name:   buyerName || null,
          notes:        c.name    || '',
          total_ars:    unit != null ? unit * take : null,   // precio unitario × cantidad
          sold_at:      now,
          estado:       'pendiente',
          inventory_id: targetId,
        })
      }
      if (salesRows.length) {
        const { error } = await supabase.from('sales').insert(salesRows)
        if (error) { setSellError(`Error al registrar en ventas: ${error.message}`); console.error('[Claims] sales insert error:', error) }
        else setSellError(null)
      }
    } finally {
      setQtyMap({})
      refreshAll()
    }
  }

  /* ── Reservar: actualiza inventory (cantidad parcial) ──────────── */
  const handleReserve = async (buyerName) => {
    const now = new Date().toISOString()
    for (const c of selectedCards) {
      const take     = qtyMap[c.inventory_id] ?? availQty[c.inventory_id] ?? 1
      const targetId = await takeQuantity(c.inventory_id, take)
      await supabase.from('inventory')
        .update({
          status: 'reservada', estado: 'reservada',
          buyer_name: buyerName || null,
          reserved_at: now, fecha_reserva: now,
        })
        .eq('id', targetId)
    }
    setQtyMap({})
    refreshAll()
  }

  /* ── Volver al stock ────────────────────────────────────────────── */
  const handleReturn = async () => {
    const ids = selectedCards.map(c => c.inventory_id)
    await supabase.from('inventory')
      .update({
        status:        'disponible',
        estado:        'disponible',
        buyer_name:    null,
        buyer_contact: null,
        reserved_at:   null,        // limpiar fechas al volver al stock
        fecha_reserva: null,
        sold_at_date:  null,
      })
      .in('id', ids)
    refreshAll()
  }

  if (!cards?.length) return (
    <p className="text-xs text-gray-400 text-center py-3">{t('claims_no_data_cards')}</p>
  )

  const totalARS = cards.reduce((s, c) => s + (c.sale ?? c.ars ?? 0), 0)
  const totalUSD = cards.reduce((s, c) => s + (c.usd ?? 0), 0)

  return (
    <div>
      {/* Tabla */}
      <div className="overflow-x-auto rounded-xl border border-gray-200 mb-2">
        <table className="w-full text-xs">
          <thead className="bg-gray-100 text-gray-500 uppercase">
            <tr>
              {editMode && <th className="pl-3 pr-1 py-2 w-6" />}
              {hasInventoryIds && (
                <th className="pl-3 pr-1 py-2">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleAll}
                    className="w-3.5 h-3.5 rounded accent-violet-600 cursor-pointer"
                  />
                </th>
              )}
              <th className="px-3 py-2 text-left font-semibold">{t('claims_col_card')}</th>
              <th className="px-3 py-2 text-left font-semibold">{t('claims_col_set')}</th>
              <th className="px-3 py-2 text-left font-semibold">{t('claims_col_cond')}</th>
              <th className="px-3 py-2 text-left font-semibold">Tags</th>
              <th className="px-3 py-2 text-right font-semibold">USD</th>
              <th className="px-3 py-2 text-right font-semibold">{t('claims_col_ars_blue')}</th>
              <th className="px-3 py-2 text-right font-semibold">{t('claims_col_sale')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {cards.map((c, i) => {
              const isSel = c.inventory_id && selected.has(c.inventory_id)
              return (
                <tr
                  key={i}
                  className={`transition ${isSel ? 'bg-violet-50' : 'hover:bg-gray-50'}
                    ${c.inventory_id ? 'cursor-pointer' : ''}`}
                  onClick={() => c.inventory_id && toggleOne(c.inventory_id)}
                >
                  {/* ✕ eliminar carta del claim (solo en editMode) */}
                  {editMode && (
                    <td className="pl-2 pr-0 py-1.5" onClick={e => e.stopPropagation()}>
                      <button
                        onClick={() => onRemove?.(c.inventory_id ?? i)}
                        className="w-5 h-5 flex items-center justify-center rounded-full
                                   bg-red-100 text-red-400 hover:bg-red-200 hover:text-red-600
                                   text-xs transition shrink-0"
                        title="Quitar carta del claim"
                      >×</button>
                    </td>
                  )}
                  {hasInventoryIds && (
                    <td className="pl-3 pr-1 py-1.5">
                      {c.inventory_id ? (
                        <input
                          type="checkbox"
                          checked={isSel}
                          onChange={() => toggleOne(c.inventory_id)}
                          onClick={e => e.stopPropagation()}
                          className="w-3.5 h-3.5 rounded accent-violet-600 cursor-pointer"
                        />
                      ) : (
                        <span className="w-3.5 h-3.5 block" />
                      )}
                    </td>
                  )}
                  <td className="px-3 py-1.5 font-medium text-gray-800 max-w-[140px]">
                    <div className="flex items-center gap-1.5">
                      {c.img && (
                        <img src={c.img} alt="" className="w-5 h-7 object-cover rounded-sm shrink-0" />
                      )}
                      <span className="truncate">{c.name || '—'}</span>
                      <FinishBadge finish={c.finish} />
                    </div>
                    {/* Cantidad parcial: solo si hay más de 1 en stock */}
                    {c.inventory_id && (availQty[c.inventory_id] ?? 1) > 1 && (
                      <div
                        className="mt-1 flex items-center gap-1"
                        onClick={e => e.stopPropagation()}
                        title="Cantidad a vender/reservar (parcial)"
                      >
                        <span className="text-[10px] text-gray-400">Cant.</span>
                        <input
                          type="number"
                          min={1}
                          max={availQty[c.inventory_id]}
                          value={qtyMap[c.inventory_id] ?? availQty[c.inventory_id]}
                          onChange={e => setQty(c.inventory_id, e.target.value, availQty[c.inventory_id])}
                          className="w-12 border border-gray-300 rounded px-1 py-0.5 text-[11px] text-center"
                        />
                        <span className="text-[10px] text-gray-400">/ {availQty[c.inventory_id]}</span>
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-1.5 text-gray-500 max-w-[90px]">
                    <span className="truncate block">{c.set || '—'}</span>
                  </td>
                  <td className="px-3 py-1.5 text-gray-500">{c.cond || '—'}</td>

                  {/* ── Tags ─────────────────────────────────────────── */}
                  <td
                    className="px-3 py-1.5 max-w-[160px]"
                    onClick={e => e.stopPropagation()}
                  >
                    <div className="flex flex-wrap gap-1 items-center">
                      {(localTags[c.inventory_id] ?? []).map(tag => (
                        <span
                          key={tag}
                          className="inline-flex items-center gap-0.5 pl-2 pr-1 py-0.5
                                     bg-violet-100 text-violet-700 text-[10px] font-semibold
                                     rounded-full whitespace-nowrap"
                        >
                          {tag}
                          <button
                            onClick={() => removeTag(c.inventory_id, tag)}
                            className="text-violet-400 hover:text-violet-700 leading-none ml-0.5 text-[11px]"
                          >×</button>
                        </span>
                      ))}
                      {c.inventory_id && (
                        <input
                          type="text"
                          value={tagInputs[c.inventory_id] ?? ''}
                          onChange={e => setTagInputs(p => ({ ...p, [c.inventory_id]: e.target.value }))}
                          onKeyDown={e => {
                            if (e.key === 'Enter' || e.key === ',') {
                              e.preventDefault()
                              addTag(c.inventory_id, tagInputs[c.inventory_id] ?? '')
                            }
                          }}
                          onBlur={e => {
                            if (e.target.value.trim()) addTag(c.inventory_id, e.target.value)
                          }}
                          placeholder={localTags[c.inventory_id]?.length ? '+ tag' : '+ persona'}
                          className="text-[10px] bg-transparent border-none outline-none
                                     text-gray-500 placeholder:text-gray-300
                                     w-14 min-w-0 cursor-text"
                        />
                      )}
                    </div>
                  </td>

                  <td className="px-3 py-1.5 text-right text-emerald-600 font-medium whitespace-nowrap">
                    {fmtUSD(c.usd) ?? '—'}
                  </td>
                  <td className="px-3 py-1.5 text-right text-blue-600 font-medium whitespace-nowrap">
                    {fmtARS(c.ars)}
                  </td>
                  <td className="px-3 py-1.5 text-right font-bold text-gray-800 whitespace-nowrap">
                    {fmtARS(c.sale ?? c.ars)}
                  </td>
                </tr>
              )
            })}
          </tbody>
          <tfoot className="bg-gray-50 border-t-2 border-gray-200">
            <tr>
              <td
                colSpan={(hasInventoryIds ? 5 : 4) + (editMode ? 1 : 0)}
                className="px-3 py-2 text-xs font-bold text-gray-600"
              >
                Total ({cards.length} {t('claims_col_cards')})
              </td>
              <td className="px-3 py-2 text-right text-xs font-bold text-emerald-600 whitespace-nowrap">
                {fmtUSD(totalUSD)}
              </td>
              <td className="px-3 py-2 text-right text-xs font-bold text-blue-600 whitespace-nowrap">
                {fmtARS(totalARS)}
              </td>
              <td className="px-3 py-2 text-right text-xs font-bold text-gray-800 whitespace-nowrap">
                {fmtARS(totalARS)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Aclaración cuando no hay inventory_id (claims anteriores) */}
      {!hasInventoryIds && (
        <p className="text-[10px] text-gray-400 text-center pb-1">
          {t('claims_old_claim')}
        </p>
      )}

      {/* Error al registrar venta */}
      {sellError && (
        <div className="mt-2 p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 font-medium flex items-start gap-2">
          <span>⚠️</span>
          <div>
            <p className="font-bold mb-0.5">{t('claims_sell_error')}</p>
            <p>{sellError}</p>
            <p className="mt-1 text-red-500">
              {t('claims_sell_error_rls')}
            </p>
          </div>
          <button onClick={() => setSellError(null)} className="ml-auto text-red-400 hover:text-red-600 text-base leading-none">×</button>
        </div>
      )}

      {/* Floating bulk action bar — renderizado via portal en document.body */}
      <AnimatePresence>
        {someSelected && (
          <BulkActionBar
            selected={selected}
            onSell={handleSell}
            onReserve={handleReserve}
            onReturn={handleReturn}
            onClear={() => setSelected(new Set())}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

/* ─── Fila de claim expandible ───────────────────────────────────────── */
function ClaimRow({ claim, selected = false, onToggle = () => {} }) {
  const { t } = useI18n()
  const qc = useQueryClient()
  const [expanded,      setExpanded]      = useState(false)
  const [fullImg,       setFullImg]       = useState(null)
  const [regenCards,    setRegenCards]    = useState(null)
  const [editMode,      setEditMode]      = useState(false)
  const [enrichedCards, setEnrichedCards] = useState(null)
  const [enriching,     setEnriching]     = useState(false)
  const [addSearch,    setAddSearch]   = useState('')
  const [addResults,   setAddResults]  = useState([])
  const [addLoading,   setAddLoading]  = useState(false)
  const [addHasMore,   setAddHasMore]  = useState(false)
  const [addLoadMore,  setAddLoadMore] = useState(false)
  const addPageRef   = useRef(0)
  const addQueryRef  = useRef('')
  const sentinelRef  = useRef(null)
  const addTimerRef  = useRef(null)

  // Enriquecer precios PC cuando se expande el claim
  useEffect(() => {
    if (!expanded) return
    const cards = claim.cards_data ?? []
    const hasMissing = cards.some(c => !c.usd && c.id)
    if (!hasMissing) { setEnrichedCards(cards); return }
    setEnriching(true)
    enrichClaimCardsWithPC(cards)
      .then(setEnrichedCards)
      .finally(() => setEnriching(false))
  }, [expanded, claim.id])

  const hasImages = claim.image_urls?.length > 0
  const hasCards  = claim.cards_data?.length > 0

  /* ── Quitar carta del claim ─────────────────────────────────────────── */
  const removeCardFromClaim = async (inventoryIdOrIdx) => {
    const newCards = typeof inventoryIdOrIdx === 'number' && inventoryIdOrIdx < 1000
      ? claim.cards_data.filter((_, i) => i !== inventoryIdOrIdx)
      : claim.cards_data.filter(c => c.inventory_id !== inventoryIdOrIdx)
    await supabase.from('claims')
      .update({ cards_data: newCards, card_count: newCards.length })
      .eq('id', claim.id)
    qc.invalidateQueries({ queryKey: ['claims'] })
  }

  /* ── Buscar cartas del inventory (página 0) ────────────────────────── */
  const PAGE = 20
  const fetchInvPage = async (term, offset) => {
    const trimmed = term.trim().replace(/%/g, '\\%').replace(/_/g, '\\_')
    const base = () => supabase.from('inventory')
      .eq('store_id', STORE_ID).neq('status', 'vendida')
      .order('id', { ascending: false }).range(offset, offset + PAGE - 1)
    // Cartas + Sellados en paralelo (sellados se normalizan a la forma .cards)
    const [cRes, sRes] = await Promise.all([
      base()
        .select('id, price_usd, price_ars_blue, sale_price_ars, condition, condicion, finish, grade, cards!inner(id, name, set_name, card_number, image_url, language, is_holo)')
        .or(`name.ilike.%${trimmed}%,set_name.ilike.%${trimmed}%`, { referencedTable: 'cards' }),
      base()
        .select('id, price_usd, price_ars_blue, sale_price_ars, condition, condicion, finish, grade, sealed_products!inner(id, name, set_name, image_url, product_type)')
        .or(`name.ilike.%${trimmed}%,set_name.ilike.%${trimmed}%`, { referencedTable: 'sealed_products' }),
    ])
    const cards = (cRes.data ?? []).filter(r => r.cards?.name)
    const sealed = (sRes.data ?? []).filter(r => r.sealed_products?.name).map(r => ({
      ...r,
      cards: {
        id: null, name: r.sealed_products.name, set_name: r.sealed_products.set_name,
        card_number: null, image_url: r.sealed_products.image_url, language: 'en',
        is_holo: false, _sealed: true, product_type: r.sealed_products.product_type,
      },
    }))
    // Intercalar por id desc para que aparezcan mezclados de forma estable
    return [...cards, ...sealed].sort((a, b) => b.id - a.id)
  }

  const searchCards = (term) => {
    setAddSearch(term)
    clearTimeout(addTimerRef.current)
    if (term.length < 2) { setAddResults([]); setAddHasMore(false); return }
    setAddLoading(true)
    addTimerRef.current = setTimeout(async () => {
      addQueryRef.current = term
      addPageRef.current  = 0
      const rows = await fetchInvPage(term, 0)
      setAddResults(rows)
      setAddHasMore(rows.length === PAGE)
      setAddLoading(false)
    }, 200)
  }

  /* ── Cargar más resultados (infinite scroll) ────────────────────────── */
  const loadMoreAdd = useCallback(async () => {
    if (addLoadMore || !addHasMore || !addQueryRef.current) return
    setAddLoadMore(true)
    const nextOffset = (addPageRef.current + 1) * PAGE
    const rows = await fetchInvPage(addQueryRef.current, nextOffset)
    if (rows.length === 0) { setAddHasMore(false); setAddLoadMore(false); return }
    addPageRef.current += 1
    setAddResults(prev => [...prev, ...rows])
    setAddHasMore(rows.length === PAGE)
    setAddLoadMore(false)
  }, [addLoadMore, addHasMore])

  /* IntersectionObserver sobre el sentinel */
  useEffect(() => {
    if (!sentinelRef.current || !addHasMore) return
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) loadMoreAdd() },
      { threshold: 0.1 }
    )
    obs.observe(sentinelRef.current)
    return () => obs.disconnect()
  }, [addHasMore, addLoadMore, loadMoreAdd])

  /* ── Agregar carta al claim ─────────────────────────────────────────── */
  const addCardToClaim = async (invRow) => {
    const c = invRow.cards
    let usd  = invRow.price_usd ?? null
    let ars  = invRow.price_ars_blue ?? null
    let sale = invRow.sale_price_ars ?? invRow.price_ars_blue ?? null

    // [A-sellado] Sin card_id: precio de mercado por nombre+set
    if (!usd && c._sealed && c.name) {
      try {
        const q = `${(c.set_name || '').replace(/^Pokemon\s+/i, '')} ${c.name}`.trim()
        const res = await fetch(`${BACKEND}/card-price?${new URLSearchParams({ name: q, lang: 'en', grade: 'ungraded' })}`)
        if (res.ok) { const json = await res.json(); if (json.price_usd) usd = json.price_usd }
      } catch (_) {}
    }
    // [A] Si no tiene precio, buscar en price_history o /card-price
    if (!usd && c.id) {
      const { data: ph } = await supabase
        .from('price_history')
        .select('price_usd')
        .eq('card_id', c.id)
        .eq('source', 'pricecharting')
        .eq('grade', invRow.grade || 'ungraded')
        .order('snapshot_date', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (ph?.price_usd) {
        usd = ph.price_usd
      } else if (c.name) {
        try {
          const params = new URLSearchParams({ name: c.name, finish: invRow.finish || 'normal', grade: invRow.grade || 'ungraded', card_id: c.id })
          if (c.language) params.set('lang', c.language)
          const res = await fetch(`${BACKEND}/card-price?${params}`)
          if (res.ok) {
            const json = await res.json()
            if (json.price_usd) usd = json.price_usd
          }
        } catch (_) {}
      }
    }

    const newCard = {
      id:           c.id,
      inventory_id: invRow.id,
      name:         c.name,
      set:          c.set_name,
      num:          c.card_number,
      cond:         invRow.condition || invRow.condicion || 'NM',
      holo:         c.is_holo || false,
      finish:       invRow.finish || 'normal',
      img:          c.image_url || '',
      usd,
      ars,
      sale,
      tags:         [],
      sealed:       c._sealed || false,
      product_type: c.product_type || null,
    }
    const newCards = [...(claim.cards_data ?? []), newCard]
    await supabase.from('claims')
      .update({ cards_data: newCards, card_count: newCards.length })
      .eq('id', claim.id)
    qc.invalidateQueries({ queryKey: ['claims'] })
    setAddSearch('')
    setAddResults([])
  }

  const openRegen = () => {
    if (!hasCards) return
    const normalized = claim.cards_data.map(c => ({
      card_id:        c.id            || null,
      inventory_id:   c.inventory_id  || null,
      nombre:         c.name          || '',
      set_name:       c.set           || '',
      numero:         c.num           || '',
      condicion:      c.cond          || '',
      holo:           c.holo          || false,
      finish:         c.finish        || 'normal',
      image_url:      c.img           || '',
      price_usd:      c.usd           ?? null,
      price_ars_blue: c.ars           ?? null,
      _ars_blue:      c.ars           ?? null,
      sale_price_ars: c.sale          ?? null,
      status:         'disponible',
    }))
    setRegenCards(normalized)
  }

  return (
    <>
      <tr
        className={`hover:bg-gray-50 cursor-pointer transition
          ${selected ? 'bg-red-50' : expanded ? 'bg-blue-50' : ''}`}
        onClick={() => setExpanded(e => !e)}
      >
        <td className="pl-4 pr-1 py-3 w-8" onClick={e => e.stopPropagation()}>
          <input type="checkbox" checked={selected} onChange={onToggle}
            className="w-4 h-4 rounded border-gray-300 text-violet-600 cursor-pointer
                       focus:ring-violet-400" />
        </td>
        <td className="px-4 py-3">
          <div>
            <p className="text-xs font-semibold text-gray-500">{fmtFecha(claim.created_at)}</p>
            <p className="text-[10px] text-gray-400">{fmtHora(claim.created_at)}</p>
          </div>
        </td>
        <td className="px-4 py-3 font-medium text-gray-800 text-sm">{claim.title || '—'}</td>
        <td className="px-4 py-3">
          <span className="text-xs bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full font-semibold">
            {claim.style === 'A' ? 'Collage 6×5' : 'Grid 5×5'}
          </span>
        </td>
        <td className="px-4 py-3 text-gray-700 font-medium text-sm">{claim.card_count ?? '—'}</td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            {hasImages ? (
              <div className="flex gap-1">
                {claim.image_urls.slice(0, 3).map((url, i) => (
                  <img key={i} src={url} alt=""
                    className="w-8 h-8 object-cover rounded-md border border-gray-200 shadow-sm" />
                ))}
                {claim.image_urls.length > 3 && (
                  <div className="w-8 h-8 rounded-md bg-gray-100 flex items-center justify-center
                                  text-[10px] font-bold text-gray-500 border border-gray-200">
                    +{claim.image_urls.length - 3}
                  </div>
                )}
              </div>
            ) : hasCards ? (
              <button
                onClick={e => { e.stopPropagation(); openRegen() }}
                className="text-xs text-violet-600 hover:text-violet-800 font-medium
                           bg-violet-50 hover:bg-violet-100 px-2 py-1 rounded-lg transition"
              >
                {t('claims_regen')}
              </button>
            ) : (
              <span className="text-xs text-gray-400">{t('claims_no_images')}</span>
            )}
            <span className="text-gray-300 text-sm ml-auto">{expanded ? '▲' : '▼'}</span>
          </div>
        </td>
        <td className="px-4 py-3">
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium
            ${claim.dark ? 'bg-gray-800 text-gray-200' : 'bg-gray-100 text-gray-600'}`}>
            {claim.dark ? '🌙' : '☀️'}
          </span>
        </td>
      </tr>

      {/* Panel expandido */}
      <AnimatePresence>
        {expanded && (
          <tr>
            <td colSpan={7} className="px-0 py-0">
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="px-5 py-4 bg-gray-50 border-t border-b border-gray-100 space-y-4">

                  {hasImages && (
                    <div>
                      <p className="text-xs font-semibold text-gray-500 mb-3">
                        {claim.image_urls.length} {claim.image_urls.length === 1 ? t('claims_img_saved') : t('claims_imgs_saved')} {t('claims_click_enlarge')}
                      </p>
                      <div className="flex gap-3 flex-wrap">
                        {claim.image_urls.map((url, i) => (
                          <button
                            key={i}
                            onClick={() => setFullImg(url)}
                            className="relative group rounded-xl overflow-hidden shadow-md
                                       border-2 border-transparent hover:border-blue-400 transition"
                          >
                            <img src={url} alt={`Imagen ${i + 1}`}
                              className="h-36 w-auto object-cover" />
                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20
                                            flex items-center justify-center transition">
                              <span className="opacity-0 group-hover:opacity-100 text-white text-2xl">🔍</span>
                            </div>
                            <p className="absolute bottom-1 right-2 text-[10px] text-white/80
                                          font-medium bg-black/40 px-1 rounded">
                              {i + 1}/{claim.image_urls.length}
                            </p>
                          </button>
                        ))}
                      </div>
                      <div className="mt-3 flex gap-2">
                        {claim.image_urls.map((url, i) => (
                          <a key={i} href={url} download={`claim_${fmtFecha(claim.created_at).replace(/\//g,'-')}_${i+1}.png`}
                            target="_blank" rel="noreferrer"
                            className="text-xs text-blue-600 hover:underline">
                            ⬇ img {i + 1}
                          </a>
                        ))}
                      </div>
                    </div>
                  )}

                  {!hasImages && hasCards && (
                    <div className="flex items-center gap-3 py-2">
                      <p className="text-xs text-gray-500 flex-1">
                        {t('claims_regen_tip')}
                      </p>
                      <button
                        onClick={openRegen}
                        className="shrink-0 px-4 py-2 bg-violet-600 hover:bg-violet-500
                                   text-white text-xs font-bold rounded-xl transition"
                      >
                        {t('claims_regen_images')}
                      </button>
                    </div>
                  )}

                  {hasCards && (
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <p className="text-xs font-semibold text-gray-500 flex-1">
                          📋 {t('claims_cards_of_claim')} ({claim.cards_data.length})
                          {!editMode && claim.cards_data.some(c => c.inventory_id) && (
                            <span className="ml-2 text-[10px] text-violet-500 font-normal">
                              · {t('claims_select_tip')}
                            </span>
                          )}
                        </p>
                        <button
                          onClick={() => { setEditMode(e => !e); setAddSearch(''); setAddResults([]) }}
                          className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl
                                     text-xs font-semibold transition
                                     ${editMode
                                       ? 'bg-gray-200 text-gray-600 hover:bg-gray-300'
                                       : 'bg-violet-100 text-violet-700 hover:bg-violet-200'}`}
                        >
                          {editMode ? '✓ Listo' : '✏️ Editar claim'}
                        </button>
                      </div>

                      {enriching && (
                        <p className="text-[10px] text-gray-400 animate-pulse mb-1">
                          Cargando precios PC…
                        </p>
                      )}
                      <CardTable
                        cards={enrichedCards ?? claim.cards_data}
                        claimId={claim.id}
                        editMode={editMode}
                        onRemove={removeCardFromClaim}
                      />

                      {/* Buscador para agregar cartas */}
                      {editMode && (
                        <div className="mt-3 border border-dashed border-violet-200 rounded-xl p-3 bg-violet-50/50">
                          <p className="text-[10px] font-semibold text-violet-500 mb-2">➕ Agregar carta al claim</p>
                          <input
                            type="text"
                            value={addSearch}
                            onChange={e => searchCards(e.target.value)}
                            placeholder="Buscar por nombre de carta..."
                            className="w-full border border-gray-200 rounded-xl px-3 py-1.5 text-xs
                                       bg-white focus:outline-none focus:ring-2 focus:ring-violet-200"
                          />
                          {addLoading && (
                            <div className="flex justify-center mt-2">
                              <div className="w-4 h-4 border-2 border-violet-300 border-t-transparent rounded-full animate-spin" />
                            </div>
                          )}
                          {addResults.length > 0 && (
                            <div className="mt-2 max-h-64 overflow-y-auto rounded-xl border border-gray-100 bg-white">
                              {addResults.map(row => (
                                <button
                                  key={row.id}
                                  onClick={() => addCardToClaim(row)}
                                  className="w-full flex items-center gap-3 px-3 py-2
                                             hover:bg-violet-50 text-left border-b border-gray-100
                                             last:border-0 transition"
                                >
                                  <ClaimAddThumb row={row} />
                                  <div className="flex-1 min-w-0">
                                    <p className="text-xs font-medium text-gray-800 truncate flex items-center gap-1.5">
                                      {row.cards?.name}
                                      {row.cards?._sealed && (
                                        <span className="text-[8px] bg-purple-100 text-purple-600 px-1 py-0.5 rounded font-bold shrink-0">
                                          {sealedLabel(row.cards.product_type)}
                                        </span>
                                      )}
                                    </p>
                                    <p className="text-[10px] text-gray-400 truncate">
                                      {row.cards?.set_name}{row.cards?.card_number ? ` · #${row.cards.card_number}` : ''}
                                    </p>
                                  </div>
                                  {row.price_usd != null && (
                                    <span className="text-xs font-bold text-emerald-600 shrink-0">
                                      ${Number(row.price_usd).toFixed(2)}
                                    </span>
                                  )}
                                </button>
                              ))}
                              {/* Sentinel infinite scroll */}
                              {addHasMore && (
                                <div ref={sentinelRef} className="flex items-center justify-center py-3 border-t border-gray-100">
                                  {addLoadMore
                                    ? <div className="w-4 h-4 border-2 border-violet-300 border-t-transparent rounded-full animate-spin" />
                                    : <span className="text-[11px] text-gray-400">↓ más resultados</span>
                                  }
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {!hasImages && !hasCards && (
                    <p className="text-sm text-gray-400 text-center py-4">
                      {t('claims_no_data_full')}
                    </p>
                  )}
                </div>
              </motion.div>
            </td>
          </tr>
        )}
      </AnimatePresence>

      {fullImg && <ImagenFullscreen src={fullImg} onClose={() => setFullImg(null)} />}

      {regenCards && (
        <ClaimOptionsModal
          cards={regenCards}
          onClose={() => setRegenCards(null)}
          onConfirmed={() => setRegenCards(null)}
        />
      )}
    </>
  )
}

/* ═══════════════════════════════════════════════════════════════════════
   Página principal
════════════════════════════════════════════════════════════════════════ */
export default function Claims() {
  const navigate = useNavigate()
  const { t } = useI18n()
  const qc = useQueryClient()
  const { data, isLoading, error } = useClaims()
  const claims = data ?? []

  // ── Selección múltiple + borrado de claims ─────────────────────────────
  const [selected,  setSelected]  = useState(new Set())
  const [confirmDel, setConfirmDel] = useState(false)
  const [deleting,  setDeleting]  = useState(false)

  const toggle = (id) => setSelected(prev => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n
  })
  const allSelected = claims.length > 0 && claims.every(c => selected.has(c.id))
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(claims.map(c => c.id)))

  const deleteSelected = async () => {
    setDeleting(true)
    try {
      await supabase.from('claims').delete().in('id', [...selected])
      setSelected(new Set())
      qc.invalidateQueries({ queryKey: ['claims'] })
    } finally {
      setDeleting(false); setConfirmDel(false)
    }
  }

  return (
    <div className="space-y-5">

      <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm
                      flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-gray-800">🃏 Claims</h2>
          <p className="text-sm text-gray-400 mt-0.5">
            {t('claims_history_sub')} · {claims.length} claims
          </p>
        </div>
        <button
          onClick={() => navigate('/stock')}
          className="px-4 py-2 bg-violet-600 text-white text-sm font-bold rounded-xl
                     hover:bg-violet-500 transition"
        >
          {t('claims_new')}
        </button>
      </div>

      {/* Barra de acciones cuando hay seleccionados */}
      {selected.size > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-2xl px-4 py-3 shadow-sm
                        flex items-center justify-between">
          <span className="text-sm font-semibold text-red-700">
            {selected.size} {selected.size === 1 ? 'claim seleccionado' : 'claims seleccionados'}
          </span>
          <div className="flex items-center gap-2">
            <button onClick={() => setSelected(new Set())}
              className="px-3 py-1.5 text-xs font-semibold text-gray-500 hover:text-gray-700 transition">
              Cancelar
            </button>
            {confirmDel ? (
              <button onClick={deleteSelected} disabled={deleting}
                className="px-3 py-1.5 bg-red-600 text-white text-xs font-bold rounded-lg
                           hover:bg-red-500 disabled:opacity-50 transition">
                {deleting ? 'Eliminando…' : `Confirmar borrado (${selected.size})`}
              </button>
            ) : (
              <button onClick={() => setConfirmDel(true)}
                className="px-3 py-1.5 bg-red-100 text-red-700 text-xs font-bold rounded-lg
                           hover:bg-red-200 transition">
                🗑️ Eliminar
              </button>
            )}
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        {isLoading && (
          <div className="flex justify-center py-12">
            <Spinner size={28} className="text-violet-400" />
          </div>
        )}
        {error && <p className="text-red-500 text-sm p-5">{error.message}</p>}
        {!isLoading && claims.length === 0 && (
          <div className="p-8">
            <EmptyState img={CARD_BACK} title={t('claims_no_claims')} sub={t('claims_no_claims_sub')} />
          </div>
        )}

        {!isLoading && claims.length > 0 && (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-400 text-xs uppercase">
              <tr>
                <th className="pl-4 pr-1 py-3 w-8">
                  <input type="checkbox" checked={allSelected} onChange={toggleAll}
                    className="w-4 h-4 rounded border-gray-300 text-violet-600 cursor-pointer
                               focus:ring-violet-400" />
                </th>
                {[t('claims_col_date'), t('claims_col_title'), t('claims_col_style'), t('claims_col_cards'), t('claims_col_images'), t('claims_col_theme')].map(h => (
                  <th key={h} className="px-4 py-3 text-left font-semibold whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {claims.map(c => (
                <ClaimRow key={c.id} claim={c}
                  selected={selected.has(c.id)} onToggle={() => toggle(c.id)} />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
