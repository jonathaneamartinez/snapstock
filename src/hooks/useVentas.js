import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { STORE_ID } from '../constants'

export function useVentas(year, month) {
  return useQuery({
    queryKey: ['ventas', year, month],
    queryFn: async () => {
      const nextMonth = month === 12 ? 1      : month + 1
      const nextYear  = month === 12 ? year + 1 : year
      const from = `${year}-${String(month).padStart(2, '0')}-01`
      const to   = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`

      // Traemos todas las ventas del store (sin filtro de fecha en SQL)
      // para poder filtrar por sold_at o created_at del lado cliente
      const { data, error } = await supabase
        .from('sales')
        .select('id, sold_at, created_at, channel, buyer_name, notes, total_usd, total_ars, total_ars_blue')
        .eq('store_id', STORE_ID)
        .order('sold_at', { ascending: false, nullsFirst: false })

      if (error) throw error

      const fromTs = new Date(from).getTime()
      const toTs   = new Date(to).getTime()

      return (data ?? [])
        .map(v => {
          const fechaEfectiva = v.sold_at || v.created_at
          return {
            ...v,
            fecha_venta:   fechaEfectiva,
            // nombre de carta guardado en notes ("Charizard ex | info")
            card_name:     v.notes ? v.notes.split('|')[0].trim() : null,
            // ARS: total_ars_blue primero, sino total_ars
            total_ars_blue: v.total_ars_blue ?? v.total_ars ?? null,
          }
        })
        .filter(v => {
          const ts = v.fecha_venta ? new Date(v.fecha_venta).getTime() : 0
          return ts >= fromTs && ts < toTs
        })
    },
    staleTime: 30_000,
  })
}
