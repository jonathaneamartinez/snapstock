import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { STORE_ID } from '../constants'

export function useMetricas() {
  return useQuery({
    queryKey: ['metricas'],
    queryFn: async () => {
      // ── 1. Totales via RPC (SUM y COUNT server-side, una sola query) ──────────
      const { data: totals, error: totalsError } = await supabase
        .rpc('get_stock_totals', { p_store_id: STORE_ID })

      const totalCartas      = totals?.[0]?.total_unidades ?? 0
      const totalDisponibles = totals?.[0]?.disponibles    ?? 0
      const totalReservadas  = totals?.[0]?.reservadas     ?? 0

      if (totalsError) console.warn('[useMetricas] RPC error:', totalsError.message)

      // ── 1b. Count de entradas (filas) para alinear con paginador ─────────────
      const { count: totalEntradas } = await supabase
        .from('inventory')
        .select('id', { count: 'exact', head: true })
        .eq('store_id', STORE_ID)
        .or('status.eq.disponible,status.eq.reservada,estado.eq.disponible,estado.eq.reservada')
        .gt('quantity', 0)

      // ── 2. Valor total USD — solo cartas con precio (no trae todas las filas) ─
      const PAGE = 5000
      let disponiblesRows = []
      let reservadasRows  = []
      let from = 0

      while (true) {
        const { data, error } = await supabase
          .from('inventory')
          .select('quantity, price_usd, price_ars_blue, price_ars_oficial, status, estado')
          .eq('store_id', STORE_ID)
          .or('status.eq.disponible,status.eq.reservada,estado.eq.disponible,estado.eq.reservada')
          .not('price_usd', 'is', null)
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
        totalCartas,          // SUM de quantity (unidades físicas totales)
        totalEntradas:        totalEntradas ?? 0, // COUNT de filas (alineado con paginador)
        totalDisponibles,     // SUM de quantity disponibles con qty > 0
        totalReservadas,      // COUNT de reservadas
        valorUSD,
        valorARSBlue,
        valorARSOficial,
        deudasActivas,
        cantReservadas: reservadasRows.length,
      }
    },
    staleTime: 15_000,   // 15s — refresco rápido para que stepper se refleje pronto
  })
}
