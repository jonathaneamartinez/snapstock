import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { STORE_ID } from '../constants'

export function useClaims() {
  return useQuery({
    queryKey: ['claims'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('claims')
        .select('id, title, style, dark, card_count, images_count, image_urls, created_at')
        .eq('store_id', STORE_ID)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data ?? []
    },
    staleTime: 30_000,
  })
}
