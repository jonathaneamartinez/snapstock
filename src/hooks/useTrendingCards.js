import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { STORE_ID } from '../constants'

/**
 * Devuelve las top N cartas del inventario con mayor variación de precio
 * en los últimos `days` días, basándose en price_history.
 */
export function useTrendingCards(days = 7, limit = 5) {
  return useQuery({
    queryKey: ['trending_cards', STORE_ID, days, limit],
    staleTime: 1000 * 60 * 30, // 30 min
    queryFn: async () => {
      const since = new Date()
      since.setDate(since.getDate() - days)
      const sinceStr = since.toISOString().split('T')[0]

      // Traer historial de precios de los últimos N días para esta tienda
      const { data: history, error } = await supabase
        .from('price_history')
        .select('card_id, price_usd, snapshot_date')
        .eq('store_id', STORE_ID)
        .gte('snapshot_date', sinceStr)
        .order('snapshot_date', { ascending: true })

      if (error) throw error
      if (!history || history.length === 0) return []

      // Agrupar por card_id → primer precio (más viejo) y último precio (más nuevo)
      const byCard = {}
      for (const row of history) {
        if (!row.price_usd) continue
        if (!byCard[row.card_id]) {
          byCard[row.card_id] = { first: row.price_usd, last: row.price_usd, firstDate: row.snapshot_date }
        } else {
          byCard[row.card_id].last = row.price_usd
        }
      }

      // Calcular delta %
      const deltas = Object.entries(byCard)
        .map(([card_id, { first, last }]) => ({
          card_id,
          price_first: first,
          price_last:  last,
          delta_pct:   first > 0 ? ((last - first) / first) * 100 : 0,
        }))
        .filter(d => Math.abs(d.delta_pct) >= 1) // filtrar ruido (<1%)
        .sort((a, b) => Math.abs(b.delta_pct) - Math.abs(a.delta_pct))
        .slice(0, limit * 2) // traer más para el join

      if (deltas.length === 0) return []

      // Buscar info de las cartas en inventory
      const cardIds = deltas.map(d => d.card_id)
      const { data: cards } = await supabase
        .from('inventory')
        .select('id, nombre, set_name, numero, idioma, holo, image_url, card_id')
        .in('id', cardIds)
        .eq('store_id', STORE_ID)
        .gt('quantity', 0)

      if (!cards || cards.length === 0) return []

      const cardMap = {}
      for (const c of cards) cardMap[c.id] = c

      // Combinar delta con info de carta
      return deltas
        .filter(d => cardMap[d.card_id])
        .slice(0, limit)
        .map(d => ({
          ...d,
          ...cardMap[d.card_id],
        }))
    },
  })
}
