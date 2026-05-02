import { useState } from 'react'
import { useVentas } from '../hooks/useVentas'
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import Spinner from '../components/ui/Spinner'

export default function Ventas() {
  const now = new Date()
  const [year,  setYear]  = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const { data, isLoading } = useVentas(year, month)

  const MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

  const resumen = {}
  for (const v of data ?? []) {
    const canal = v.channel || 'Otros'
    resumen[canal] = (resumen[canal] || 0) + (v.total_ars_blue || 0)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <h2 className="font-extrabold text-gray-900 text-xl flex-1">Ventas del mes</h2>
        <select value={month} onChange={e => setMonth(+e.target.value)}
          className="border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white">
          {MESES.map((m, i) => <option key={i} value={i+1}>{m}</option>)}
        </select>
        <input type="number" value={year} onChange={e => setYear(+e.target.value)}
          className="border border-gray-200 rounded-xl px-3 py-2 text-sm w-24" />
      </div>

      {isLoading
        ? <div className="flex justify-center py-16"><Spinner size={32} className="text-blue-400" /></div>
        : (
          <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
            <h3 className="font-semibold text-gray-700 mb-4">Ventas por canal (ARS Blue)</h3>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={Object.entries(resumen).map(([k, v]) => ({ canal: k, monto: v }))}>
                <XAxis dataKey="canal" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={v => `$${Number(v).toLocaleString('es-AR')}`} />
                <Bar dataKey="monto" fill="#3B6BF5" radius={[6,6,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )
      }

      {/* Detalle */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
            <tr>
              {['Fecha','Canal','Total USD','Total ARS Blue'].map(h => (
                <th key={h} className="px-4 py-3 text-left font-semibold">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {(data ?? []).map(v => (
              <tr key={v.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-gray-500">{new Date(v.created_at).toLocaleDateString('es-AR')}</td>
                <td className="px-4 py-3 font-medium text-gray-800">{v.channel || '—'}</td>
                <td className="px-4 py-3 text-emerald-600">U$D {Number(v.total_usd||0).toFixed(2)}</td>
                <td className="px-4 py-3 text-blue-600 font-semibold">
                  ${Number(v.total_ars_blue||0).toLocaleString('es-AR')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
