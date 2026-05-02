// Pokemon TCG API — free, no key required for basic use
// https://docs.pokemontcg.io/

const BASE = 'https://api.pokemontcg.io/v2'

// In-memory cache: "nombre|numero|idioma" → { small, large }
const _cache = new Map()

/**
 * Busca una carta por nombre + número en la Pokemon TCG API.
 * Retorna { small, large } o null.
 */
export async function fetchCardImages(nombre, numero, idioma = 'en') {
  if (!nombre) return null

  const key = `${nombre}|${numero}|${idioma}`
  if (_cache.has(key)) return _cache.get(key)

  try {
    // La API soporta lang para cartas JP/FR/DE/etc.
    // Para cartas en inglés no hace falta suffix
    let q = `name:"${nombre}"`
    if (numero) q += ` number:${numero}`

    const params = new URLSearchParams({ q, pageSize: 1 })
    // Para idiomas no-inglés la API tiene sets internacionales
    // pero la cobertura es menor — para JP usamos el nombre en inglés igual
    const url = `${BASE}/cards?${params}`

    const res = await fetch(url)
    if (!res.ok) { _cache.set(key, null); return null }

    const json = await res.json()
    const card  = json.data?.[0]
    if (!card) { _cache.set(key, null); return null }

    const result = {
      small: card.images?.small ?? null,
      large: card.images?.large ?? null,
    }
    _cache.set(key, result)
    return result
  } catch {
    _cache.set(key, null)
    return null
  }
}
