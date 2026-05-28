import {
  LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Legend,
} from 'recharts'
import { usePriceHistory } from '../../hooks/usePriceHistory'
import { useI18n } from '../../lib/i18n'
import Spinner from '../ui/Spinner'

const SOURCE_COLORS = {
  tcgplayer:  '#3b82f6',
  cardmarket: '#10b981',
  legacy:     '#a78bfa',
  ppt:        '#f59e0b',
}

const SOURCE_LABELS = {
  tcgplayer:  'TCGPlayer',
  cardmarket: 'CardMarket',
  legacy:     'Precio base',
  ppt:        'PPT',
}

function fmtDate(str) {
  if (!str) return ''
  const [, m, d] = str.split('-')
  return `${d}/${m}`
}

/**
 * Gráfico de historial de precios (30 días) para una carta.
 * Recibe cardId (inventory UUID) y muestra líneas por fuente.
 */
export default function PriceHistoryChart({ cardId, days = 30 }) {
  const { t } = useI18n()
  const { data, isLoading, error } = usePriceHistory(cardId, days)

  if (isLoading) return (
    <div className="flex justify-center items-center h-40">
      <Spinner size={24} className="text-blue-400" />
    </div>
  )

  if (error) return (
    <p className="text-xs text-red-400 text-center py-6">
      {t('market_error_history')}{error.message}
    </p>
  )

  if (!data || data.length === 0) return (
    <div className="flex flex-col items-center justify-center h-40 text-gray-400">
      <span className="text-3xl mb-2">📈</span>
      <p className="text-xs">{t('market_price_no_data')}</p>
      <p className="text-xs text-gray-300 mt-1">{t('market_price_come_back')}</p>
    </div>
  )

  // Pivotear: una fila por fecha, columnas por source
  const byDate = {}
  const sources = new Set()
  for (const row of data) {
    byDate[row.snapshot_date] ??= { date: row.snapshot_date }
    byDate[row.snapshot_date][row.source] = row.price_usd
    sources.add(row.source)
  }
  const chartData = Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date))

  // Calcular delta entre primer y último punto (por fuente principal)
  const mainSource = sources.has('tcgplayer') ? 'tcgplayer'
    : sources.has('cardmarket') ? 'cardmarket' : [...sources][0]
  const first = chartData.find(d => d[mainSource] != null)?.[mainSource]
  const last  = [...chartData].reverse().find(d => d[mainSource] != null)?.[mainSource]
  const delta = first && last ? ((last - first) / first * 100).toFixed(1) : null
  const deltaPositive = delta != null && parseFloat(delta) >= 0

  return (
    <div>
      {/* Delta badge */}
      {delta !== null && (
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xs text-gray-400">{days}d</span>
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full
            ${deltaPositive
              ? 'bg-emerald-100 text-emerald-600'
              : 'bg-red-100 text-red-500'}`}>
            {deltaPositive ? '▲' : '▼'} {Math.abs(delta)}%
          </span>
          <span className="text-xs text-gray-400">
            ${Number(first).toFixed(2)} → ${Number(last).toFixed(2)} USD
          </span>
        </div>
      )}

      <ResponsiveContainer width="100%" height={180}>
        <LineChart data={chartData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis
            dataKey="date"
            tickFormatter={fmtDate}
            tick={{ fontSize: 10, fill: '#9ca3af' }}
            interval="preserveStartEnd"
          />
          <YAxis
            tick={{ fontSize: 10, fill: '#9ca3af' }}
            tickFormatter={v => `$${v}`}
            domain={['auto', 'auto']}
          />
          <Tooltip
            formatter={(v, name) => [`$${Number(v).toFixed(2)}`, SOURCE_LABELS[name] ?? name]}
            labelFormatter={fmtDate}
            contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e5e7eb' }}
          />
          {sources.size > 1 && <Legend iconSize={8} wrapperStyle={{ fontSize: 10 }} />}
          {[...sources].map(src => (
            <Line
              key={src}
              type="monotone"
              dataKey={src}
              name={SOURCE_LABELS[src] ?? src}
              stroke={SOURCE_COLORS[src] ?? '#6b7280'}
              strokeWidth={2}
              dot={false}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
