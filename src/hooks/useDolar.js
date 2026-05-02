import { useQuery } from '@tanstack/react-query'
import { getDolar } from '../lib/dolar'

export function useDolar() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['dolar'],
    queryFn: getDolar,
    staleTime: 3_600_000, // 1 hora
  })
  return {
    blue:    data?.blue    ?? null,
    oficial: data?.oficial ?? null,
    isLoading,
    error,
  }
}
