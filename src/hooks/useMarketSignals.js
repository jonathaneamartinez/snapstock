import { useQuery } from '@tanstack/react-query'
import { STORE_ID } from '../constants'

const SCANNER_URL = import.meta.env.VITE_SCANNER_URL ?? ''

/**
 * Devuelve el historial de market_signals para una carta (últimos N días).
 *
 * Cada row:
 *   {
 *     snapshot_date: string,
 *     kpi_score: number | null,
 *     kpi_state: string,
 *     active_listings: number | null,
 *     avg_listing_price_usd: number | null,
 *     price_change_7d_pct: number | null,
 *     demand_pressure: number | null,
 *     supply_saturation: number | null,
 *     liquidity_score: number | null,
 *     volatility_score: number | null,
 *     new_listings_24h: number | null,
 *   }
 */
export function useMarketSignals(cardId, days = 30) {
  return useQuery({
    queryKey: ['market_signals', cardId, days],
    enabled:  Boolean(cardId),
    staleTime: 1000 * 60 * 60 * 4, // 4 horas
    retry: 1,
    queryFn: async () => {
      const url = `${SCANNER_URL}/market/signals/${cardId}?days=${days}`
      const res = await fetch(url, { signal: AbortSignal.timeout(10000) })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error ?? `HTTP ${res.status}`)
      }
      return res.json()
    },
  })
}

/**
 * Devuelve las oportunidades de venta del inventario del store
 * (cartas con KPI alto que conviene vender ahora).
 * Solo disponible para stores con plan pro/enterprise.
 *
 * @param {object} opts
 * @param {number} opts.limit  — máximo de cartas a devolver (default 10)
 * @param {number} opts.minKpi — score mínimo para considerar oportunidad (default 55)
 */
export function useMarketOpportunities({ limit = 10, minKpi = 55 } = {}) {
  return useQuery({
    queryKey: ['market_opportunities', STORE_ID, limit, minKpi],
    enabled:  Boolean(STORE_ID),
    staleTime: 1000 * 60 * 60 * 2, // 2 horas
    retry: 1,
    queryFn: async () => {
      const url = `${SCANNER_URL}/market/opportunities/${STORE_ID}?limit=${limit}&min_kpi=${minKpi}`
      const res = await fetch(url, { signal: AbortSignal.timeout(15000) })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        // 403 = plan básico — devolvemos array vacío en vez de error
        if (res.status === 403) return []
        throw new Error(err.error ?? `HTTP ${res.status}`)
      }
      return res.json()
    },
  })
}
