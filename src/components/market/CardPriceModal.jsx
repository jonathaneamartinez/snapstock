import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  AreaChart, Area, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid,
} from 'recharts'

import PriceHistoryChart   from './PriceHistoryChart'
import MarketKpiBadge, { KPI_STATE_CONFIG } from './MarketKpiBadge'
import { useMarketKpi }    from '../../hooks/useMarketKpi'
import { useMarketSignals } from '../../hooks/useMarketSignals'
import Spinner             from '../ui/Spinner'

// ── Formatters ───────────────────────────────────────────────────────────────
const fmtUSD = (n) => n != null ? `$${Number(n).toFixed(2)}` : '—'
const fmtARS = (n) => n != null
  ? `$${Number(n).toLocaleString('es-AR', { maximumFractionDigits: 0 })}`
  : '—'
const fmtPct = (n) => n != null
  ? `${n >= 0 ? '▲' : '▼'} ${Math.abs(Number(n)).toFixed(1)}%`
  : null
const fmtDate = (str) => {
  if (!str) return ''
  const [, m, d] = str.split('-')
  return `${d}/${m}`
}

/**
 * CardPriceModal — Right-side sheet con detalle completo de la carta.
 *
 * Reemplaza el modal centrado con tabs por un drawer lateral de scroll único:
 *   1. Header oscuro   — imagen + nombre + KPI badge + precio actual
 *   2. Evolución       — gráfico de precio histórico con selector de período
 *   3. Señales         — métricas de mercado en grid 3-col
 *   4. Score histórico — sparkline del KPI en los últimos 30d
 *
 * Props:
 *   card    — { inventory_id, card_id, nombre, set_name, numero, idioma,
 *               price_usd_efectivo, price_usd, _ars_blue, _ars_ofic, image_url }
 *   onClose — () => void
 */
