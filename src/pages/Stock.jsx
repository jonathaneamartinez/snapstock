import { useState } from 'react'
import { useStock }    from '../hooks/useStock'
import { useMetricas } from '../hooks/useMetricas'
import Badge           from '../components/ui/Badge'
import Spinner         from '../components/ui/Spinner'
import EmptyState      from '../components/ui/EmptyState'
import CardImage       from '../components/ui/CardImage'
import CardModal       from '../components/ui/CardModal'
import { IDIOMAS, CONDICIONES, ESTADOS } from '../constants'

const fmtUSD = (n) => n != null ? `$${Number(n).toFixed(2)}` : '—'
const fmtARS = (n) => n != null ? `$${Number(n).toLocaleString('es-AR', { maximumFractionDigits: 0 })}` : '—'
const fmtFecha = (s) => {
  if (!s) return '—'
  try { return new Date(s).toLocaleDateString('es-AR') } catch { return '—' }
}

const IDIOMA_FLAG = { en: '🇬🇧', es: '🇪🇸', ja: '🇯🇵', fr: '🇫🇷', de: '🇩🇪', pt: '🇧🇷' }

export default function Stock() {
  const [filters,    setFilters]    = useState({ estado: 'disponible' })
  const [modalCard,  setModalCard]  = useState(null)
  const { data, isLoading, error } = useStock(filters)
  const { data: m } = useMetricas()

  const set = (k, v) => setFilters(f => ({ ...f, [k]: v || undefined }))

  const rows = data ?? []
  const disponibles = rows.filter(r => r.status === 'disponible').length
  const reservadas  = rows.filter(r => r.status === 'reservada').length
  const valorUSD    = rows.reduce((s, r) => s + (r.price_usd || 0) * (r.stock || 1), 0)

  return (
    <div className="space-y-4">
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
          {/* Tabs estado */}
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
              <thead className="bg-gray-50 text-gray-400 uppercase sticky top-0">
                <tr>
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
                {rows.map(r => (
                  <tr key={r.inventory_id} className="hover:bg-gray-50 transition">
                    {/* Imagen */}
                    <td className="px-3 py-2">
                      <CardImage
                        imageUrl={r.image_url}
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
                          priceUSD:    r.price_usd   != null ? `$${Number(r.price_usd).toFixed(2)}`  : null,
                          priceARS:    r.price_ars_blue != null ? fmtARS(r.price_ars_blue) : null,
                        })}
                      />
                    </td>
                    {/* Nombre */}
                    <td className="px-3 py-2 font-medium text-gray-800 max-w-[140px]">
                      <span className="truncate block">{r.nombre || '—'}</span>
                    </td>
                    {/* Set */}
                    <td className="px-3 py-2 text-gray-500 max-w-[100px]">
                      <span className="truncate block">{r.set_name || '—'}</span>
                    </td>
                    {/* Número */}
                    <td className="px-3 py-2 text-gray-500">{r.numero || '—'}</td>
                    {/* Idioma */}
                    <td className="px-3 py-2 text-center">
                      {IDIOMA_FLAG[r.idioma] ?? r.idioma ?? '—'}
                    </td>
                    {/* Holo */}
                    <td className="px-3 py-2 text-center">
                      {r.holo ? '✨' : '—'}
                    </td>
                    {/* Condición */}
                    <td className="px-3 py-2"><Badge label={r.condicion} /></td>
                    {/* Stock */}
                    <td className="px-3 py-2 font-semibold text-gray-700 text-center">{r.stock}</td>
                    {/* USD */}
                    <td className="px-3 py-2 text-emerald-600 font-semibold whitespace-nowrap">{fmtUSD(r.price_usd)}</td>
                    {/* ARS Oficial */}
                    <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{fmtARS(r.price_ars_oficial)}</td>
                    {/* ARS Blue */}
                    <td className="px-3 py-2 text-blue-600 font-semibold whitespace-nowrap">{fmtARS(r.price_ars_blue)}</td>
                    {/* Precio venta */}
                    <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{fmtARS(r.precio_venta)}</td>
                    {/* Estado */}
                    <td className="px-3 py-2"><Badge label={r.status} /></td>
                    {/* Comprador */}
                    <td className="px-3 py-2 text-gray-600">{r.buyer_name || '—'}</td>
                    {/* Contacto */}
                    <td className="px-3 py-2 text-gray-500">{r.buyer_contact || '—'}</td>
                    {/* Notas */}
                    <td className="px-3 py-2 text-gray-400 max-w-[100px]">
                      <span className="truncate block">{r.notes || '—'}</span>
                    </td>
                    {/* Fecha reserva */}
                    <td className="px-3 py-2 text-gray-400 whitespace-nowrap">{fmtFecha(r.reserved_at)}</td>
                    {/* Fecha escaneada */}
                    <td className="px-3 py-2 text-gray-400 whitespace-nowrap">{fmtFecha(r.fecha_escaneada)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="px-4 py-3 border-t border-gray-100 text-xs text-gray-400">
              {rows.length} registros
            </div>
          </div>
        )}
      </div>

      {/* Modal carta */}
      <CardModal card={modalCard} onClose={() => setModalCard(null)} />
    </div>
  )
}
