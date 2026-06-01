import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { STORE_ID } from '../constants'

export function useMetricas() {
  return useQuery({
    queryKey: ['metricas'],
    queryFn: async () => {
      // ── 1. Counts totales via queries HEAD (instantáneas, sin traer filas) ───
      const [
        { count: totalCartas    = 0 },
        { count: totalDisponibles = 0 },
        { count: totalReservadas  = 0 },
      ] = await Promise.all([
        // Total entradas en catálogo
        supabase.from('inventory')
          .select('id', { count: 'exact', head: true })
          .eq('store_id', STORE_ID),

        // Disponibles con stock físico (quantity > 0)
        supabase.from('inventory')
          .select('id', { count: 'exact', head: true })
          .eq('store_id', STORE_ID)
          .or('status.eq.disponible,estado.eq.disponible')
          .gt('quantity', 0),

        // Reservadas
        supabase.from('inventory')
          .select('id', { count: 'exact', head: true })
          .eq('store_id', STORE_ID)
          .or('status.eq.reservada,estado.eq.reservada'),
      ])

      // ── 2. Valor total — paginamos de a 5000 solo para el cálculo de USD ────
      const PAGE = 5000
      let disponiblesRows = []
      let reservadasRows  = []
      let from = 0
      let done = false

      while (!done) {
        const { data, error } = await supabase
          .from('inventory')
          .select('quantity, price_usd, price_ars_blue, price_ars_oficial, status, estado')
          .eq('store_id', STORE_ID)
          .or('status.eq.disponible,status.eq.reservada,estado.eq.disponible,estado.eq.reservada')
          .not('price_usd', 'is', null)   // solo las que tienen precio para el valor
          .range(from, from + PAGE - 1)

        if (error) break
        const chunk = data ?? []
        for (const r of chunk) {
          if (r.status === 'disponible' || r.estado === 'disponible') disponiblesRows.push(r)
          else if (r.status === 'reservada' || r.estado === 'reservada') reservadasRows.push(r)
        }
        if (chunk.length < PAGE) break
        from += PAGE
      }

      const valorUSD        = disponiblesRows.reduce((s, r) => s + (r.price_usd         || 0) * (r.quantity || 1), 0)
      const valorARSBlue    = disponiblesRows.reduce((s, r) => s + (r.price_ars_blue    || 0) * (r.quantity || 1), 0)
      const valorARSOficial = disponiblesRows.reduce((s, r) => s + (r.price_ars_oficial || 0) * (r.quantity || 1), 0)
      const deudasActivas   = reservadasRows.reduce((s, r)  => s + (r.price_ars_blue   || 0) * (r.quantity || 1), 0)

      return {
        totalCartas,          // count de entradas en catálogo (tipos de cartas)
        totalDisponibles,     // count de entradas disponibles con quantity > 0
        totalReservadas,      // count de entradas reservadas
        valorUSD,
        valorARSBlue,
        valorARSOficial,
        deudasActivas,
        cantReservadas: reservadasRows.length,
      }
    },
    staleTime: 30_000,
  })
}
