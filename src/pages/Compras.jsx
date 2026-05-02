import { useState } from 'react'
import EmptyState from '../components/ui/EmptyState'

const fmtARS = (n) => `$${Number(n || 0).toLocaleString('es-AR', { maximumFractionDigits: 0 })}`
const fmtUSD = (n) => `$${Number(n || 0).toLocaleString('en',    { maximumFractionDigits: 0 })}`

// Por ahora con datos de ejemplo hasta que se conecte la tabla purchases
const MOCK_COMPRAS = [
  { fecha: '12/04', vendedor: 'Colección JL',      cartas: 45,  usd: 320,  ars: 384000,  estado: 'pagada'        },
  { fecha: '05/04', vendedor: 'TCG Argentina',     cartas: 120, usd: 850,  ars: 1020000, estado: 'deuda parcial' },
  { fecha: '28/03', vendedor: 'Feria Palermo',     cartas: 30,  usd: 180,  ars: 216000,  estado: 'pagada'        },
  { fecha: '20/03', vendedor: 'Hernán (Singles)',  cartas: 200, usd: 1200, ars: 1440000, estado: 'pagada'        },
  { fecha: '10/03', vendedor: 'Import JP',         cartas: 15,  usd: 280,  ars: 336000,  estado: 'deuda'         },
]

const ESTADO_CLS = {
  'pagada':        'bg-emerald-100 text-emerald-700',
  'deuda parcial': 'bg-amber-100   text-amber-700',
  'deuda':         'bg-red-100     text-red-700',
}

export default function Compras() {
  const [showForm, setShowForm] = useState(false)

  const comprasMes    = MOCK_COMPRAS.length
  const cartasTotal   = MOCK_COMPRAS.reduce((s, c) => s + c.cartas, 0)
  const invertidoUSD  = MOCK_COMPRAS.reduce((s, c) => s + c.usd,    0)
  const roi           = 36 // % estimado

  const totalInvertido = MOCK_COMPRAS.reduce((s, c) => s + c.ars, 0)
  const totalVendido   = Math.round(totalInvertido * 1.36)

  return (
    <div className="space-y-5">
      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Compras este mes', value: comprasMes,          sub: 'operaciones', color: 'text-blue-600'    },
          { label: 'Cartas compradas', value: cartasTotal,         sub: 'unidades',    color: 'text-gray-800'    },
          { label: 'Invertido USD',    value: fmtUSD(invertidoUSD), sub: 'este mes',    color: 'text-amber-500'   },
          { label: 'ROI del mes',      value: `+${roi}%`,           sub: 'retorno',     color: 'text-emerald-600' },
        ].map(k => (
          <div key={k.label} className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm">
            <p className="text-xs text-gray-400 mb-1">{k.label}</p>
            <p className={`text-2xl font-extrabold ${k.color}`}>{k.value}</p>
            <p className="text-xs text-gray-400 mt-0.5">{k.sub}</p>
          </div>
        ))}
      </div>

      {/* Historial */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-semibold text-gray-800">Historial de compras</h3>
          <button
            onClick={() => setShowForm(true)}
            className="px-3 py-1.5 bg-blue-600 text-white text-xs font-semibold rounded-xl hover:bg-blue-500 transition"
          >
            + Registrar compra
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
              <tr>
                {['Fecha','Vendedor','Cartas','USD','ARS','Estado',''].map((h, i) => (
                  <th key={i} className="px-4 py-3 text-left font-semibold whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {MOCK_COMPRAS.map((c, i) => (
                <tr key={i} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-500">{c.fecha}</td>
                  <td className="px-4 py-3 font-medium text-gray-800">{c.vendedor}</td>
                  <td className="px-4 py-3 text-gray-700">{c.cartas}</td>
                  <td className="px-4 py-3 text-emerald-600 font-semibold">{fmtUSD(c.usd)}</td>
                  <td className="px-4 py-3 text-blue-600 font-semibold whitespace-nowrap">{fmtARS(c.ars)}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${ESTADO_CLS[c.estado] ?? 'bg-gray-100 text-gray-600'}`}>
                      {c.estado}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <button className="text-xs text-blue-600 hover:underline">Ver detalle</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Resumen financiero */}
      <div className="grid lg:grid-cols-3 gap-3">
        {[
          { label: 'Total invertido',       value: fmtARS(totalInvertido), color: 'text-red-500'     },
          { label: 'Total vendido equiv.',  value: fmtARS(totalVendido),   color: 'text-emerald-600' },
          { label: 'ROI acumulado',         value: `+${roi}%`,              color: 'text-blue-600'    },
        ].map(k => (
          <div key={k.label} className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm flex justify-between items-center">
            <span className="text-sm text-gray-500">{k.label}</span>
            <span className={`font-bold text-lg ${k.color}`}>{k.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
