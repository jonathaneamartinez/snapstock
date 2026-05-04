import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { STORE_ID } from '../constants'

export function useSettings() {
  const qc = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['settings', STORE_ID],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('stores')
        .select('margen_ganancia')
        .eq('id', STORE_ID)
        .single()
      if (error) console.warn('[useSettings]', error.message)
      return data ?? {}
    },
    staleTime: 60_000,
  })

  const { mutateAsync: saveMargen, isPending: savingMargen } = useMutation({
    mutationFn: async (margen) => {
      const { error } = await supabase
        .from('stores')
        .update({ margen_ganancia: Number(margen) })
        .eq('id', STORE_ID)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings'] }),
  })

  const margen = data?.margen_ganancia ?? 20

  return { margen, isLoading, saveMargen, savingMargen }
}
