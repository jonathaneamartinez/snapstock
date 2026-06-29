import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { STORE_ID } from '../constants'

/**
 * Top N cartas del inventario con mayor variación de precio.
 * Usa market_signals_latest.price_change_Nd_pct (calculado por el cron de mercado),
 * NO price_history.store_id (que es global/null). Patrón = useMarketKpi/opportunities:
 * inventario de la tienda → batch de señales por card_id.
 *
 * Nota: el cron computa el cambio a 7 días (price_change_7d_pct). El de 30 días
 * (price_change_30d_pct) todavía no se calcula → ese tab queda vacío por ahora.
 */
export function useTrendingCards(days = 7, limit = 5) {
  return useQuery({
    queryKey: ['trending_cards', STORE_ID, days, limit],
    staleTime: 1000 * 60 * 30, // 30 min
    queryFn: async () => {
      const field = days >= 30 ? 'price_change_30d_pct' : 'price_change_7d_pct'

      // 1. Inventario disponible de la tienda (con info de carta y precio actual)
      const { data: inv } = await supabase
        .from('inventory')
        .select('card_id, price_usd, cards(name, set_name, card_number, language, image_url, is_holo)')
        .eq('store_id', STORE_ID)
        .eq('status', 'disponible')
        .gt('quantity', 0)
        .not('card_id', 'is', null)
        .limit(2000)

      if (!inv?.length) return []

      const info = {}
      for (const it of inv) {
        if (it.card_id && !info[it.card_id]) {
          const c = it.cards || {}
          info[it.card_id] = {
            nombre:     c.name,
            set_name:   c.set_name,
            numero:     c.card_number,
            language:   c.language,
            image_url:  c.image_url,
            holo:       c.is_holo,
            price_last: it.price_usd ?? null,
          }
        }
      }
      const cardIds = Object.keys(info)

      // 2. Señales de mercado en chunks de 150 (evita URL demasiado larga)
      const changes = {}
      for (let i = 0; i < cardIds.length; i += 150) {
        const chunk = cardIds.slice(i, i + 150)
        const { data } = await supabase
          .from('market_signals_latest')
          .select(`card_id, ${field}`)
          .in('card_id', chunk)
        for (const r of data ?? []) {
          const v = r[field]
          if (v != null && Math.abs(v) >= 1) changes[r.card_id] = v   // filtra ruido <1%
        }
      }

      // 3. Top movers por |variación|
      return Object.entries(changes)
        .map(([card_id, delta_pct]) => ({ card_id, delta_pct, ...info[card_id] }))
        .sort((a, b) => Math.abs(b.delta_pct) - Math.abs(a.delta_pct))
        .slice(0, limit)
    },
  })
}
