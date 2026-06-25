import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { STORE_ID } from '../constants'

/**
 * Deudas activas = dos fuentes que se agrupan por comprador:
 *   1) Reservas: inventory.status/estado = 'reservada' (carta apartada)
 *   2) Ventas impagas: sales.estado = 'deuda' (venta marcada "Fue a deuda")
 * Cada item lleva `_source` ('reserva' | 'venta') para que las acciones
 * (cobrar/liberar) operen sobre la tabla correcta.
 */
export function useDeudas() {
  return useQuery({
    queryKey: ['deudas'],
    queryFn: async () => {
      const [invRes, saleRes] = await Promise.all([
        supabase
          .from('inventory')
          .select(`
            id, quantity, price_ars_blue, sale_price_ars,
            buyer_name, buyer_contact, status, estado,
            canal_reserva, reserved_at, condition, finish,
            cards(name, image_url)
          `)
          .eq('store_id', STORE_ID)
          .or('status.eq.reservada,estado.eq.reservada'),
        supabase
          .from('sales')
          .select(`
            id, buyer_name, total_ars, total_ars_blue, channel, notes,
            sold_at, inventory_id, grade,
            inventory:inventory_id ( buyer_contact, condition, finish, cards(name, image_url) )
          `)
          .eq('store_id', STORE_ID)
          .eq('estado', 'deuda'),
      ])

      if (invRes.error)  throw invRes.error
      if (saleRes.error) throw saleRes.error

      const mapa = {}
      const grupo = (name, contact) => {
        const key = name || 'Sin nombre'
        if (!mapa[key]) mapa[key] = { buyer: key, contact: contact || null, items: [], total: 0 }
        else if (!mapa[key].contact && contact) mapa[key].contact = contact
        return mapa[key]
      }

      // 1) Reservas en inventory
      for (const r of (invRes.data ?? [])) {
        const g = grupo(r.buyer_name, r.buyer_contact)
        g.items.push({
          _source:        'reserva',
          inventory_id:   r.id,
          sale_id:        null,
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
        g.total += (r.sale_price_ars ?? r.price_ars_blue ?? 0) * (r.quantity || 1)
      }

      // 2) Ventas en deuda (sales)
      for (const s of (saleRes.data ?? [])) {
        const inv = s.inventory
        const g = grupo(s.buyer_name, inv?.buyer_contact)
        g.items.push({
          _source:        'venta',
          inventory_id:   s.inventory_id || null,
          sale_id:        s.id,
          nombre_base:    inv?.cards?.name || s.notes || '',
          image_url:      inv?.cards?.image_url || '',
          price_ars_blue: s.total_ars_blue,
          sale_price_ars: s.total_ars,
          quantity:       1,
          condition:      inv?.condition || '',
          finish:         inv?.finish || 'normal',
          canal_reserva:  s.channel,
          reserved_at:    s.sold_at,
        })
        g.total += (s.total_ars ?? 0)
      }

      return Object.values(mapa).sort((a, b) => b.total - a.total)
    },
    staleTime: 30_000,
  })
}
