import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { STORE_ID } from '../constants'

export function useStock(filters = {}) {
  const { estado, busqueda, idioma, condicion } = filters

  return useQuery({
    queryKey: ['stock', filters],
    queryFn: async () => {
      let q = supabase
        .from('inventory')
        .select(`
          id,
          quantity,
          condition,
          condicion,
          status,
          estado,
          price_usd,
          price_ars_blue,
          price_ars_oficial,
          buyer_name,
          buyer_contact,
          comprador,
          contacto,
          notas,
          sale_notes,
          reserved_at,
          fecha_reserva,
          scanned_at,
          scan_date,
          updated_at,
          cards (
            id,
            name,
            full_name,
            set_name,
            card_number,
            image_url,
            language,
            is_holo,
            variant
          )
        `)
        .eq('store_id', STORE_ID)

      if (estado)    q = q.or(`status.eq.${estado},estado.eq.${estado}`)
      if (condicion) q = q.or(`condition.eq.${condicion},condicion.eq.${condicion}`)

      q = q.order('id', { ascending: false }).limit(300)

      const { data, error } = await q
      if (error) throw error

      let rows = (data ?? []).map(r => ({
        inventory_id:      r.id,
        // Carta
        nombre:            r.cards?.name || r.cards?.full_name || '',
        set_name:          r.cards?.set_name || '',
        numero:            r.cards?.card_number || '',
        idioma:            r.cards?.language || 'en',
        holo:              r.cards?.is_holo || false,
        image_url:         r.cards?.image_url || '',
        // Inventario
        condicion:         r.condition || r.condicion || '',
        stock:             r.quantity ?? 1,
        price_usd:         r.price_usd,
        price_ars_blue:    r.price_ars_blue,
        price_ars_oficial: r.price_ars_oficial,
        precio_venta:      r.price_ars_blue, // por defecto ARS blue
        status:            r.status || r.estado || '',
        // Reserva
        buyer_name:        r.buyer_name || r.comprador || '',
        buyer_contact:     r.buyer_contact || r.contacto || '',
        notes:             r.notas || r.sale_notes || '',
        reserved_at:       r.reserved_at || r.fecha_reserva || '',
        fecha_escaneada:   r.scanned_at || r.scan_date || r.updated_at || '',
      }))

      if (idioma)   rows = rows.filter(r => r.idioma === idioma)
      if (busqueda) rows = rows.filter(r =>
        r.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
        r.set_name.toLowerCase().includes(busqueda.toLowerCase())
      )

      return rows
    },
    staleTime: 30_000,
  })
}
