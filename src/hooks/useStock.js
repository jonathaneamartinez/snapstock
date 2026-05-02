import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { STORE_ID } from '../constants'

export function useStock(filters = {}) {
  const { estado, busqueda, idioma, condicion } = filters

  return useQuery({
    queryKey: ['stock', filters],
    queryFn: async () => {
      // Intentar primero con inventory JOIN cards para tener store_id real
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
          store_id,
          cards (
            id,
            name,
            full_name,
            set_name,
            card_number,
            image_url,
            language
          )
        `)
        .eq('store_id', STORE_ID)

      if (estado)    q = q.or(`status.eq.${estado},estado.eq.${estado}`)
      if (condicion) q = q.or(`condition.eq.${condicion},condicion.eq.${condicion}`)
      if (busqueda) {
        // buscar en cards.name via la relación — usamos filter manual después
      }

      q = q.order('id', { ascending: false }).limit(300)

      const { data, error } = await q
      if (error) throw error

      let rows = (data ?? []).map(r => ({
        inventory_id:      r.id,
        quantity:          r.quantity,
        condition:         r.condition || r.condicion,
        condicion:         r.condicion || r.condition,
        status:            r.status    || r.estado,
        estado:            r.estado    || r.status,
        price_usd:         r.price_usd,
        price_ars_blue:    r.price_ars_blue,
        price_ars_oficial: r.price_ars_oficial,
        buyer_name:        r.buyer_name,
        buyer_contact:     r.buyer_contact,
        nombre_base:       r.cards?.name || r.cards?.full_name || '',
        carta:             r.cards?.name || '',
        set_name:          r.cards?.set_name || '',
        card_number:       r.cards?.card_number || '',
        image_url:         r.cards?.image_url || '',
        language:          r.cards?.language || 'en',
      }))

      // Filtro idioma y búsqueda en JS (más flexible)
      if (idioma)   rows = rows.filter(r => r.language === idioma)
      if (busqueda) rows = rows.filter(r =>
        r.nombre_base.toLowerCase().includes(busqueda.toLowerCase()) ||
        r.set_name.toLowerCase().includes(busqueda.toLowerCase())
      )

      return rows
    },
    staleTime: 30_000,
  })
}
