import { Link } from 'react-router-dom'
import { useMarketOpportunities } from '../../hooks/useMarketSignals'
import MarketKpiBadge from './MarketKpiBadge'
import Spinner from '../ui/Spinner'

const fmtUSD = (n) => n != null ? `$${Number(n).toFixed(2)}` : '—'
const fmtPct = (n) =>
  n != null ? `${n >= 0 ? '+' : ''}${Number(n).toFixed(1)}%` : null

/**
 * OpportunitiesWidget
 * ─────────────────────────────────────────────────────────────
 * Muestra las cartas del inventario con mayor KPI VOID
 * (mejores oportunidades para vender ahora).
 *
 * Solo visible para stores con plan pro/enterprise.
 * Pensado para la Home.jsx debajo de TrendingCards.
 */
export default function OpportunitiesWidget({ limit = 5, minKpi = 60 }) {
  const { data = [], isLoading, error } = useMarketOpportunities({ limit, minKpi })

  if (isLoading) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-5">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-lg">🎯</span>
          <span className="font-semibold text-gray-800">Oportunidades del mercado</span>
        </div>
        <div className="flex justify-center py-6">
          <Spinner size={20} className="text-blue-400" />
        </div>
      </div>
    )
  }

  if (error) {
    return null // fail silently — no queremos romper la Home si el backend falla
  }

  if (!data.length) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-5">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-lg">🎯</span>
          <span className="font-semibold text-gray-800">Oportunidades del mercado</span>
          <span className="text-xs text-gray-400 ml-auto">KPI ≥ {minKpi}</span>
        </div>
        <div className="flex flex-col items-center justify-center py-6 text-gray-400 gap-2">
          <span className="text-3xl">📡</span>
          <p className="text-sm font-medium">Sin oportunidades detectadas</p>
          <p className="text-xs text-gray-300 text-center">
            El sistema actualiza el análisis de mercado cada noche. <br/>
            Volvé mañana para ver las mejores cartas para vender.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-5 py-3.5 border-b border-gray-100">
        <span className="text-lg">🎯</span>
        <span className="font-semibold text-gray-800 text-sm">Oportunidades del mercado</span>
        <span className="text-xs text-gray-400 ml-1">— KPI ≥ {minKpi}</span>
        <Link
          to="/stock"
          className="text-xs text-blue-500 font-medium hover:text-blue-600 ml-auto transition"
        >
          Ver stock →
        </Link>
      </div>

      {/* Lista */}
      <div className="divide-y divide-gray-50">
        {data.map((item) => {
          const pctStr = fmtPct(item.price_change_7d)
          const pctPositive = item.price_change_7d >= 0

          return (
            <div
              key={item.inventory_id}
              className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition"
            >
              {/* Imagen */}
              {item.image_url ? (
                <img
                  src={item.image_url}
                  alt={item.card_name}
                  className="w-8 h-11 object-contain rounded shadow-sm flex-shrink-0"
                />
              ) : (
                <div className="w-8 h-11 rounded bg-gray-100 flex-shrink-0 flex items-center justify-center text-gray-300 text-xs">
                  🃏
                </div>
              )}

              {/* Info carta */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-800 truncate leading-tight">
                  {item.card_name}
                </p>
                <p className="text-xs text-gray-400 truncate mt-0.5">
                  {item.set_name}
                  {item.quantity > 1 && (
                    <span className="ml-1.5 text-blue-500 font-medium">×{item.quantity}</span>
                  )}
                </p>
              </div>

              {/* Precio + trend */}
              <div className="text-right flex-shrink-0">
                <p className="text-sm font-bold text-emerald-600">
                  {fmtUSD(item.price_usd)}
                </p>
                {pctStr && (
                  <p className={`text-xs font-semibold ${pctPositive ? 'text-emerald-500' : 'text-red-500'}`}>
                    {pctStr}
                  </p>
                )}
              </div>

              {/* KPI Badge */}
              <div className="flex-shrink-0">
                <MarketKpiBadge
                  kpiScore={item.kpi_score}
                  kpiState={item.kpi_state}
                  size="sm"
                />
              </div>
            </div>
          )
        })}
      </div>

      {/* Footer */}
      <div className="px-5 py-2.5 bg-gray-50 border-t border-gray-100">
        <p className="text-[10px] text-gray-300 text-center">
          Análisis VOID · Actualizado cada noche · Fuente: eBay Browse API
        </p>
      </div>
    </div>
  )
}
