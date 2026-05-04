import { useState } from 'react'
import { useVentas } from '../hooks/useVentas'
import { BarChart, Bar, XAxis, YAxis, Tooltip, Cell, ResponsiveContainer } from 'recharts'
import Spinner from '../components/ui/Spinner'
import EmptyState from '../components/ui/EmptyState'

const fmtARS = (n) => `$${Number(n || 0).toLocaleString('es-AR', { maximumFractionDigits: 0 })}`

/* Normalizar el valor del canal a una etiqueta legible */
const CANAL_LABEL = {
  claims:          '🃏 Claims',
  charly:          '👤 Charly',
  fuera_de_evento: '📍 Fuera de evento',
  instagram:       '📸 Instagram',
  whatsapp:        '💬 WhatsApp',
}
const canalLabel = (v) => CANAL_LABEL[v] ?? v ?? '—'

const CANALES_COLOR = {
  claims:          '#10B981',
  charly:          '#3B6BF5',
  fuera_de_evento: '#F59E0B',
  instagram:       '#E1306C',
  whatsapp:        '#25D366',
}

export default function Ventas() {
  const now = new Date()
  const [year,  setYear]  = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const { data, isLoading } = useVentas(year, month)

  const MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

  const ventas = data ?? []

  // KPIs
  const vendidas       = ventas.length
  const totalFacturado = ventas.reduce((s, v) => s + (v.total_ars_blue || 0), 0)
  const cobrado        = ventas.filter(v => v.estado === 'entregada' || v.paid).reduce((s, v) => s + (v.total_ars_blue || 0), 0)
  const deudaPendiente = totalFacturado - cobrado

  // Por canal
  const porCanal = {}
  for (const v of ventas) {
    const c = v.channel || 'fuera_de_evento'
    porCanal[c] = (porCanal[c] || 0) + (v.total_ars_blue || 0)
  }
  const canalData = Object.entries(porCanal).map(([key, monto]) => ({
    key,
    name:  canalLabel(key),
    monto,
  }))

  // Ganancia neta (simplificado: 30% margen estimado)
  const gananciaNeta = Math.round(totalFacturado * 0.3)

  return (
    <div className="space-y-5">
      {/* Selector mes/año */}
      <div className="flex items-center gap-3 flex-wrap">
        <h2 className="font-extrabold text-gray-900 text-xl flex-1">Ventas del mes</h2>
        <select value={month} onChange={e => setMonth(+e.target.value)}
          className="border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white">
          {MESES.map((m, i) => <option key={i} value={i+1}>{m}</option>)}
        </select>
        <input type="number" value={year} onChange={e => setYear(+e.target.value)}
          className="border border-gray-200 rounded-xl px-3 py-2 text-sm w-24 focus:outline-none focus:ring-2 focus:ring-blue-200" />
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Vendidas este mes', value: vendidas,                    sub: 'cartas',        color: 'text-blue-600'    },
          { label: 'Total facturado',   value: fmtARS(totalFacturado),      sub: 'ARS',           color: 'text-gray-800'    },
          { label: 'Cobrado',           value: fmtARS(cobrado),             sub: 'ARS',           color: 'text-emerald-600' },
          { label: 'Deuda pendiente',   value: fmtARS(deudaPendiente),      sub: 'ARS',           color: 'text-amber-500'   },
        ].map(k => (
          <div key={k.label} className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm">
            <p className="text-xs text-gray-400 mb-1">{k.label}</p>
            <p className={`text-2xl font-extrabold ${k.color}`}>{k.value}</p>
            <p className="text-xs text-gray-400 mt-0.5">{k.sub}</p>
          </div>
        ))}
      </div>

      {isLoading && <div className="flex justify-center py-12"><Spinner size={32} className="text-blue-400" /></div>}

      {!isLoading && ventas.length === 0 && (
        <EmptyState emoji="📊" title="Sin ventas este mes" sub="Las ventas registradas aparecerán acá" />
      )}

      {!isLoading && ventas.length > 0 && (
        <div className="grid lg:grid-cols-2 gap-5">
          {/* Gráfico por canal */}
          <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-semibold text-gray-800">Ventas por canal</h3>
                <p className="text-xs text-gray-400">{MESES[month-1]} {year}</p>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={canalData} barSize={40}>
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
                <Tooltip formatter={v => fmtARS(v)} />
                <Bar dataKey="monto" radius={[6,6,0,0]}>
                  {canalData.map((entry, i) => (
                    <Cell key={i} fill={CANALES_COLOR[entry.key] ?? '#6B7280'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            {/* Ganancia neta */}
            <div className="mt-3 pt-3 border-t border-gray-100 flex justify-between items-center">
              <span className="text-sm text-gray-500">Ganancia neta estimada</span>
              <span className="text-emerald-600 font-bold">+{fmtARS(gananciaNeta)} ARS</span>
            </div>
          </div>

          {/* Resumen por canal */}
          <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
            <h3 className="font-semibold text-gray-800 mb-4">Detalle por canal</h3>
            <div className="space-y-3">
              {canalData.map(c => {
                const pct = totalFacturado > 0 ? (c.monto / totalFacturado) * 100 : 0
                return (
                  <div key={c.key}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="font-medium text-gray-700">{c.name}</span>
                      <span className="text-gray-500">{fmtARS(c.monto)} · {pct.toFixed(0)}%</span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${pct}%`, background: CANALES_COLOR[c.key] ?? '#6B7280' }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* Detalle ventas */}
      {!isLoading && ventas.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h3 className="font-semibold text-gray-800">Detalle ventas — {MESES[month-1]} {year}</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                <tr>
                  {['Fecha','Carta','Canal','Comprador','ARS','Estado'].map(h => (
                    <th key={h} className="px-4 py-3 text-left font-semibold whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {ventas.map(v => (
                  <tr key={v.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                      {new Date(v.created_at).toLocaleDateString('es-AR')}
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-800">{v.card_name || '—'}</td>
                    <td className="px-4 py-3 text-gray-600">{canalLabel(v.channel)}</td>
                    <td className="px-4 py-3 text-gray-600">{v.buyer_name || '—'}</td>
                    <td className="px-4 py-3 text-blue-600 font-semibold whitespace-nowrap">
                      {fmtARS(v.total_ars_blue)}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium
                        ${v.estado === 'entregada' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                        {v.estado || 'pendiente'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
