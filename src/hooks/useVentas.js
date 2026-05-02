import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { STORE_ID } from '../constants'

export function useVentas(year, month) {
  return useQuery({
    queryKey: ['ventas', year, month],
    queryFn: async () => {
      const from = `${year}-${String(month).padStart(2,'0')}-01`
      const to   = `${year}-${String(month + 1).padStart(2,'0')}-01`

      const { data, error } = await supabase
        .from('sales')
        .select('id, created_at, channel, total_usd, total_ars_blue')
        .eq('store_id', STORE_ID)
        .gte('created_at', from)
        .lt('created_at', to)
        .order('created_at', { ascending: true })

      if (error) throw error
      return data ?? []
    },
    staleTime: 60_000,
  })
}
