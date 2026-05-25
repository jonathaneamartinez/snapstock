import {
  AreaChart, Area, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid,
} from 'recharts'
import { useMarketKpi } from '../../hooks/useMarketKpi'
import { useMarketSignals } from '../../hooks/useMarketSignals'
import { KPI_STATE_CONFIG } from './MarketKpiBadge'
import Spinner from '../ui/Spinner'

const fmtDate = (str) => {
  if (!str) return ''
  const [, m, d] = str.split('-')
  return `${d}/${m}`
}

const fmtPct = (n) =>
  n != null ? `${n >= 0 ? '+' : ''}${Number(n).toFixed(1)}%` : '—'

const fmtUSD = (n) => n != null ? `$${Number(n).toFixed(2)}` : '—'

const fmtScore = (n) => n != null ? Math.round(n) : '—'

/**
 * MarketSignalsPanel
 * ─────────────────────────────────────────────────────────────
 * Panel de Market Intel para mostrar dentro de CardPriceModal.
 * Muestra KPI actual, componentes del score, y gráfico de KPI
 * histórico + supply (listings activos).
 *
 * Props:
 *   cardId — UUID de la carta (cards.id global, no inventory.id)
 */
export default function MarketSignalsPanel({ cardId }) {
  const { data: kpi, isLoading: kpiLoading } = useMarketKpi(cardId)
  const { data: signals, isLoading: sigLoading } = useMarketSignals(cardId, 30)

  const loading = kpiLoading || sigLoading

  if (loading) {
    return (
      <div className="flex justify-center items-center h-32">
        <Spinner size={20} className="text-blue-400" />
      </div>
    )
  }

  const state = kpi?.kpi_state ?? 'sin_datos'
  const config = KPI_STATE_CONFIG[state] ?? KPI_STATE_CONFIG.normal
  const score = kpi?.kpi_score

  // Datos para el gráfico de KPI histórico
  const chartData = (signals ?? []).map(s => ({
    date:     s.snapshot_date,
    kpi:      s.kpi_score != null ? Math.round(s.kpi_score) : null,
    listings: s.active_listings,
  }))

  return (
    <div className="space-y-4">

      {/* ── Estado + score principal ─────────────────────────────── */}
      <div className={`rounded-2xl px-4 py-3 flex items-center gap-3 ${config.bg}`}>
        <span className="text-2xl">{config.icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2">
            <span className={`text-xl font-black ${config.text}`}>
              {score != null ? Math.round(score) : '—'}
            </span>
            <span className={`text-xs font-semibold ${config.text} opacity-75`}>/ 100</span>
            <span className={`text-xs font-bold ${config.text}`}>{config.label}</span>
          </div>
          <p className="text-xs text-gray-500 mt-0.5 leading-tight">{config.description}</p>
        </div>
      </div>

      {/* ── Métricas clave en grid ───────────────────────────────── */}
      {kpi && score != null && (
        <div className="grid grid-cols-2 gap-2">
          {[
            { label: 'Publicaciones',    value: kpi.active_listings ?? '—',                  icon: '📦' },
            { label: 'Precio prom.',     value: fmtUSD(kpi.avg_listing_price_usd ?? null),   icon: '💲' },
            { label: 'Cambio 7d',        value: fmtPct(kpi.price_change_7d_pct),             icon: kpi.price_change_7d_pct >= 0 ? '📈' : '📉' },
            { label: 'Demanda',          value: fmtScore(kpi.kpi_demand_component),          icon: '🔥' },
            { label: 'Liquidez',         value: fmtScore(kpi.kpi_liquidity_component),       icon: '💧' },
            { label: 'Tendencia',        value: fmtScore(kpi.kpi_trend_component),           icon: '📊' },
          ].map(m => (
            <div key={m.label}
              className="bg-gray-50 rounded-xl px-3 py-2 flex items-center gap-2">
              <span className="text-base">{m.icon}</span>
              <div>
                <p className="text-[10px] text-gray-400 leading-none">{m.label}</p>
                <p className="text-sm font-bold text-gray-700 mt-0.5">{m.value}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Gráfico histórico KPI ─────────────────────────────────── */}
      {chartData.length >= 2 ? (
        <div>
          <p className="text-[11px] text-gray-400 mb-1.5 font-medium">
            Score KPI últimos 30 días
          </p>
          <ResponsiveContainer width="100%" height={110}>
            <AreaChart data={chartData} margin={{ top: 2, right: 4, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="kpiGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#3b82f6" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}    />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis
                dataKey="date"
                tickFormatter={fmtDate}
                tick={{ fontSize: 9, fill: '#9ca3af' }}
                interval="preserveStartEnd"
              />
              <YAxis
                domain={[0, 100]}
                tick={{ fontSize: 9, fill: '#9ca3af' }}
              />
              <Tooltip
                formatter={(v) => [v != null ? `${v}/100` : '—', 'KPI']}
                labelFormatter={fmtDate}
                contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e5e7eb' }}
              />
              <Area
                type="monotone"
                dataKey="kpi"
                stroke="#3b82f6"
                strokeWidth={2}
                fill="url(#kpiGrad)"
                dot={false}
                connectNulls
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="bg-gray-50 rounded-2xl px-4 py-4 text-center">
          <p className="text-2xl mb-1">📡</p>
          <p className="text-xs text-gray-500 font-medium">Acumulando datos de mercado</p>
          <p className="text-xs text-gray-400 mt-0.5">
            El histórico del KPI se construye día a día. Volvé mañana.
          </p>
        </div>
      )}

      {/* ── Nota de fuente ───────────────────────────────────────── */}
      {kpi?.snapshot_date && (
        <p className="text-[10px] text-gray-300 text-right">
          Datos al {kpi.snapshot_date} · Fuente: eBay Browse API
        </p>
      )}
    </div>
  )
}
