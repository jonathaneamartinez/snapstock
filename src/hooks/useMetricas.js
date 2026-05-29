import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { STORE_ID } from '../constants'

export function useMetricas() {
  return useQuery({
    queryKey: ['metricas'],
    queryFn: async () => {
      // ── 1. Count total de entradas en catálogo (query rápida, sin traer datos) ─
      const { count: totalCartas = 0 } = await supabase
        .from('inventory')
        .select('id', { count: 'exact', head: true })
        .eq('store_id', STORE_ID)

      // ── 2. Datos para valores — solo disponibles (cantidad << total) ──────────
      //    Paginamos de a 5000 para no depender del límite default de Supabase.
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
          .range(from, from + PAGE - 1)

        if (error) throw error
        const chunk = data ?? []
        for (const r of chunk) {
          if (r.status === 'disponible' || r.estado === 'disponible') disponiblesRows.push(r)
          else if (r.status === 'reservada' || r.estado === 'reservada')  reservadasRows.push(r)
        }
        done = chunk.length < PAGE
        from += PAGE
      }

      const valorUSD        = disponiblesRows.reduce((s, r) => s + (r.price_usd        || 0) * (r.quantity || 0), 0)
      const valorARSBlue    = disponiblesRows.reduce((s, r) => s + (r.price_ars_blue   || 0) * (r.quantity || 0), 0)
      const valorARSOficial = disponiblesRows.reduce((s, r) => s + (r.price_ars_oficial || 0) * (r.quantity || 0), 0)
      const deudasActivas   = reservadasRows.reduce((s, r)  => s + (r.price_ars_blue   || 0) * (r.quantity || 0), 0)

      return {
        totalCartas,          // count total del catálogo (coincide con paginador)
        valorUSD,
        valorARSBlue,
        valorARSOficial,
        deudasActivas,
        cantReservadas: reservadasRows.length,
      }
    },
    staleTime: 60_000,
  })
}
