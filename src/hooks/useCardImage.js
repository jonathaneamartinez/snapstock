/**
 * useCardImage — hook para obtener la URL correcta de imagen de una carta.
 *
 * Muestra `fallbackUrl` (de Supabase) inmediatamente, luego verifica/reemplaza
 * con la URL del scanner backend (pHash index). Usa cache en memoria para no
 * repetir llamadas por la misma carta en la misma sesión.
 *
 * Uso:
 *   const [imgSrc, onImgError] = useCardImage(card.image_url, {
 *     name:   card.nombre,
 *     number: card.numero,
 *     lang:   card.idioma,
 *   })
 *   <img src={imgSrc} onError={onImgError} alt={card.nombre} />
 */
import { useState, useEffect } from 'react'
import { scannerApi }          from '../lib/scanner'

const CARD_BACK = 'https://images.pokemontcg.io/back.png'
const _cache    = new Map()

const normLang = (l = 'en') => {
  const s = (l || '').toLowerCase()
  if (['ja', 'jp', 'japanese'].includes(s)) return 'jp'
  if (['zh', 'cn', 'chinese'].includes(s))  return 'cn'
  return 'en'
}

export function useCardImage(fallbackUrl, { name, number = '', lang = 'en' } = {}) {
  const nLang    = normLang(lang)
  const cacheKey = `${nLang}|${(name || '').toLowerCase()}|${String(number || '').split('/')[0]}`

  const [src, setSrc] = useState(fallbackUrl || CARD_BACK)

  useEffect(() => {
    setSrc(fallbackUrl || CARD_BACK)
    if (!name || nLang === 'en') return

    if (_cache.has(cacheKey)) {
      const cached = _cache.get(cacheKey)
      if (cached) setSrc(cached)
      return
    }

    const numNorm = String(number || '').split('/')[0]
    scannerApi.cardImageUrl(name, numNorm, nLang)
      .then(r => {
        const url = r?.url ?? null
        _cache.set(cacheKey, url)
        if (url) setSrc(url)
      })
      .catch(() => { _cache.set(cacheKey, null) })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey, fallbackUrl])

  const onError = (e) => { e.currentTarget.src = CARD_BACK }
  return [src, onError]
}