export default function CardPriceModal({ card, onClose }) {
  const [days, setDays] = useState(30)

  // card_id global para market signals; inventory_id para price history
  const marketCardId = card?.card_id ?? card?.inventory_id

  const { data: kpi, isLoading: kpiLoading } = useMarketKpi(marketCardId)
  const { data: signals = [] }               = useMarketSignals(marketCardId, 30)

  if (!card) return null

  const state      = kpi?.kpi_state ?? 'sin_datos'
  const stateConf  = KPI_STATE_CONFIG[state] ?? KPI_STATE_CONFIG.normal
  const score      = kpi?.kpi_score

  const priceCurrent = card.price_usd_efectivo ?? card.price_usd
  const change7d     = kpi?.price_change_7d_pct
  const isPositive   = change7d != null && Number(change7d) >= 0

  // Sparkline KPI (30d)
  const sparkData = signals.map(s => ({
    date: s.snapshot_date,
    kpi:  s.kpi_score != null ? Math.round(s.kpi_score) : null,
  }))

  // Grid de métricas (3 columnas)
  const metrics = [
    { icon: '📦', label: 'Listings',   value: kpi?.active_listings ?? '—'                            },
    { icon: '💲', label: 'Avg eBay',   value: fmtUSD(kpi?.avg_listing_price_usd ?? null)             },
    { icon: '🔥', label: 'Demanda',    value: score != null ? Math.round(kpi.kpi_demand_component)    : '—' },
    { icon: '💧', label: 'Liquidez',   value: score != null ? Math.round(kpi.kpi_liquidity_component) : '—' },
    { icon: '📊', label: 'Tendencia',  value: score != null ? Math.round(kpi.kpi_trend_component)     : '—' },
    { icon: '📡', label: 'Supply',     value: score != null ? Math.round(kpi.kpi_supply_component)    : '—' },
  ]

  return (
    <AnimatePresence>
      {card && (
        <>
          {/* ── Overlay ─────────────────────────────────────────────── */}
          <motion.div
            key="overlay"
            className="fixed inset-0 bg-black/50 z-50 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          {/* ── Sheet ───────────────────────────────────────────────── */}
          <motion.div
            key="sheet"
            className="fixed right-0 top-0 bottom-0 z-50
                       w-full sm:w-[480px]
                       bg-white shadow-2xl flex flex-col overflow-hidden"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 300 }}
          >

            {/* ══════════════════════════════════════════════════════
                HEADER — identidad de la carta + precio hero
                Fondo oscuro para máxima jerarquía visual
            ══════════════════════════════════════════════════════ */}
            <div className="bg-slate-900 px-5 pt-5 pb-6 flex-shrink-0 relative">

              {/* Botón cerrar */}
              <button
                onClick={onClose}
                className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center
                           rounded-full bg-white/10 hover:bg-white/20 text-white/70
                           text-lg leading-none transition"
                aria-label="Cerrar"
              >
                ×
              </button>

              {/* Carta: imagen + nombre + KPI */}
              <div className="flex items-start gap-4 pr-8">
                {card.image_url ? (
                  <img
                    src={card.image_url}
                    alt={card.nombre}
                    className="w-[72px] h-[100px] object-contain rounded-xl shadow-lg flex-shrink-0"
                  />
                ) : (
                  <div className="w-[72px] h-[100px] rounded-xl bg-slate-800 flex items-center
                                  justify-center text-3xl flex-shrink-0">
                    🃏
                  </div>
                )}

                <div className="flex-1 min-w-0 pt-1">
                  <h2 className="text-white font-bold text-[15px] leading-snug">
                    {card.nombre || '—'}
                  </h2>
                  <p className="text-slate-400 text-xs mt-1 leading-snug">
                    {[card.set_name, card.numero ? `#${card.numero}` : null, card.idioma?.toUpperCase()]
                      .filter(Boolean).join(' · ')}
                  </p>

                  {/* KPI badge — prominente */}
                  <div className="mt-3">
                    {kpiLoading
                      ? <MarketKpiBadge loading size="md" />
                      : <MarketKpiBadge
                          kpiScore={score}
                          kpiState={state}
                          size="md"
                          showLabel
                        />
                    }
                  </div>
                </div>
              </div>

              {/* ── Precio hero ─────────────────────────────────── */}
              <div className="mt-5 flex items-end justify-between">
                <div>
                  <p className="text-slate-500 text-[11px] uppercase tracking-wider mb-1">
                    Precio de mercado
                  </p>
                  <p className="text-white text-[28px] font-black leading-none">
                    {fmtUSD(priceCurrent)}
                  </p>
                </div>

                {/* Delta chip 7d */}
                {fmtPct(change7d) && (
                  <span className={`text-sm font-bold px-3 py-1.5 rounded-full
                    ${isPositive
                      ? 'bg-emerald-500/20 text-emerald-400'
                      : 'bg-red-500/20 text-red-400'
                    }`}
                  >
                    {fmtPct(change7d)}
                    <span className="text-[10px] font-normal ml-1 opacity-70">7d</span>
                  </span>
                )}
              </div>

              {/* ARS secundario */}
              {(card._ars_blue || card._ars_ofic) && (
                <div className="flex items-center gap-3 mt-2">
                  {card._ars_blue && (
                    <span className="text-slate-400 text-[11px]">
                      Blue: <span className="text-slate-300 font-semibold">{fmtARS(card._ars_blue)}</span>
                    </span>
                  )}
                  {card._ars_blue && card._ars_ofic && (
                    <span className="text-slate-700">·</span>
                  )}
                  {card._ars_ofic && (
                    <span className="text-slate-400 text-[11px]">
                      Oficial: <span className="text-slate-300 font-semibold">{fmtARS(card._ars_ofic)}</span>
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* ══════════════════════════════════════════════════════
                BODY — scroll único, secciones separadas
            ══════════════════════════════════════════════════════ */}
            <div className="flex-1 overflow-y-auto overscroll-contain">

              {/* ── Sección 1: Evolución del precio ─────────────── */}
              <section className="px-5 py-5 border-b border-gray-100">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-bold text-gray-800">Evolución del precio</h3>
                  {/* Selector de período */}
                  <div className="flex gap-1">
                    {[7, 30, 60, 90].map(d => (
                      <button
                        key={d}
                        onClick={() => setDays(d)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition
                          ${days === d
                            ? 'bg-blue-600 text-white shadow-sm'
                            : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                          }`}
                      >
                        {d}d
                      </button>
                    ))}
                  </div>
                </div>
                <PriceHistoryChart cardId={card.inventory_id} days={days} />
              </section>

              {/* ── Sección 2: Señales de mercado ───────────────── */}
              <section className="px-5 py-5 border-b border-gray-100">
                <h3 className="text-sm font-bold text-gray-800 mb-3">Señales de mercado</h3>

                {kpiLoading ? (
                  <div className="flex justify-center py-6">
                    <Spinner size={20} className="text-blue-400" />
                  </div>
                ) : score != null ? (
                  <>
                    {/* Banner de estado */}
                    <div className={`rounded-xl px-3.5 py-2.5 mb-3 flex items-start gap-2.5 ${stateConf.bg}`}>
                      <span className="text-lg mt-0.5">{stateConf.icon}</span>
                      <div>
                        <p className={`text-xs font-semibold ${stateConf.text}`}>{stateConf.label}</p>
                        <p className={`text-xs mt-0.5 ${stateConf.text} opacity-80`}>
                          {stateConf.description}
                        </p>
                      </div>
                    </div>

                    {/* Grid 3 columnas */}
                    <div className="grid grid-cols-3 gap-2">
                      {metrics.map(m => (
                        <div
                          key={m.label}
                          className="bg-gray-50 rounded-xl px-2 py-3 flex flex-col items-center gap-1"
                        >
                          <span className="text-xl">{m.icon}</span>
                          <p className="text-sm font-bold text-gray-800 leading-none">{m.value}</p>
                          <p className="text-[10px] text-gray-400 text-center leading-tight">{m.label}</p>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="bg-gray-50 rounded-2xl px-4 py-5 text-center">
                    <p className="text-2xl mb-1.5">📡</p>
                    <p className="text-xs text-gray-600 font-semibold">Sin datos de mercado</p>
                    <p className="text-xs text-gray-400 mt-1">
                      El cron nocturno aún no procesó esta carta.
                    </p>
                  </div>
                )}
              </section>

              {/* ── Sección 3: Sparkline KPI histórico ──────────── */}
              {sparkData.length >= 2 && (
                <section className="px-5 py-5 border-b border-gray-100">
                  <h3 className="text-sm font-bold text-gray-800 mb-3">Score KPI — últimos 30d</h3>
                  <ResponsiveContainer width="100%" height={100}>
                    <AreaChart data={sparkData} margin={{ top: 2, right: 4, left: -20, bottom: 0 }}>
                      <defs>
                        <linearGradient id="kpiGrad2" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%"  stopColor="#3b82f6" stopOpacity={0.2} />
                          <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}   />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis
                        dataKey="date"
                        tickFormatter={fmtDate}
                        tick={{ fontSize: 9, fill: '#9ca3af' }}
                        interval="preserveStartEnd"
                      />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 9, fill: '#9ca3af' }} />
                      <Tooltip
                        formatter={(v) => [v != null ? `${v} / 100` : '—', 'KPI']}
                        labelFormatter={fmtDate}
                        contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e5e7eb' }}
                      />
                      <Area
                        type="monotone"
                        dataKey="kpi"
                        stroke="#3b82f6"
                        strokeWidth={2}
                        fill="url(#kpiGrad2)"
                        dot={false}
                        connectNulls
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </section>
              )}

              {/* ── Footer ───────────────────────────────────────── */}
              {kpi?.snapshot_date && (
                <div className="px-5 py-3">
                  <p className="text-[10px] text-gray-300 text-right">
                    Datos al {kpi.snapshot_date} · Fuente: eBay Browse API
                  </p>
                </div>
              )}

              {/* Safe area */}
              <div className="h-8" />
            </div>

          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
