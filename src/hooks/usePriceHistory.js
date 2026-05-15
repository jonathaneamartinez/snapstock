import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

/**
 * Trae el historial de precios de una carta (últimos N días).
 * @param {string} cardId  — inventory_id (UUID)
 * @param {number} days    — ventana en días (default: 30)
 */
export function usePriceHistory(cardId, days = 30) {
  return useQuery({
    queryKey: ['price_history', cardId, days],
    enabled: !!cardId,
    staleTime: 1000 * 60 * 10, // 10 min
    queryFn: async () => {
      const since = new Date()
      since.setDate(since.getDate() - days)
      const sinceStr = since.toISOString().split('T')[0]

      const { data, error } = await supabase
        .from('price_history')
        .select('snapshot_date, price_usd, source')
        .eq('card_id', cardId)
        .gte('snapshot_date', sinceStr)
        .order('snapshot_date', { ascending: true })

      if (error) throw error
      return data ?? []
    },
  })
}
