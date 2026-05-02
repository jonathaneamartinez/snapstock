import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { STORE_ID } from '../constants'

export function useDeudas() {
  return useQuery({
    queryKey: ['deudas'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('stock_completo')
        .select('inventory_id, nombre_base, buyer_name, buyer_contact, price_ars_blue, quantity, image_url')
        .eq('status', 'reservada')
        .order('buyer_name')

      if (error) throw error
      const rows = data ?? []

      // Agrupar por comprador
      const mapa = {}
      for (const r of rows) {
        const key = r.buyer_name || 'Sin nombre'
        if (!mapa[key]) mapa[key] = { buyer: key, contact: r.buyer_contact, items: [], total: 0 }
        mapa[key].items.push(r)
        mapa[key].total += (r.price_ars_blue || 0) * (r.quantity || 0)
      }
      return Object.values(mapa).sort((a, b) => b.total - a.total)
    },
    staleTime: 30_000,
  })
}
