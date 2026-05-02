// Pokemon TCG API — free, no key required
// https://docs.pokemontcg.io/

const BASE = 'https://api.pokemontcg.io/v2'

// In-memory cache: "nombre|numero" → { small, large } | null
const _cache = new Map()

/** Extrae el nombre base quitando prefijos tipo "Team Rocket's", "Dark", "Lt. Surge's", etc. */
function baseName(nombre) {
  return nombre
    .replace(/^(Team Rocket's|Dark |Light |Lt\. Surge's|Brock's|Misty's|Sabrina's|Giovanni's|Blaine's|Koga's|Erika's|Janine's|Pryce's|Jasmine's|Whitney's|Morty's|Chuck's|Karen's)\s*/i, '')
    .trim()
}

/** Limpia el nombre para la query: quita comillas, apóstrofes problemáticos */
function sanitize(s) {
  return s.replace(/['"]/g, ' ').replace(/\s+/g, ' ').trim()
}

async function apiSearch(q, pageSize = 1) {
  const params = new URLSearchParams({ q, pageSize })
  const res = await fetch(`${BASE}/cards?${params}`)
  if (!res.ok) return null
  const json = await res.json()
  return json.data?.[0] ?? null
}

function toResult(card) {
  if (!card) return null
  return {
    small: card.images?.small ?? null,
    large: card.images?.large ?? null,
  }
}

/**
 * Busca imágenes de una carta con múltiples estrategias fallback.
 * Retorna { small, large } o null.
 */
export async function fetchCardImages(nombre, numero) {
  if (!nombre) return null

  const key = `${nombre}|${numero}`
  if (_cache.has(key)) return _cache.get(key)

  const safe    = sanitize(nombre)
  const base    = sanitize(baseName(nombre))
  const num     = numero ? String(numero).replace(/\D/g, '') : '' // solo dígitos

  let card = null

  try {
    // S1: nombre exacto + número  →  name:"Oddish" number:1
    if (num) {
      card = await apiSearch(`name:"${safe}" number:${num}`)
    }

    // S2: nombre exacto sin número
    if (!card) {
      card = await apiSearch(`name:"${safe}"`)
    }

    // S3: nombre base + número (quita "Team Rocket's", "Dark", etc.)
    if (!card && base !== safe) {
      if (num) card = await apiSearch(`name:"${base}" number:${num}`)
      if (!card) card = await apiSearch(`name:"${base}"`)
    }

    // S4: búsqueda wildcard — pokemontcg soporta name:Dugtrio* (sin comillas)
    if (!card && base) {
      // toma solo la primera palabra significativa para no ser demasiado restrictivo
      const firstWord = base.split(' ')[0]
      if (firstWord.length >= 4) {
        card = await apiSearch(`name:${firstWord}* ${num ? `number:${num}` : ''}`.trim())
      }
    }

    const result = toResult(card)
    _cache.set(key, result)
    return result

  } catch (err) {
    console.warn('[pokemonTcg] error buscando', nombre, err?.message)
    _cache.set(key, null)
    return null
  }
}
