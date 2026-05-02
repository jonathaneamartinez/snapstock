import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useStock }    from '../hooks/useStock'
import { useMetricas } from '../hooks/useMetricas'
import { supabase }    from '../lib/supabase'
import Badge           from '../components/ui/Badge'
import Spinner         from '../components/ui/Spinner'
import EmptyState      from '../components/ui/EmptyState'
import CardImage       from '../components/ui/CardImage'
import CardModal       from '../components/ui/CardModal'
import { AnimatePresence, motion } from 'framer-motion'
import { IDIOMAS, CONDICIONES } from '../constants'

const fmtUSD = (n) => n != null ? `$${Number(n).toFixed(2)}` : '—'
const fmtARS = (n) => n != null ? `$${Number(n).toLocaleString('es-AR', { maximumFractionDigits: 0 })}` : '—'
const fmtFecha = (s) => {
  if (!s) return '—'
  try { return new Date(s).toLocaleDateString('es-AR') } catch { return '—' }
}

const IDIOMA_FLAG = { en: '🇬🇧', es: '🇪🇸', ja: '🇯🇵', fr: '🇫🇷', de: '🇩🇪', pt: '🇧🇷' }

export default function Stock() {
  const queryClient = useQueryClient()

  const [filters,     setFilters]     = useState({ estado: 'disponible' })
  const [modalCard,   setModalCard]   = useState(null)
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [bulkLoading, setBulkLoading] = useState(false)
  const [confirmDel,  setConfirmDel]  = useState(false)

  const { data, isLoading, error } = useStock(filters)
  const { data: m } = useMetricas()

  const set = (k, v) => {
    setSelectedIds(new Set())
    setFilters(f => ({ ...f, [k]: v || undefined }))
  }

  const rows        = data ?? []
  const allSelected = rows.length > 0 && rows.every(r => selectedIds.has(r.inventory_id))
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
    <div className="space-y-4 pb-24">

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
                  {/* Checkbox select all */}
                  <th className="pl-4 pr-2 py-3">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleAll}
                      className="w-3.5 h-3.5 rounded accent-blue-600 cursor-pointer"
                    />
                  </th>
                  {[
                    'Imagen','Nombre','Set','Nº','Idioma','Holo',
                    'Cond.','Stock','USD','ARS Ofic.','ARS Blue',
                    'P. Venta','Estado','Comprador','Contacto',
                    'Notas','F. Reserva','F. Escaneada',
                  ].map(h => (
                    <th key={h} className="px-3 py-3 text-left font-semibold whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map(r => {
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
                          imageUrl={r.image_url}
                          cardId={r.card_id}
                          nombre={r.nombre}
                          numero={r.numero}
                          idioma={r.idioma}
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
                      <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{fmtARS(r.price_ars_oficial)}</td>
                      <td className="px-3 py-2 text-blue-600 font-semibold whitespace-nowrap">{fmtARS(r.price_ars_blue)}</td>
                      <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{fmtARS(r.precio_venta)}</td>
                      <td className="px-3 py-2"><Badge label={r.status} /></td>
                      <td className="px-3 py-2 text-gray-600">{r.buyer_name || '—'}</td>
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
            <div className="px-4 py-3 border-t border-gray-100 text-xs text-gray-400">
              {rows.length} registros
              {someSelected && <span className="ml-2 text-blue-500 font-semibold">· {selectedIds.size} seleccionadas</span>}
            </div>
          </div>
        )}
      </div>

      {/* Modal carta */}
      <CardModal card={modalCard} onClose={() => setModalCard(null)} />

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
