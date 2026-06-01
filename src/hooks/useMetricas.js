import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { STORE_ID } from '../constants'

export function useMetricas() {
  return useQuery({
    queryKey: ['metricas'],
    queryFn: async () => {
      // ── 1. Sumas y counts via agregados server-side (sin traer filas) ──────────
      const [
        sumTotalRes,
        sumDispRes,
        { count: totalReservadas = 0 },
      ] = await Promise.all([
        // SUM de quantity — total de unidades físicas en catálogo
        supabase.from('inventory')
          .select('quantity.sum()')
          .eq('store_id', STORE_ID),

        // SUM de quantity de disponibles con stock > 0
        supabase.from('inventory')
          .select('quantity.sum()')
          .eq('store_id', STORE_ID)
          .or('status.eq.disponible,estado.eq.disponible')
          .gt('quantity', 0),

        // COUNT de reservadas
        supabase.from('inventory')
          .select('id', { count: 'exact', head: true })
          .eq('store_id', STORE_ID)
          .or('status.eq.reservada,estado.eq.reservada'),
      ])

      // PostgREST devuelve el aggregate bajo el nombre de la columna
      const totalCartas      = sumTotalRes.data?.[0]?.quantity ?? 0
      const totalDisponibles = sumDispRes.data?.[0]?.quantity  ?? 0

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
