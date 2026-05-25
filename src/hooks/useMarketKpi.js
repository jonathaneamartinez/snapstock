import { useQuery } from '@tanstack/react-query'
import { STORE_ID } from '../constants'

const SCANNER_URL = import.meta.env.VITE_SCANNER_URL ?? ''

/**
 * Devuelve el KPI VOID más reciente para una carta.
 *
 * Returns:
 *   {
 *     kpi_score: number (0-100) | null,
 *     kpi_state: 'subida_sana'|'explotada'|'mercado_frio'|'saturada'|'normal'|'sin_datos',
 *     snapshot_date: string (ISO date),
 *     price_change_7d_pct: number | null,
 *     active_listings: number | null,
 *     demand_pressure: number | null,
 *     liquidity_score: number | null,
 *     volatility_score: number | null,
 *     kpi_demand_component: number | null,
 *     kpi_liquidity_component: number | null,
 *     kpi_trend_component: number | null,
 *     kpi_supply_component: number | null,
 *     kpi_volatility_component: number | null,
 *     kpi_volume_component: number | null,
 *   }
 */
export function useMarketKpi(cardId) {
  return useQuery({
    queryKey: ['market_kpi', cardId],
    enabled:  Boolean(cardId),
    staleTime: 1000 * 60 * 60 * 4, // 4 horas — se actualiza una vez por día
    retry: 1,
    queryFn: async () => {
      const url = `${SCANNER_URL}/market/kpi/${cardId}`
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
 * Devuelve el KPI más reciente para múltiples cartas a la vez.
 * Útil para widgets de lista (Stock, TrendingCards, Opportunities).
 *
 * @param {string[]} cardIds
 * @returns Map<cardId, kpiData>
 */
export function useMarketKpiBatch(cardIds = []) {
  return useQuery({
    queryKey: ['market_kpi_batch', ...cardIds.slice().sort()],
    enabled:  cardIds.length > 0,
    staleTime: 1000 * 60 * 60 * 4,
    retry: 1,
    queryFn: async () => {
      if (!cardIds.length) return {}

      // Fetch paralelo con límite de 20 por batch para no saturar el servidor
      const CHUNK_SIZE = 20
      const results = {}

      for (let i = 0; i < cardIds.length; i += CHUNK_SIZE) {
        const chunk = cardIds.slice(i, i + CHUNK_SIZE)
        const settled = await Promise.allSettled(
          chunk.map(id =>
            fetch(`${SCANNER_URL}/market/kpi/${id}`, {
              signal: AbortSignal.timeout(10000),
            }).then(r => r.json())
          )
        )
        chunk.forEach((id, j) => {
          if (settled[j].status === 'fulfilled') {
            results[id] = settled[j].value
          }
        })
      }

      return results
    },
  })
}
