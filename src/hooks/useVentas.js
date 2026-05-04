import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { STORE_ID } from '../constants'

export function useVentas(year, month) {
  return useQuery({
    queryKey: ['ventas', year, month],
    queryFn: async () => {
      // Calcular rango del mes correctamente (mes 12 → enero del año siguiente)
      const nextMonth = month === 12 ? 1 : month + 1
      const nextYear  = month === 12 ? year + 1 : year
      const from = `${year}-${String(month).padStart(2, '0')}-01`
      const to   = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`

      const { data, error } = await supabase
        .from('sales')
        .select('id, created_at, channel, buyer_name, card_name, total_usd, total_ars_blue, estado, inventory_id')
        .eq('store_id', STORE_ID)
        .gte('created_at', from)
        .lt('created_at', to)
        .order('created_at', { ascending: false })

      if (error) throw error
      return data ?? []
    },
    staleTime: 30_000,
  })
}
