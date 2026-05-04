import { useState, useMemo } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useStock }    from '../hooks/useStock'
import { useMetricas } from '../hooks/useMetricas'
import { useDolar }    from '../hooks/useDolar'
import { supabase }    from '../lib/supabase'
import Badge           from '../components/ui/Badge'
import Spinner         from '../components/ui/Spinner'
import EmptyState      from '../components/ui/EmptyState'
import CardImage       from '../components/ui/CardImage'
import CardModal       from '../components/ui/CardModal'
import InlineEdit      from '../components/ui/InlineEdit'
import Toast           from '../components/ui/Toast'
import { AnimatePresence, motion } from 'framer-motion'
import { IDIOMAS, CONDICIONES } from '../constants'
import { PAGE_SIZE } from '../hooks/useStock'
import { usePrefetchPageImages } from '../hooks/usePrefetchPageImages'
import ClaimOptionsModal from '../components/stock/ClaimOptionsModal'
import { getCardImageUrl } from '../lib/imageCache'

const fmtUSD = (n) => n != null ? `$${Number(n).toFixed(2)}` : '—'
const fmtARS = (n) => n != null ? `$${Number(n).toLocaleString('es-AR', { maximumFractionDigits: 0 })}` : '—'
const fmtFecha = (s) => {
  if (!s) return '—'
  try { return new Date(s).toLocaleDateString('es-AR') } catch { return '—' }
}

const IDIOMA_FLAG = { en: '🇬🇧', es: '🇪🇸', ja: '🇯🇵', fr: '🇫🇷', de: '🇩🇪', pt: '🇧🇷' }

// Columnas con su key de ordenamiento y tipo
const COLS = [
  { h: 'Imagen',      key: null          },
  { h: 'Nombre',      key: 'nombre',      type: 'str'  },
  { h: 'Set',         key: 'set_name',    type: 'str'  },
  { h: 'Nº',          key: 'numero',      type: 'num'  },
  { h: 'Idioma',      key: 'idioma',      type: 'str'  },
  { h: 'Holo',        key: 'holo',        type: 'bool' },
  { h: 'Cond.',       key: 'condicion',   type: 'str'  },
  { h: 'Stock',       key: 'stock',       type: 'num'  },
  { h: 'USD',         key: 'price_usd',   type: 'num'  },
  { h: 'ARS Ofic.',   key: '_ars_ofic',   type: 'num'  },
  { h: 'ARS Blue',    key: '_ars_blue',   type: 'num'  },
  { h: 'P. Venta',    key: 'precio_venta',type: 'num'  },
  { h: 'Estado',      key: 'status',      type: 'str'  },
  { h: 'Comprador',   key: 'buyer_name',  type: 'str'  },
  { h: 'Contacto',    key: 'buyer_contact',type:'str'  },
  { h: 'Notas',       key: 'notes',       type: 'str'  },
  { h: 'F. Reserva',  key: 'reserved_at', type: 'date' },
  { h: 'F. Escaneada',key: 'fecha_escaneada',type:'date'},
]

