import { useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useI18n } from '../lib/i18n'
import { useClaims } from '../hooks/useClaims'
import { supabase }  from '../lib/supabase'
import { STORE_ID }  from '../constants'
import Spinner       from '../components/ui/Spinner'
import EmptyState    from '../components/ui/EmptyState'
import { AnimatePresence, motion } from 'framer-motion'
import ClaimOptionsModal from '../components/stock/ClaimOptionsModal'

const CARD_BACK = 'https://images.pokemontcg.io/back.png'

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
function CardTable({ cards, claimId }) {
  const qc = useQueryClient()
  const { t } = useI18n()
  const [selected,    setSelected]    = useState(new Set())
  const [sellError,   setSellError]   = useState(null)

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

  /* ── Vender: actualiza inventory + inserta en sales ─────────────── */
  const handleSell = async (buyerName, channel) => {
    const ids = selectedCards.map(c => c.inventory_id)

    // 1. Marcar como vendidas en inventory (status Y estado para que el filtro funcione)
    await supabase.from('inventory')
      .update({
        status:       'vendida',
        estado:       'vendida',
        sold_at_date: new Date().toISOString(),
        buyer_name:   buyerName || null,
      })
      .in('id', ids)

    // 2. Insertar una fila en sales por cada carta vendida
    const salesRows = selectedCards.map(c => ({
      store_id:     STORE_ID,
      channel:      channel      || 'claims',
      buyer_name:   buyerName    || null,
      notes:        c.name       || '',
      total_ars:    c.sale       ?? c.ars ?? null,
      sold_at:      new Date().toISOString(),
      estado:       'pendiente',
      inventory_id: c.inventory_id || null,
    }))

    if (salesRows.length > 0) {
      const { error } = await supabase.from('sales').insert(salesRows)
      if (error) {
        setSellError(`Error al registrar en ventas: ${error.message}`)
        console.error('[Claims] sales insert error:', error.message, error)
      } else {
        setSellError(null)
      }
    }

    refreshAll()
  }

  /* ── Reservar: actualiza inventory ─────────────────────────────── */
  const handleReserve = async (buyerName) => {
    const ids = selectedCards.map(c => c.inventory_id)
    await supabase.from('inventory')
      .update({
        status:     'reservada',
        estado:     'reservada',
        buyer_name: buyerName || null,
      })
      .in('id', ids)
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
                      {c.holo && <span className="shrink-0">✨</span>}
                    </div>
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
                colSpan={hasInventoryIds ? 5 : 4}
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
function ClaimRow({ claim }) {
  const { t } = useI18n()
  const [expanded,    setExpanded]    = useState(false)
  const [fullImg,     setFullImg]     = useState(null)
  const [regenCards,  setRegenCards]  = useState(null)

  const hasImages = claim.image_urls?.length > 0
  const hasCards  = claim.cards_data?.length > 0

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
          ${expanded ? 'bg-blue-50' : ''}`}
        onClick={() => setExpanded(e => !e)}
      >
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
            <td colSpan={6} className="px-0 py-0">
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
                      <p className="text-xs font-semibold text-gray-500 mb-2">
                        📋 {t('claims_cards_of_claim')} ({claim.cards_data.length})
                        {claim.cards_data.some(c => c.inventory_id) && (
                          <span className="ml-2 text-[10px] text-violet-500 font-normal">
                            · {t('claims_select_tip')}
                          </span>
                        )}
                      </p>
                      <CardTable cards={claim.cards_data} claimId={claim.id} />
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
  const { data, isLoading, error } = useClaims()
  const claims = data ?? []

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
                {[t('claims_col_date'), t('claims_col_title'), t('claims_col_style'), t('claims_col_cards'), t('claims_col_images'), t('claims_col_theme')].map(h => (
                  <th key={h} className="px-4 py-3 text-left font-semibold whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {claims.map(c => <ClaimRow key={c.id} claim={c} />)}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
