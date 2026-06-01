import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { STORE_ID } from '../constants'

export function useMetricas() {
  return useQuery({
    queryKey: ['metricas'],
    queryFn: async () => {
      // ── 1. Counts y sumas via RPC o paginando inventory ──────────────────────
      // Traemos en una sola query: quantity, price, status para todas las filas
      const PAGE = 5000
      let disponiblesRows = []
      let reservadasRows  = []
      let allRows         = []
      let from = 0
      let done = false

      while (!done) {
        const { data, error } = await supabase
          .from('inventory')
          .select('quantity, price_usd, price_ars_blue, price_ars_oficial, status, estado')
          .eq('store_id', STORE_ID)
          .range(from, from + PAGE - 1)

        if (error) throw error
        const chunk = data ?? []
        for (const r of chunk) {
          allRows.push(r)
          if (r.status === 'disponible' || r.estado === 'disponible') disponiblesRows.push(r)
          else if (r.status === 'reservada' || r.estado === 'reservada') reservadasRows.push(r)
        }
        done = chunk.length < PAGE
        from += PAGE
      }

      // Total de cartas = SUM de quantities (cuántas cartas físicas hay en total)
      const totalCartas      = allRows.reduce((s, r) => s + (r.quantity || 0), 0)
      // Disponibles = SUM de quantities de las disponibles con stock > 0
      const totalDisponibles = disponiblesRows
        .filter(r => (r.quantity || 0) > 0)
        .reduce((s, r) => s + (r.quantity || 0), 0)
      // Reservadas = cantidad de filas reservadas (no suma de quantity)
      const totalReservadas  = reservadasRows.length

      const valorUSD        = disponiblesRows.reduce((s, r) => s + (r.price_usd         || 0) * (r.quantity || 0), 0)
      const valorARSBlue    = disponiblesRows.reduce((s, r) => s + (r.price_ars_blue    || 0) * (r.quantity || 0), 0)
      const valorARSOficial = disponiblesRows.reduce((s, r) => s + (r.price_ars_oficial || 0) * (r.quantity || 0), 0)
      const deudasActivas   = reservadasRows.reduce((s, r)  => s + (r.price_ars_blue   || 0) * (r.quantity || 0), 0)

      return {
        totalCartas,          // SUM de quantities (total físico de cartas)
        totalDisponibles,     // SUM de quantities disponibles con stock > 0
        totalReservadas,      // cantidad de reservas activas
        valorUSD,
        valorARSBlue,
        valorARSOficial,
        deudasActivas,
        cantReservadas: reservadasRows.length,
      }
    },
    staleTime: 30_000,   // 30s — más fresco para que el stepper se refleje rápido
  })
}
