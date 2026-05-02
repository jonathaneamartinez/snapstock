import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { STORE_ID } from '../constants'

export function useMetricas() {
  return useQuery({
    queryKey: ['metricas'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('inventory')
        .select('quantity, price_usd, price_ars_blue, price_ars_oficial, status, condicion')
        .eq('store_id', STORE_ID)

      if (error) throw error
      const rows = data ?? []

      const disponibles = rows.filter(r => r.status === 'disponible' || r.estado === 'disponible')
      const reservadas  = rows.filter(r => r.status === 'reservada'  || r.estado === 'reservada')

      const totalCartas   = disponibles.reduce((s, r) => s + (r.quantity || 0), 0)
      const valorUSD      = disponibles.reduce((s, r) => s + (r.price_usd || 0) * (r.quantity || 0), 0)
      const valorARSBlue  = disponibles.reduce((s, r) => s + (r.price_ars_blue || 0) * (r.quantity || 0), 0)
      const deudasActivas = reservadas.reduce((s, r)  => s + (r.price_ars_blue || 0) * (r.quantity || 0), 0)

      return { totalCartas, valorUSD, valorARSBlue, deudasActivas, cantReservadas: reservadas.length }
    },
    staleTime: 60_000,
  })
}
