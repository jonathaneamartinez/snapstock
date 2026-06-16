import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { STORE_ID } from '../constants'

export function useDeudas() {
  return useQuery({
    queryKey: ['deudas'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('inventory')
        .select(`
          id, quantity, price_ars_blue, sale_price_ars,
          buyer_name, buyer_contact,
          status, estado,
          canal_reserva, reserved_at,
          condition, finish,
          cards(name, image_url)
        `)
        .eq('store_id', STORE_ID)
        .or('status.eq.reservada,estado.eq.reservada')
        .order('buyer_name')

      if (error) throw error
      const rows = data ?? []

      // Agrupar por comprador
      const mapa = {}
      for (const r of rows) {
        const key = r.buyer_name || 'Sin nombre'
        if (!mapa[key]) {
          mapa[key] = {
            buyer:   key,
            contact: r.buyer_contact,
            items:   [],
            total:   0,
          }
        }
        mapa[key].items.push({
          inventory_id:   r.id,
          nombre_base:    r.cards?.name || '',
          image_url:      r.cards?.image_url || '',
          price_ars_blue: r.price_ars_blue,
          sale_price_ars: r.sale_price_ars,
          quantity:       r.quantity,
          condition:      r.condition,
          finish:         r.finish || 'normal',
          canal_reserva:  r.canal_reserva,
          reserved_at:    r.reserved_at,
        })
        mapa[key].total += (r.sale_price_ars ?? r.price_ars_blue ?? 0) * (r.quantity || 1)
      }
      return Object.values(mapa).sort((a, b) => b.total - a.total)
    },
    staleTime: 30_000,
  })
}
