import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { STORE_ID } from '../constants'

export const PRICE_SOURCES = [
  { id: 'tcgplayer',     label: 'TCGPlayer',     currency: 'USD', flag: '🇺🇸' },
  { id: 'cardmarket',    label: 'CardMarket',    currency: 'EUR', flag: '🇪🇺' },
  { id: 'pricecharting', label: 'PriceCharting', currency: 'USD', flag: '🏷️' },
]

export function useSettings() {
  const qc = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['settings', STORE_ID],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('stores')
        .select('margen_ganancia, precio_fuente, name, owner_name, whatsapp_number')
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

  const { mutateAsync: savePrecioFuente, isPending: savingFuente } = useMutation({
    mutationFn: async (fuente) => {
      const { error } = await supabase
        .from('stores')
        .update({ precio_fuente: fuente })
        .eq('id', STORE_ID)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings'] }),
  })

  const margen        = data?.margen_ganancia ?? 20
  const precioFuente  = data?.precio_fuente   ?? 'tcgplayer'
  const storeName     = data?.name            ?? '—'
  const ownerName     = data?.owner_name      ?? '—'
  const whatsappNumber = data?.whatsapp_number ?? '—'

  return { margen, isLoading, saveMargen, savingMargen, precioFuente, savePrecioFuente, savingFuente, storeName, ownerName, whatsappNumber }
}
