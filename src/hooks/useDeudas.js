import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { STORE_ID } from '../constants'

export function useDeudas() {
  return useQuery({
    queryKey: ['deudas'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('inventory')
        .select(`id, quantity, price_ars_blue, buyer_name, buyer_contact,
                 status, estado, cards(name, image_url)`)
        .eq('store_id', STORE_ID)
        .or('status.eq.reservada,estado.eq.reservada')
        .order('buyer_name')

      if (error) throw error
      const rows = data ?? []

      const mapa = {}
      for (const r of rows) {
        const key = r.buyer_name || 'Sin nombre'
        if (!mapa[key]) mapa[key] = { buyer: key, contact: r.buyer_contact, items: [], total: 0 }
        mapa[key].items.push({
          inventory_id: r.id,
          nombre_base:  r.cards?.name || '',
          image_url:    r.cards?.image_url || '',
          price_ars_blue: r.price_ars_blue,
          quantity:     r.quantity,
        })
        mapa[key].total += (r.price_ars_blue || 0) * (r.quantity || 1)
      }
      return Object.values(mapa).sort((a, b) => b.total - a.total)
    },
    staleTime: 30_000,
  })
}
