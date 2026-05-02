import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { STORE_ID } from '../constants'

const PAGE_SIZE = 100

export function useStock(filters = {}) {
  const { estado, busqueda, idioma, condicion, page = 0 } = filters

  return useQuery({
    queryKey: ['stock', filters],
    queryFn: async () => {
      // ── Construcción base del query ──────────────────────────────────────
      const buildQuery = (q) => {
        if (estado)    q = q.or(`status.eq.${estado},estado.eq.${estado}`)
        if (condicion) q = q.or(`condition.eq.${condicion},condicion.eq.${condicion}`)
        return q
      }

      const selectFields = `
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
      `

      // ── Count total (para mostrar X/N) ────────────────────────────────────
      let countQ = supabase
        .from('inventory')
        .select('id', { count: 'exact', head: true })
        .eq('store_id', STORE_ID)
      countQ = buildQuery(countQ)
      const { count: totalCount } = await countQ

      // ── Datos paginados ───────────────────────────────────────────────────
      const from = page * PAGE_SIZE
      const to   = from + PAGE_SIZE - 1

      let q = supabase
        .from('inventory')
        .select(selectFields)
        .eq('store_id', STORE_ID)
      q = buildQuery(q)
      q = q.order('id', { ascending: false }).range(from, to)

      const { data, error } = await q
      if (error) throw error

      let rows = (data ?? []).map(r => ({
        inventory_id:      r.id,
        card_id:           r.cards?.id || null,
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
        precio_venta:      r.price_ars_blue,
        status:            r.status || r.estado || '',
        // Reserva / comprador
        buyer_name:        r.buyer_name || r.comprador || '',
        buyer_contact:     r.buyer_contact || r.contacto || '',
        notes:             r.notas || r.sale_notes || '',
        reserved_at:       r.reserved_at || r.fecha_reserva || '',
        fecha_escaneada:   r.scanned_at || r.scan_date || r.updated_at || '',
      }))

      // Filtros client-side (búsqueda de texto e idioma)
      if (idioma)   rows = rows.filter(r => r.idioma === idioma)
      if (busqueda) rows = rows.filter(r =>
        r.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
        r.set_name.toLowerCase().includes(busqueda.toLowerCase())
      )

      return { rows, total: totalCount ?? 0, page, pageSize: PAGE_SIZE }
    },
    staleTime: 30_000,
    keepPreviousData: true,   // no parpadea al cambiar de página
  })
}

export { PAGE_SIZE }
