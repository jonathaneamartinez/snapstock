import { useQuery } from '@tanstack/react-query'
import { STORE_ID } from '../constants'

const SCANNER_URL = import.meta.env.VITE_SCANNER_URL || 'https://stock-tcg-production.up.railway.app'

/**
 * Lista de artistas/ilustradores presentes en el stock de la tienda.
 * Pega al endpoint backend GET /catalog/artists (agrega inventory+cards).
 *
 * @param {object} opts
 * @param {string|null} opts.lang     'en'|'jp'|'cn' o null = todos
 * @param {number}      opts.minCount artistas con al menos N cartas (default 1)
 * @returns { artists, total, isLoading, error }
 */
export function useArtists({ lang = null, minCount = 1 } = {}) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['artists', STORE_ID, lang, minCount],
    queryFn: async () => {
      const p = new URLSearchParams({ store_id: STORE_ID, min_count: String(minCount) })
      if (lang) p.set('lang', lang)
      const res = await fetch(`${SCANNER_URL}/catalog/artists?${p.toString()}`)
      if (!res.ok) throw new Error('No se pudo cargar artistas')
      const j = await res.json()
      return { artists: j.artists ?? [], total: j.total_artists ?? 0 }
    },
    staleTime: 600_000,   // 10 min
  })
  return {
    artists: data?.artists ?? [],
    total:   data?.total   ?? 0,
    isLoading,
    error,
  }
}
