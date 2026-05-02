import { useState } from 'react'
import { useStock }    from '../hooks/useStock'
import { useMetricas } from '../hooks/useMetricas'
import Badge           from '../components/ui/Badge'
import Spinner         from '../components/ui/Spinner'
import EmptyState      from '../components/ui/EmptyState'
import { IDIOMAS, CONDICIONES, ESTADOS } from '../constants'

const fmtUSD = (n) => n != null ? `$${Number(n).toFixed(2)}` : '—'
const fmtARS = (n) => n != null ? `$${Number(n).toLocaleString('es-AR', { maximumFractionDigits: 0 })}` : '—'

export default function Stock() {
  const [filters, setFilters] = useState({ estado: 'disponible' })
  const { data, isLoading, error } = useStock(filters)
  const { data: m } = useMetricas()

  const set = (k, v) => setFilters(f => ({ ...f, [k]: v || undefined }))

  const total      = (m?.totalCartas ?? 0)
  const disponibles = data?.filter(r => (r.status || r.estado) === 'disponible').length ?? 0
  const reservadas  = data?.filter(r => (r.status || r.estado) === 'reservada').length  ?? 0
  const valorUSD    = data?.reduce((s, r) => s + (r.price_usd || 0) * (r.quantity || 1), 0) ?? 0

  return (
    <div className="space-y-5">
      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Total cartas',  value: total.toLocaleString('es-AR'),          sub: 'en stock',          color: 'text-blue-600'    },
          { label: 'Disponibles',   value: disponibles.toLocaleString('es-AR'),    sub: 'para venta',        color: 'text-emerald-600' },
          { label: 'Reservadas',    value: reservadas.toLocaleString('es-AR'),     sub: 'por entregar',      color: 'text-amber-500'   },
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
          {/* Tabs de estado */}
          <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
            {['', 'disponible', 'reservada', 'vendida'].map(e => (
              <button
                key={e}
                onClick={() => set('estado', e)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition
                  ${(filters.estado ?? '') === e
                    ? 'bg-white shadow text-gray-800'
                    : 'text-gray-500 hover:text-gray-700'}`}
              >
                {e === '' ? 'Todos' : e.charAt(0).toUpperCase() + e.slice(1)}
              </button>
            ))}
          </div>

          <input
            type="text" placeholder="Buscar carta…"
            onChange={e => set('busqueda', e.target.value)}
            className="border border-gray-200 rounded-xl px-3 py-1.5 text-sm flex-1 min-w-36
                       focus:outline-none focus:ring-2 focus:ring-blue-200"
          />
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
        {!isLoading && !error && data?.length === 0 && (
          <EmptyState emoji="📭" title="Sin resultados" sub="Probá con otros filtros" />
        )}
        {!isLoading && data?.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                <tr>
                  {['Carta', 'Set', 'Cond.', 'Stock', 'USD', 'ARS Blue', 'Precio venta', 'Estado', 'Comprador'].map(h => (
                    <th key={h} className="px-4 py-3 text-left font-semibold whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.map(row => (
                  <tr key={row.inventory_id} className="hover:bg-gray-50 transition">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {row.image_url && (
                          <img src={row.image_url} alt="" className="w-7 h-10 object-cover rounded" />
                        )}
                        <span className="font-medium text-gray-800 truncate max-w-[140px]">
                          {row.nombre_base || row.carta}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap max-w-[100px] truncate">{row.set_name}</td>
                    <td className="px-4 py-3"><Badge label={row.condition || row.condicion} /></td>
                    <td className="px-4 py-3 font-semibold text-gray-700">{row.quantity ?? 1}</td>
                    <td className="px-4 py-3 text-emerald-600 font-semibold whitespace-nowrap">{fmtUSD(row.price_usd)}</td>
                    <td className="px-4 py-3 text-blue-600 font-semibold whitespace-nowrap">{fmtARS(row.price_ars_blue)}</td>
                    <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{fmtARS(row.price_ars_oficial)}</td>
                    <td className="px-4 py-3"><Badge label={row.status || row.estado} /></td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{row.buyer_name || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="px-4 py-3 border-t border-gray-100 text-xs text-gray-400">
              {data.length} registros
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
