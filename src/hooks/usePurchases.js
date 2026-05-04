import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { STORE_ID } from '../constants'

/**
 * Trae todas las compras del store, ordenadas por fecha descendente.
 * Cada compra incluye la suma de purchase_items para mostrar cantidades.
 */
export function usePurchases() {
  return useQuery({
    queryKey: ['purchases'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('purchases')
        .select(`
          id, vendor_name, purchased_at,
          total_ars, total_usd, payment_status, notes,
          purchase_items(id)
        `)
        .eq('store_id', STORE_ID)
        .order('purchased_at', { ascending: false })

      if (error) throw error
      return (data ?? []).map(p => ({
        ...p,
        cartas: p.purchase_items?.length ?? 0,
      }))
    },
    staleTime: 30_000,
  })
}
