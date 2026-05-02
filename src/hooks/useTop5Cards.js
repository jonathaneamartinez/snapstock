import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { STORE_ID } from '../constants'

/** Extrae nombre de carta del campo notes: "Charizard ex #200 | info" → "Charizard ex #200" */
function parseName(notes) {
  if (!notes) return null
  return notes.split('|')[0].trim() || null
}

export function useTop5Cards(year, month) {
  return useQuery({
    queryKey: ['top5cards', year, month],
    queryFn: async () => {
      const from = `${year}-${String(month).padStart(2,'0')}-01`
      const to   = `${year}-${String(month === 12 ? 1 : month + 1).padStart(2,'0')}-01`
      const toY  = month === 12 ? year + 1 : year

      const { data } = await supabase
        .from('sales')
        .select('notes')
        .eq('store_id', STORE_ID)
        .gte('sold_at', from)
        .lt('sold_at', `${toY}-${String(month === 12 ? 1 : month + 1).padStart(2,'0')}-01`)

      const count = {}
      for (const r of data ?? []) {
        const name = parseName(r.notes)
        if (name) count[name] = (count[name] || 0) + 1
      }

      return Object.entries(count)
        .map(([nombre, qty]) => ({ nombre, qty }))
        .sort((a, b) => b.qty - a.qty)
        .slice(0, 5)
    },
    staleTime: 120_000,
  })
}
