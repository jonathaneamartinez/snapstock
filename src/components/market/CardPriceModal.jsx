import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  AreaChart, Area,
  XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid,
} from 'recharts'

import PriceHistoryChart from './PriceHistoryChart'
import MarketKpiBadge, { KPI_STATE_CONFIG } from './MarketKpiBadge'
import { useMarketKpi }    from '../../hooks/useMarketKpi'
import { useMarketSignals } from '../../hooks/useMarketSignals'
import { useI18n }         from '../../lib/i18n'
import Spinner             from '../ui/Spinner'
import { isFeatureEnabled } from '../../lib/featureGate'

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
 * Props:
 *   card    — { inventory_id, card_id, nombre, set_name, numero, idioma,
 *               price_usd_efectivo, price_usd, _ars_blue, _ars_ofic, image_url }
 *   onClose — () => void
 */
export default function CardPriceModal({ card, onClose }) {
  const { t } = useI18n()
  const [days, setDays] = useState(30)

  const showMarket   = isFeatureEnabled('marketIntel')
  const marketCardId = card?.card_id ?? card?.inventory_id

  const { data: kpi,     isLoading: kpiLoading } = useMarketKpi(marketCardId)
  const { data: signals = [] }                   = useMarketSignals(marketCardId, 30)

  if (!card) return null

  const state     = kpi?.kpi_state ?? 'sin_datos'
  const stateConf = KPI_STATE_CONFIG[state] ?? KPI_STATE_CONFIG.normal
  const score     = kpi?.kpi_score

  const priceCurrent = card.price_usd_efectivo ?? card.price_usd
  const change7d     = kpi?.price_change_7d_pct
  const isPositive   = change7d != null && Number(change7d) >= 0

  // Sparkline KPI (30d)
  const sparkData = signals.map(s => ({
    date: s.snapshot_date ?? s.date,
    kpi:  s.kpi_score != null ? Math.round(s.kpi_score) : (s.kpi ?? null),
  }))

  const metrics = [
    { icon: '📦', label: t('market_metric_listings'),  value: kpi?.active_listings ?? '—'                               },
    { icon: '💲', label: t('market_metric_avg_price'), value: fmtUSD(kpi?.avg_listing_price_usd ?? null)                },
    { icon: '🔥', label: t('market_metric_demand'),    value: score != null ? Math.round(kpi.kpi_demand_component)    : '—' },
    { icon: '💧', label: t('market_metric_liquidity'), value: score != null ? Math.round(kpi.kpi_liquidity_component) : '—' },
    { icon: '📊', label: t('market_metric_trend'),     value: score != null ? Math.round(kpi.kpi_trend_component)     : '—' },
    { icon: '📦', label: t('market_metric_supply'),    value: score != null ? Math.round(kpi.kpi_supply_component)    : '—' },
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
                Layout:
                  Fila 1 → carta grande (izq) + nombre/set/KPI (der)
                  Fila 2 → precio hero full-width (separador)
            ══════════════════════════════════════════════════════ */}
            <div className="bg-slate-900 px-5 pt-5 pb-5 flex-shrink-0 relative">

              {/* Botón cerrar */}
              <button
                onClick={onClose}
                className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center
                           rounded-full bg-white/10 hover:bg-white/20 text-white/70
                           text-lg leading-none transition z-10"
                aria-label="Cerrar"
              >
                ×
              </button>

              {/* ── Fila 1: Imagen + Identidad ── */}
              <div className="flex gap-4 pr-10">

                {/* Imagen — el doble que antes */}
                <div className="flex-shrink-0 self-start">
                  {card.image_url ? (
                    <img
                      src={card.image_url}
                      alt={card.nombre}
                      className="w-[160px] rounded-xl shadow-2xl object-contain"
                      style={{ aspectRatio: '5/7' }}
                    />
                  ) : (
                    <div
                      className="w-[160px] rounded-xl bg-slate-800 flex items-center
                                 justify-center text-6xl"
                      style={{ aspectRatio: '5/7' }}
                    >
                      🃏
                    </div>
                  )}
                </div>

                {/* Identidad: nombre, set, KPI — sin precio (va abajo) */}
                <div className="flex-1 min-w-0 flex flex-col justify-start gap-2 pt-1">

                  <div>
                    <h2 className="text-white font-bold text-[17px] leading-snug">
                      {card.nombre || '—'}
                    </h2>
                    <p className="text-slate-400 text-[11px] mt-1.5 leading-snug">
                      {[card.set_name, card.numero ? `#${card.numero}` : null, card.idioma?.toUpperCase()]
                        .filter(Boolean).join(' · ')}
                    </p>
                  </div>

                  {/* KPI badge — solo plan Pro */}
                  {showMarket && (
                    <div className="mt-1">
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
                  )}
                </div>
              </div>

              {/* ── Fila 2: Precio hero — full width ── */}
              <div className="mt-4 pt-3.5 border-t border-slate-700/50">
                <p className="text-slate-500 text-[10px] uppercase tracking-wider mb-1">
                  {t('market_price_label')}
                </p>
                <div className="flex items-end gap-3 flex-wrap">
                  <p className="text-white text-[30px] font-black leading-none">
                    {fmtUSD(priceCurrent)}
                  </p>
                  {/* Delta chip 7d — solo plan Pro */}
                  {showMarket && fmtPct(change7d) && (
                    <span className={`text-sm font-bold px-2.5 py-1 rounded-full mb-0.5
                      ${isPositive
                        ? 'bg-emerald-500/20 text-emerald-400'
                        : 'bg-red-500/20 text-red-400'
                      }`}
                    >
                      {fmtPct(change7d)}
                      <span className="text-[11px] font-normal ml-1 opacity-70">7d</span>
                    </span>
                  )}
                  {/* ARS en la misma línea si hay espacio */}
                  {(card._ars_blue || card._ars_ofic) && (
                    <div className="flex items-center gap-3 mb-0.5">
                      {card._ars_blue && (
                        <span className="text-slate-400 text-[11px]">
                          Blue: <span className="text-slate-300 font-semibold">{fmtARS(card._ars_blue)}</span>
                        </span>
                      )}
                      {card._ars_blue && card._ars_ofic && (
                        <span className="text-slate-700 text-[11px]">·</span>
                      )}
                      {card._ars_ofic && (
                        <span className="text-slate-400 text-[11px]">
                          Oficial: <span className="text-slate-300 font-semibold">{fmtARS(card._ars_ofic)}</span>
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* ══════════════════════════════════════════════════════
                BODY — scroll único, secciones separadas
            ══════════════════════════════════════════════════════ */}
            <div className="flex-1 overflow-y-auto overscroll-contain">

              {/* ── Secciones Market Intel — solo plan Pro ──────── */}
              {showMarket && (<>

              {/* ── Sección 1: Evolución del precio ─────────────── */}
              <section className="px-5 py-5 border-b border-gray-100">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-bold text-gray-800">{t('market_price_evolution')}</h3>
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

                <PriceHistoryChart cardId={card.card_id ?? card.inventory_id} days={days} />
              </section>

              {/* ── Sección 2: Señales de mercado ───────────────── */}
              <section className="px-5 py-5 border-b border-gray-100">
                <h3 className="text-sm font-bold text-gray-800 mb-3">{t('market_signals_title')}</h3>

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
                    <p className="text-xs text-gray-600 font-semibold">{t('market_no_data_title')}</p>
                    <p className="text-xs text-gray-400 mt-1">
                      {t('market_auto_update')}
                    </p>
                  </div>
                )}
              </section>

              {/* ── Sección 3: Sparkline KPI histórico ──────────── */}
              {sparkData.length >= 2 && (
                <section className="px-5 py-5 border-b border-gray-100">
                  <h3 className="text-sm font-bold text-gray-800 mb-3">{t('market_kpi_score_title')}</h3>
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
                        formatter={(v) => [v != null ? `${v} / 100` : '—', t('market_kpi_score_label')]}
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

                  {/* Descripción del KPI */}
                  <div className="mt-3 bg-blue-50 rounded-xl px-3.5 py-3">
                    <p className="text-[11px] font-semibold text-blue-700 mb-1">{t('market_kpi_what')}</p>
                    <p className="text-[11px] text-blue-600 leading-relaxed">
                      {t('market_kpi_desc')}
                    </p>
                    <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-0.5">
                      {[
                        ['🔥', t('market_metric_demand'),    t('market_kpi_demand_desc')],
                        ['💧', t('market_metric_liquidity'), t('market_kpi_liquidity_desc')],
                        ['📊', t('market_metric_trend'),     t('market_kpi_trend_desc')],
                        ['📦', t('market_metric_supply'),    t('market_kpi_supply_desc')],
                      ].map(([icon, name, desc]) => (
                        <p key={name} className="text-[10px] text-blue-500 leading-snug">
                          {icon} <span className="font-semibold">{name}:</span> {desc}
                        </p>
                      ))}
                    </div>
                  </div>
                </section>
              )}

              {/* ── Footer ───────────────────────────────────────── */}
              {kpi?.snapshot_date && (
                <div className="px-5 py-3">
                  <p className="text-[10px] text-gray-300 text-right">
                    {t('market_data_as_of')} {kpi.snapshot_date} {t('market_source_ebay')}
                  </p>
                </div>
              )}

              </>)} {/* fin showMarket */}

              {/* Safe area */}
              <div className="h-8" />
            </div>

          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

