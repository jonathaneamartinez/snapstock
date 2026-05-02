import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { STORE_ID } from '../constants'

export function useStock(filters = {}) {
  const { estado, busqueda, idioma, condicion } = filters

  return useQuery({
    queryKey: ['stock', filters],
    queryFn: async () => {
      // stock_completo es una VIEW — no expone store_id directamente
      // como solo hay una tienda los datos ya son correctos
      let q = supabase
        .from('stock_completo')
        .select('*')

      if (estado)    q = q.eq('status', estado)
      if (idioma)    q = q.eq('language', idioma)
      if (condicion) q = q.eq('condition', condicion)
      if (busqueda)  q = q.ilike('nombre_base', `%${busqueda}%`)

      q = q.order('inventory_id', { ascending: false }).limit(200)

      const { data, error } = await q
      if (error) throw error
      return data ?? []
    },
    staleTime: 30_000,
  })
}
