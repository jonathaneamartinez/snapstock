import { useState } from 'react'
import { useStock }  from '../hooks/useStock'
import Badge         from '../components/ui/Badge'
import Spinner       from '../components/ui/Spinner'
import EmptyState    from '../components/ui/EmptyState'
import { IDIOMAS, CONDICIONES, ESTADOS } from '../constants'

const fmt = (n) => n != null ? `$${Number(n).toLocaleString('es-AR', { maximumFractionDigits: 0 })}` : '—'

export default function Stock() {
  const [filters, setFilters] = useState({})
  const { data, isLoading, error } = useStock(filters)

  const set = (k, v) => setFilters(f => ({ ...f, [k]: v || undefined }))

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className="flex flex-wrap gap-2">
        <input
          type="text" placeholder="Buscar carta…"
          onChange={e => set('busqueda', e.target.value)}
          className="border border-gray-200 rounded-xl px-3 py-2 text-sm flex-1 min-w-40 focus:outline-none focus:ring-2 focus:ring-blue-300"
        />
        <select onChange={e => set('estado', e.target.value)}
          className="border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white">
          <option value="">Todos los estados</option>
          {ESTADOS.map(e => <option key={e}>{e}</option>)}
        </select>
        <select onChange={e => set('idioma', e.target.value)}
          className="border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white">
          <option value="">Todos los idiomas</option>
          {IDIOMAS.map(i => <option key={i.code} value={i.code}>{i.flag} {i.label}</option>)}
        </select>
        <select onChange={e => set('condicion', e.target.value)}
          className="border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white">
          <option value="">Todas las cond.</option>
          {CONDICIONES.map(c => <option key={c}>{c}</option>)}
        </select>
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        {isLoading && (
          <div className="flex justify-center py-16">
            <Spinner size={32} className="text-blue-400" />
          </div>
        )}
        {error && <p className="text-red-500 text-sm p-6">Error: {error.message}</p>}
        {!isLoading && !error && data?.length === 0 && (
          <EmptyState emoji="📭" title="Sin resultados" sub="Probá con otros filtros" />
        )}
        {!isLoading && data?.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                <tr>
                  {['Carta', 'Set', 'Cond.', 'Estado', 'USD', 'ARS Blue', 'Qty'].map(h => (
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
                        <span className="font-medium text-gray-800 truncate max-w-[160px]">
                          {row.nombre_base || row.carta}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{row.set_name}</td>
                    <td className="px-4 py-3"><Badge label={row.condition || row.condicion} /></td>
                    <td className="px-4 py-3"><Badge label={row.status || row.estado} /></td>
                    <td className="px-4 py-3 text-emerald-600 font-semibold whitespace-nowrap">
                      {row.price_usd ? `U$D ${Number(row.price_usd).toFixed(2)}` : '—'}
                    </td>
                    <td className="px-4 py-3 text-blue-600 font-semibold whitespace-nowrap">
                      {fmt(row.price_ars_blue)}
                    </td>
                    <td className="px-4 py-3 text-gray-700">{row.quantity ?? 1}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
