import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { STORE_ID } from '../constants'

export function usePurchasesMonth(year, month) {
  return useQuery({
    queryKey: ['purchasesMonth', year, month],
    queryFn: async () => {
      const from  = `${year}-${String(month).padStart(2,'0')}-01`
      const nextM = month === 12 ? 1 : month + 1
      const nextY = month === 12 ? year + 1 : year
      const to    = `${nextY}-${String(nextM).padStart(2,'0')}-01`

      const { data } = await supabase
        .from('purchases')
        .select('total_ars, purchased_at')
        .eq('store_id', STORE_ID)
        .gte('purchased_at', from)
        .lt('purchased_at', to)

      const rows  = data ?? []
      const total = rows.reduce((s, r) => s + (r.total_ars || 0), 0)

      // Semanas
      const weeks = { 1:0, 2:0, 3:0, 4:0, 5:0 }
      for (const r of rows) {
        const s = Math.min(5, Math.ceil(new Date(r.purchased_at).getDate() / 7))
        weeks[s] += r.total_ars || 0
      }

      return { total, weeks, rows }
    },
    staleTime: 120_000,
  })
}