export default function Stock() {
  const queryClient = useQueryClient()

  const [filters,     setFilters]     = useState({ estado: 'disponible', page: 0 })
  const [modalCard,   setModalCard]   = useState(null)
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [bulkLoading, setBulkLoading] = useState(false)
  const [confirmDel,  setConfirmDel]  = useState(false)
  const [sortCol,     setSortCol]     = useState(null)   // key de la columna
  const [sortDir,     setSortDir]     = useState('asc')  // 'asc' | 'desc'
  const [toast,       setToast]       = useState({ visible: false, mensaje: '', tipo: 'success' })
  const [claimCards,  setClaimCards]  = useState(null)   // array de cartas para claim

  const { data, isLoading, error } = useStock(filters)
  const { data: m } = useMetricas()
  const { blue, oficial } = useDolar()

  const set = (k, v) => {
    setSelectedIds(new Set())
    setFilters(f => ({ ...f, [k]: v || undefined, page: 0 }))
  }
  const goToPage = (p) => {
    setSelectedIds(new Set())
    setFilters(f => ({ ...f, page: p }))
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const rawRows     = data?.rows  ?? []
  const total       = data?.total ?? 0

  // ── Enriquecer filas con ARS calculado cuando Supabase no lo tiene ──────
  const rows = useMemo(() => rawRows.map(r => ({
    ...r,
    _ars_ofic: r.price_ars_oficial ?? (r.price_usd != null && oficial ? Math.round(r.price_usd * oficial) : null),
    _ars_blue: r.price_ars_blue    ?? (r.price_usd != null && blue    ? Math.round(r.price_usd * blue)    : null),
  })), [rawRows, blue, oficial])

  const imageMap = usePrefetchPageImages(rows)

  // ── Función para cambiar columna de sort ────────────────────────────────
  const handleSort = (key) => {
    if (!key) return
    if (sortCol === key) {
      sortDir === 'asc' ? setSortDir('desc') : (setSortCol(null), setSortDir('asc'))
    } else {
      setSortCol(key)
      setSortDir('asc')
    }
  }

  // ── Rows ordenadas ───────────────────────────────────────────────────────
  const sortedRows = useMemo(() => {
    if (!sortCol) return rows
    const col = COLS.find(c => c.key === sortCol)
    return [...rows].sort((a, b) => {
      let va = a[sortCol], vb = b[sortCol]
      if (col?.type === 'num')  { va = Number(va ?? -Infinity); vb = Number(vb ?? -Infinity) }
      if (col?.type === 'date') { va = va ? new Date(va).getTime() : 0; vb = vb ? new Date(vb).getTime() : 0 }
      if (col?.type === 'bool') { va = va ? 1 : 0; vb = vb ? 1 : 0 }
      if (col?.type === 'str')  { va = (va ?? '').toLowerCase(); vb = (vb ?? '').toLowerCase() }
      if (va < vb) return sortDir === 'asc' ? -1 : 1
      if (va > vb) return sortDir === 'asc' ?  1 : -1
      return 0
    })
  }, [rows, sortCol, sortDir])
  const currentPage = data?.page  ?? 0
  const totalPages  = Math.ceil(total / PAGE_SIZE)

  const allSelected  = rows.length > 0 && rows.every(r => selectedIds.has(r.inventory_id))
  const someSelected = selectedIds.size > 0

  const disponibles = rows.filter(r => r.status === 'disponible').length
  const reservadas  = rows.filter(r => r.status === 'reservada').length
  const valorUSD    = rows.reduce((s, r) => s + (r.price_usd || 0) * (r.stock || 1), 0)

  const toggleAll = () => {
    if (allSelected) setSelectedIds(new Set())
    else setSelectedIds(new Set(rows.map(r => r.inventory_id)))
  }

  const toggleOne = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  // ── Toast helper ────────────────────────────────────────────────────────
  const showToast = (mensaje, tipo = 'success') => {
    setToast({ visible: true, mensaje, tipo })
    setTimeout(() => setToast(t => ({ ...t, visible: false })), 2500)
  }

  // ── Guardar comprador inline (Feature 1) ─────────────────────────────────
  const saveBuyerName = async (inventoryId, nuevoNombre) => {
    const { error } = await supabase
      .from('inventory')
      .update({ buyer_name: nuevoNombre })
      .eq('id', inventoryId)
    if (!error) {
      queryClient.invalidateQueries({ queryKey: ['stock'] })
      showToast('Comprador actualizado')
    }
  }

  // ── Guardar precio de venta inline (Feature 2) ──────────────────────────
  const saveSalePrice = async (inventoryId, nuevoPrecio) => {
    const { error } = await supabase
      .from('inventory')
      .update({ sale_price_ars: nuevoPrecio })
      .eq('id', inventoryId)
    if (!error) {
      queryClient.invalidateQueries({ queryKey: ['stock'] })
      showToast('Precio de venta actualizado')
    }
  }

  // ── Acción: marcar como vendidas ────────────────────────────────────────
  const handleMarkSold = async () => {
    setBulkLoading(true)
    const ids = [...selectedIds]
    await supabase
      .from('inventory')
      .update({ status: 'vendida', estado: 'vendida' })
      .in('id', ids)
    queryClient.invalidateQueries({ queryKey: ['stock'] })
    queryClient.invalidateQueries({ queryKey: ['metricas'] })
    setSelectedIds(new Set())
    setBulkLoading(false)
  }

  // ── Acción: preparar claim (solo cartas disponibles) ───────────────────
  const handleClaim = async () => {
    const disponiblesSeleccionadas = sortedRows.filter(
      r => selectedIds.has(r.inventory_id) && r.status === 'disponible'
    )
    if (disponiblesSeleccionadas.length === 0) {
      showToast('Seleccioná cartas disponibles para el claim', 'error')
      return
    }
    // Refrescar image_urls desde Supabase (CardImage puede haberlas guardado
    // después de que se cargó el cache de useStock)
    const cardIds = [...new Set(disponiblesSeleccionadas.map(r => r.card_id).filter(Boolean))]
    let freshImages = {}
    if (cardIds.length > 0) {
      const { data } = await supabase.from('cards').select('id, image_url').in('id', cardIds)
      if (data) data.forEach(c => { if (c.image_url) freshImages[c.id] = c.image_url })
    }
    setClaimCards(disponiblesSeleccionadas.map(r => ({
      ...r,
      // Prioridad: cache en memoria (CardImage ya la cargó) → Supabase fresco → stale cache
      image_url: getCardImageUrl(r.card_id) || freshImages[r.card_id] || r.image_url || '',
    })))
  }

  // ── Acción: eliminar ────────────────────────────────────────────────────
  const handleDelete = async () => {
    setBulkLoading(true)
    const ids = [...selectedIds]
    await supabase.from('inventory').delete().in('id', ids)
    queryClient.invalidateQueries({ queryKey: ['stock'] })
    queryClient.invalidateQueries({ queryKey: ['metricas'] })
    setSelectedIds(new Set())
    setConfirmDel(false)
    setBulkLoading(false)
  }

  return (
    <div className="space-y-4 pb-28">

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Total cartas',  value: (m?.totalCartas ?? 0).toLocaleString('es-AR'), sub: 'en stock',     color: 'text-blue-600'    },
          { label: 'Disponibles',   value: disponibles.toLocaleString('es-AR'),           sub: 'para venta',   color: 'text-emerald-600' },
          { label: 'Reservadas',    value: reservadas.toLocaleString('es-AR'),            sub: 'por entregar', color: 'text-amber-500'   },
          { label: 'Valor total',   value: `$${valorUSD.toLocaleString('en', { maximumFractionDigits: 0 })}`, sub: 'USD mercado', color: 'text-gray-800' },
        ].map(k => (
          <div key={k.label} className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm">
            <p className="text-xs text-gray-400 mb-1">{k.label}</p>
            <p className={`text-2xl font-extrabold ${k.color}`}>{k.value}</p>
            <p className="text-xs text-gray-400 mt-0.5">{k.sub}</p>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm">
        <div className="flex flex-wrap gap-2">
          <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
            {[
              { v: '',           l: 'Todos'      },
              { v: 'disponible', l: 'Disponible' },
              { v: 'reservada',  l: 'Reservada'  },
              { v: 'vendida',    l: 'Vendida'    },
            ].map(e => (
              <button key={e.v} onClick={() => set('estado', e.v)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition
                  ${(filters.estado ?? '') === e.v
                    ? 'bg-white shadow text-gray-800'
                    : 'text-gray-500 hover:text-gray-700'}`}>
                {e.l}
              </button>
            ))}
          </div>
          <input type="text" placeholder="Buscar por nombre o set…"
            onChange={e => set('busqueda', e.target.value)}
            className="border border-gray-200 rounded-xl px-3 py-1.5 text-sm flex-1 min-w-40
                       focus:outline-none focus:ring-2 focus:ring-blue-200" />
          <select onChange={e => set('idioma', e.target.value)}
            className="border border-gray-200 rounded-xl px-3 py-1.5 text-sm bg-white">
            <option value="">Idioma</option>
            {IDIOMAS.map(i => <option key={i.code} value={i.code}>{i.flag} {i.label}</option>)}
          </select>
          <select onChange={e => set('condicion', e.target.value)}
            className="border border-gray-200 rounded-xl px-3 py-1.5 text-sm bg-white">
            <option value="">Condición</option>
            {CONDICIONES.map(c => <option key={c}>{c}</option>)}
          </select>
        </div>
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        {isLoading && <div className="flex justify-center py-16"><Spinner size={32} className="text-blue-400" /></div>}
        {error     && <p className="text-red-500 text-sm p-6">Error: {error.message}</p>}
        {!isLoading && !error && rows.length === 0 && (
          <EmptyState emoji="📭" title="Sin resultados" sub="Probá con otros filtros" />
        )}

        {!isLoading && rows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 text-gray-400 uppercase sticky top-0 z-10">
                <tr>
                  <th className="pl-4 pr-2 py-3">
                    <input type="checkbox" checked={allSelected} onChange={toggleAll}
                      className="w-3.5 h-3.5 rounded accent-blue-600 cursor-pointer" />
                  </th>
                  {COLS.map(col => (
                    <th key={col.h}
                      onClick={() => handleSort(col.key)}
                      className={`px-3 py-3 text-left font-semibold whitespace-nowrap select-none
                        ${col.key ? 'cursor-pointer hover:text-gray-600 hover:bg-gray-100 transition' : ''}`}>
                      <span className="inline-flex items-center gap-1">
                        {col.h}
                        {col.key && sortCol === col.key && (
                          <span className="text-blue-500">{sortDir === 'asc' ? '↑' : '↓'}</span>
                        )}
                        {col.key && sortCol !== col.key && (
                          <span className="text-gray-300 opacity-0 group-hover:opacity-100">↕</span>
                        )}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sortedRows.map(r => {
                  const isSelected = selectedIds.has(r.inventory_id)
                  return (
                    <tr key={r.inventory_id}
                      className={`transition ${isSelected ? 'bg-blue-50' : 'hover:bg-gray-50'}`}>
                      {/* Checkbox fila */}
                      <td className="pl-4 pr-2 py-2">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleOne(r.inventory_id)}
                          className="w-3.5 h-3.5 rounded accent-blue-600 cursor-pointer"
                        />
                      </td>
                      {/* Imagen */}
                      <td className="px-3 py-2">
                        <CardImage
                          imageUrl={r.image_url || imageMap[r.card_id]}
                          cardId={r.card_id}
                          nombre={r.nombre}
                          numero={r.numero}
                          idioma={r.idioma}
                          setName={r.set_name}
                          onOpen={(imgs) => setModalCard({
                            src:         imgs.src,
                            nombre:      r.nombre,
                            set:         r.set_name,
                            numero:      r.numero,
                            condicion:   r.condicion,
                            statusLabel: r.status,
                            priceUSD:    r.price_usd      != null ? `$${Number(r.price_usd).toFixed(2)}` : null,
                            priceARS:    r.price_ars_blue != null ? fmtARS(r.price_ars_blue) : null,
                          })}
                        />
                      </td>
                      <td className="px-3 py-2 font-medium text-gray-800 max-w-[140px]">
                        <span className="truncate block">{r.nombre || '—'}</span>
                      </td>
                      <td className="px-3 py-2 text-gray-500 max-w-[100px]">
                        <span className="truncate block">{r.set_name || '—'}</span>
                      </td>
                      <td className="px-3 py-2 text-gray-500">{r.numero || '—'}</td>
                      <td className="px-3 py-2 text-center">{IDIOMA_FLAG[r.idioma] ?? r.idioma ?? '—'}</td>
                      <td className="px-3 py-2 text-center">{r.holo ? '✨' : '—'}</td>
                      <td className="px-3 py-2"><Badge label={r.condicion} /></td>
                      <td className="px-3 py-2 font-semibold text-gray-700 text-center">{r.stock}</td>
                      <td className="px-3 py-2 text-emerald-600 font-semibold whitespace-nowrap">{fmtUSD(r.price_usd)}</td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <span className={r.price_ars_oficial != null ? 'text-gray-600' : 'text-gray-400'}>
                          {fmtARS(r._ars_ofic)}
                        </span>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <span className={`font-semibold ${r.price_ars_blue != null ? 'text-blue-600' : 'text-blue-400'}`}>
                          {fmtARS(r._ars_blue)}
                        </span>
                      </td>
                      {/* P. Venta editable (Feature 2) */}
                      <td className="px-3 py-2 whitespace-nowrap">
                        <InlineEdit
                          value={r.sale_price_ars ?? r.precio_venta ?? null}
                          type="number"
                          placeholder="Sin precio"
                          formatDisplay={v => v != null ? fmtARS(v) : null}
                          onSave={v => saveSalePrice(r.inventory_id, v)}
                        />
                      </td>
                      <td className="px-3 py-2"><Badge label={r.status} /></td>
                      {/* Comprador editable solo si está reservada (Feature 1) */}
                      <td className="px-3 py-2 text-gray-600">
                        {r.status === 'reservada'
                          ? <InlineEdit
                              value={r.buyer_name ?? null}
                              type="text"
                              placeholder="Sin nombre"
                              onSave={v => saveBuyerName(r.inventory_id, v)}
                            />
                          : (r.buyer_name || '—')
                        }
                      </td>
                      <td className="px-3 py-2 text-gray-500">{r.buyer_contact || '—'}</td>
                      <td className="px-3 py-2 text-gray-400 max-w-[100px]">
                        <span className="truncate block">{r.notes || '—'}</span>
                      </td>
                      <td className="px-3 py-2 text-gray-400 whitespace-nowrap">{fmtFecha(r.reserved_at)}</td>
                      <td className="px-3 py-2 text-gray-400 whitespace-nowrap">{fmtFecha(r.fecha_escaneada)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal carta */}
      <CardModal card={modalCard} onClose={() => setModalCard(null)} />

      {/* Modal claim */}
      {claimCards && (
        <ClaimOptionsModal
          cards={claimCards}
          onClose={() => setClaimCards(null)}
          onConfirmed={() => {
            setClaimCards(null)
            showToast('Claim guardado correctamente')
          }}
        />
      )}

      {/* Toast */}
      <Toast mensaje={toast.mensaje} tipo={toast.tipo} visible={toast.visible} />

      {/* ── Paginador flotante ──────────────────────────────────────────────── */}
      {totalPages > 1 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40
                        flex items-center gap-2 px-4 py-2
                        bg-white border border-gray-200 rounded-2xl shadow-lg
                        text-xs text-gray-500">
          <span className="hidden sm:block whitespace-nowrap font-medium text-gray-400 mr-1">
            {total.toLocaleString('es-AR')} cartas
          </span>
          <div className="w-px h-4 bg-gray-200 hidden sm:block" />

          <button onClick={() => goToPage(0)} disabled={currentPage === 0}
            className="px-1.5 py-1 rounded-lg hover:bg-gray-100 disabled:opacity-30 transition font-bold">
            «
          </button>
          <button onClick={() => goToPage(currentPage - 1)} disabled={currentPage === 0}
            className="px-2 py-1 rounded-lg hover:bg-gray-100 disabled:opacity-30 transition">
            ‹
          </button>

          {Array.from({ length: totalPages }, (_, i) => i)
            .filter(i => Math.abs(i - currentPage) <= 2)
            .map(i => (
              <button key={i} onClick={() => goToPage(i)}
                className={`w-7 h-7 rounded-lg text-xs font-semibold transition
                  ${i === currentPage
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'hover:bg-gray-100 text-gray-600'}`}>
                {i + 1}
              </button>
            ))
          }

          <button onClick={() => goToPage(currentPage + 1)} disabled={currentPage >= totalPages - 1}
            className="px-2 py-1 rounded-lg hover:bg-gray-100 disabled:opacity-30 transition">
            ›
          </button>
          <button onClick={() => goToPage(totalPages - 1)} disabled={currentPage >= totalPages - 1}
            className="px-1.5 py-1 rounded-lg hover:bg-gray-100 disabled:opacity-30 transition font-bold">
            »
          </button>

          <div className="w-px h-4 bg-gray-200" />
          <span className="whitespace-nowrap text-gray-400">
            {currentPage + 1} / {totalPages}
          </span>
        </div>
      )}

      {/* ── Barra de acciones bulk ──────────────────────────────────────────── */}
      <AnimatePresence>
        {someSelected && !confirmDel && (
          <motion.div
            key="bulk-bar"
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0,  opacity: 1 }}
            exit={{    y: 80, opacity: 0 }}
            transition={{ type: 'spring', damping: 22, stiffness: 300 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50
                       flex items-center gap-3 px-5 py-3
                       bg-gray-900 text-white rounded-2xl shadow-2xl"
          >
            <span className="text-sm font-semibold whitespace-nowrap">
              {selectedIds.size} {selectedIds.size === 1 ? 'carta' : 'cartas'}
            </span>
            <div className="w-px h-5 bg-white/20" />
            <button
              onClick={handleMarkSold}
              disabled={bulkLoading}
              className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400
                         disabled:opacity-50 rounded-xl text-xs font-semibold transition whitespace-nowrap">
              {bulkLoading ? '…' : '✓ Marcar vendidas'}
            </button>
            <button
              onClick={handleClaim}
              disabled={bulkLoading}
              className="px-3 py-1.5 bg-violet-500 hover:bg-violet-400
                         disabled:opacity-50 rounded-xl text-xs font-semibold transition whitespace-nowrap">
              🃏 Claim
            </button>
            <button
              onClick={() => setConfirmDel(true)}
              disabled={bulkLoading}
              className="px-3 py-1.5 bg-red-500 hover:bg-red-400
                         disabled:opacity-50 rounded-xl text-xs font-semibold transition">
              🗑 Eliminar
            </button>
            <button
              onClick={() => setSelectedIds(new Set())}
              className="w-6 h-6 flex items-center justify-center rounded-full
                         bg-white/10 hover:bg-white/20 text-white/70 text-base transition">
              ×
            </button>
          </motion.div>
        )}

        {/* Confirmación eliminar */}
        {confirmDel && (
          <motion.div
            key="confirm-bar"
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0,  opacity: 1 }}
            exit={{    y: 80, opacity: 0 }}
            transition={{ type: 'spring', damping: 22, stiffness: 300 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50
                       flex items-center gap-3 px-5 py-3
                       bg-red-600 text-white rounded-2xl shadow-2xl"
          >
            <span className="text-sm font-semibold whitespace-nowrap">
              ¿Eliminar {selectedIds.size} {selectedIds.size === 1 ? 'carta' : 'cartas'}? No se puede deshacer.
            </span>
            <button
              onClick={handleDelete}
              disabled={bulkLoading}
              className="px-3 py-1.5 bg-white text-red-600 hover:bg-red-50
                         disabled:opacity-50 rounded-xl text-xs font-bold transition">
              {bulkLoading ? '…' : 'Sí, eliminar'}
            </button>
            <button
              onClick={() => setConfirmDel(false)}
              className="px-3 py-1.5 bg-white/20 hover:bg-white/30
                         rounded-xl text-xs font-semibold transition">
              Cancelar
            </button>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  )
}
