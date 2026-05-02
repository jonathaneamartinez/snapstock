import { useMetricas } from '../hooks/useMetricas'
import { useVentas }   from '../hooks/useVentas'
import { useDolar }    from '../hooks/useDolar'
import KpiCard from '../components/ui/KpiCard'
import { LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { Link } from 'react-router-dom'

const fmt   = (n) => n != null ? `$${Number(n).toLocaleString('es-AR', { maximumFractionDigits: 0 })}` : '—'
const fmtUSD = (n) => n != null ? `U$D ${Number(n).toLocaleString('en', { maximumFractionDigits: 0 })}` : '—'

export default function Home() {
  const now = new Date()
  const { data: m, isLoading: mLoad } = useMetricas()
  const { data: ventas }               = useVentas(now.getFullYear(), now.getMonth() + 1)
  const { blue }                       = useDolar()

  // Agrupar ventas por día/canal para el gráfico
  const chartData = buildChartData(ventas ?? [])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-extrabold text-gray-900">Dashboard</h2>
          <p className="text-gray-400 text-sm mt-0.5">
            {blue ? `Dólar blue: ${fmt(blue)}` : 'Cargando cotización…'}
          </p>
        </div>
        <Link
          to="/ingresos"
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm
                     font-semibold rounded-xl transition"
        >
          + Nuevos ingresos
        </Link>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="Cartas en stock"
          value={mLoad ? null : m?.totalCartas?.toLocaleString('es-AR')}
          icon="🃏" color="text-blue-600" loading={mLoad}
        />
        <KpiCard
          label="Valor en USD"
          value={mLoad ? null : fmtUSD(m?.valorUSD)}
          icon="💵" color="text-emerald-600" loading={mLoad}
        />
        <KpiCard
          label="Valor ARS Blue"
          value={mLoad ? null : fmt(m?.valorARSBlue)}
          icon="📈" color="text-blue-500" loading={mLoad}
        />
        <KpiCard
          label="Deudas activas"
          value={mLoad ? null : fmt(m?.deudasActivas)}
          sub={mLoad ? '' : `${m?.cantReservadas ?? 0} cartas reservadas`}
          icon="🔒" color="text-amber-600" loading={mLoad}
        />
      </div>

      {/* Gráfico ventas del mes */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
        <h3 className="font-semibold text-gray-800 mb-4">Ventas del mes — por canal</h3>
        {chartData.length === 0
          ? <p className="text-gray-400 text-sm text-center py-8">Sin ventas registradas este mes</p>
          : (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={chartData}>
                <XAxis dataKey="dia" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v) => `$${v.toLocaleString('es-AR')}`} />
                <Legend />
                <Line type="monotone" dataKey="Charly"         stroke="#3B6BF5" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="Claims"         stroke="#10B981" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="Fuera de eventos" stroke="#F59E0B" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          )
        }
      </div>
    </div>
  )
}

function buildChartData(ventas) {
  const mapa = {}
  for (const v of ventas) {
    const dia = new Date(v.created_at).getDate()
    if (!mapa[dia]) mapa[dia] = { dia, Charly: 0, Claims: 0, 'Fuera de eventos': 0 }
    const canal = v.channel || 'Fuera de eventos'
    mapa[dia][canal] = (mapa[dia][canal] || 0) + (v.total_ars_blue || 0)
  }
  return Object.values(mapa).sort((a, b) => a.dia - b.dia)
}
