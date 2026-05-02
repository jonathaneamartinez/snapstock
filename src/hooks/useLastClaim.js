import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { STORE_ID } from '../constants'

/** Extrae el nombre de carta del campo notes: "Charizard ex #200 | info" → "Charizard ex" */
function parseName(notes) {
  if (!notes) return null
  return notes.split('|')[0].replace(/#\S+/, '').trim() || null
}

export function useLastClaim() {
  return useQuery({
    queryKey: ['lastClaim'],
    queryFn: async () => {
      // 1. Buscar el claim más reciente
      const { data: last } = await supabase
        .from('sales')
        .select('sold_at')
        .eq('store_id', STORE_ID)
        .ilike('channel', '%claim%')
        .order('sold_at', { ascending: false })
        .limit(1)
        .single()

      if (!last) return null

      // 2. Traer todas las ventas de ese mismo día
      const fecha = last.sold_at.slice(0, 10)
      const { data } = await supabase
        .from('sales')
        .select('id, buyer_name, total_ars, total_paid, notes, channel, sold_at')
        .eq('store_id', STORE_ID)
        .ilike('channel', '%claim%')
        .gte('sold_at', `${fecha}T00:00:00`)
        .lte('sold_at', `${fecha}T23:59:59`)

      const rows = data ?? []

      const totalCartas   = rows.length
      const totalARS      = rows.reduce((s, r) => s + (r.total_ars || 0), 0)
      const compradores   = new Set(rows.map(r => r.buyer_name).filter(Boolean)).size || totalCartas

      // Agrupar por comprador para mostrar
      const byBuyer = {}
      for (const r of rows) {
        const k = r.buyer_name || 'Sin nombre'
        if (!byBuyer[k]) byBuyer[k] = { buyer: k, total: 0, cartas: 0 }
        byBuyer[k].total  += r.total_ars || 0
        byBuyer[k].cartas += 1
      }

      return {
        fecha:       last.sold_at,
        totalCartas,
        totalARS,
        compradores,
        buyers:      Object.values(byBuyer).sort((a, b) => b.total - a.total),
      }
    },
    staleTime: 120_000,
  })
}
