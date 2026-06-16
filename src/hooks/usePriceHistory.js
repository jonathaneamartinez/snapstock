import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

/**
 * Trae el historial de precios de una carta por grado (últimos N días).
 * @param {string} cardId  — card_id (UUID)
 * @param {number} days    — ventana en días (default: 30)
 * @param {string} grade   — 'ungraded' | 'psa9' | 'psa10' | 'bgs10' (default: 'ungraded')
 */
export function usePriceHistory(cardId, days = 30, grade = 'ungraded') {
  return useQuery({
    queryKey: ['price_history', cardId, days, grade],
    enabled: !!cardId,
    staleTime: 1000 * 60 * 10,
    queryFn: async () => {
      const since = new Date()
      since.setDate(since.getDate() - days)
      const sinceStr = since.toISOString().split('T')[0]

      const { data, error } = await supabase
        .from('price_history')
        .select('snapshot_date, price_usd, price_buy_usd, price_sell_usd, source, grade')
        .eq('card_id', cardId)
        .eq('grade', grade)
        .gte('snapshot_date', sinceStr)
        .order('snapshot_date', { ascending: true })

      if (error) throw error
      return data ?? []
    },
  })
}
