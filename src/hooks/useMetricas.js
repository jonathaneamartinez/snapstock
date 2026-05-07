import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { STORE_ID } from '../constants'

export function useMetricas() {
  return useQuery({
    queryKey: ['metricas'],
    queryFn: async () => {
      // Traemos todos los registros con paginación manual para no depender
      // del límite default de Supabase (1000 filas).
      const PAGE = 5000
      let allRows = []
      let from    = 0
      let done    = false

      while (!done) {
        const { data, error } = await supabase
          .from('inventory')
          .select('quantity, price_usd, price_ars_blue, price_ars_oficial, status, estado')
          .eq('store_id', STORE_ID)
          .range(from, from + PAGE - 1)

        if (error) throw error
        const chunk = data ?? []
        allRows.push(...chunk)
        done = chunk.length < PAGE   // si vino menos de lo pedido, ya terminamos
        from += PAGE
      }

      const disponibles = allRows.filter(r => r.status === 'disponible' || r.estado === 'disponible')
      const reservadas  = allRows.filter(r => r.status === 'reservada'  || r.estado === 'reservada')

      const totalCartas     = disponibles.reduce((s, r) => s + (r.quantity || 0), 0)
      const valorUSD        = disponibles.reduce((s, r) => s + (r.price_usd       || 0) * (r.quantity || 0), 0)
      const valorARSBlue    = disponibles.reduce((s, r) => s + (r.price_ars_blue  || 0) * (r.quantity || 0), 0)
      const valorARSOficial = disponibles.reduce((s, r) => s + (r.price_ars_oficial || 0) * (r.quantity || 0), 0)
      const deudasActivas   = reservadas.reduce((s, r)  => s + (r.price_ars_blue  || 0) * (r.quantity || 0), 0)

      return { totalCartas, valorUSD, valorARSBlue, valorARSOficial, deudasActivas, cantReservadas: reservadas.length }
    },
    staleTime: 60_000,
  })
}
