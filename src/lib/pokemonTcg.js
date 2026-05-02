// Pokemon TCG API — free, no key required
// https://docs.pokemontcg.io/

const BASE = 'https://api.pokemontcg.io/v2'

// In-memory cache: "nombre|numero" → { small, large } | null
const _cache = new Map()

/**
 * Extrae el sufijo de número del nombre si está incluido.
 * "Mew VMAX #TG30" → { cleanName: "Mew VMAX", extraNum: "TG30" }
 */
function extractEmbeddedNumber(nombre) {
  const match = nombre.match(/\s*#([A-Za-z0-9]+)\s*$/)
  if (match) return { cleanName: nombre.slice(0, match.index).trim(), extraNum: match[1] }
  return { cleanName: nombre.trim(), extraNum: null }
}

/**
 * Normaliza el nombre:
 * - 'S  →  's  (Boss'S → Boss's)
 * - recorta espacios extra
 */
function normalize(s) {
  return s
    .replace(/'([A-Z])/g, (_, c) => `'${c.toLowerCase()}`)  // Boss'S → Boss's
    .replace(/\s+/g, ' ')
    .trim()
}

/** Quita prefijos de entrenador */
function baseName(nombre) {
  return nombre
    .replace(/^(Team Rocket's|Dark |Light |Lt\. Surge's|Brock's|Misty's|Sabrina's|Giovanni's|Blaine's|Koga's|Erika's|Janine's|Pryce's|Jasmine's|Whitney's|Morty's|Chuck's|Karen's|Rosa's|Boss's|Marnie's|Raihan's|Bea's|Gordie's|Melony's|Piers')\s*/i, '')
    .trim()
}

/** Para la query: solo quita las comillas dobles (rompen el sintaxis de la API) */
function forQuery(s) {
  return s.replace(/"/g, '').trim()
}

/** Versión sin apóstrofes para fallback */
function noApostrophe(s) {
  return s.replace(/'/g, '').replace(/\s+/g, ' ').trim()
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
  return { small: card.images?.small ?? null, large: card.images?.large ?? null }
}

/**
 * Busca imágenes con múltiples estrategias fallback.
 * Retorna { small, large } o null.
 */
export async function fetchCardImages(nombre, numero) {
  if (!nombre) return null

  const key = `${nombre}|${numero}`
  if (_cache.has(key)) return _cache.get(key)

  // 1. Limpiar número embebido ("Mew VMAX #TG30" → "Mew VMAX", "TG30")
  const { cleanName, extraNum } = extractEmbeddedNumber(nombre)

  // 2. Normalizar (Boss'S → Boss's)
  const norm = normalize(cleanName)

  // 3. Variantes del nombre
  const withApostrophe    = forQuery(norm)           // "Rosa's Encouragement"
  const withoutApostrophe = noApostrophe(norm)       // "Rosas Encouragement"
  const base              = forQuery(baseName(norm)) // "Encouragement"

  // 4. Número a usar
  const bestNum = extraNum || (numero ? String(numero) : '')
  const numOnly = bestNum.replace(/\D/g, '')

  let card = null

  try {
    // S1: nombre con apóstrofe + número completo
    if (bestNum) card = await apiSearch(`name:"${withApostrophe}" number:${bestNum}`)

    // S2: nombre con apóstrofe, sin número
    if (!card) card = await apiSearch(`name:"${withApostrophe}"`)

    // S3: nombre sin apóstrofe + número  (Rosas → Rosas Encouragement)
    if (!card && withoutApostrophe !== withApostrophe) {
      if (bestNum) card = await apiSearch(`name:"${withoutApostrophe}" number:${bestNum}`)
      if (!card)   card = await apiSearch(`name:"${withoutApostrophe}"`)
    }

    // S4: nombre base (sin prefijo entrenador) + número
    if (!card && base && base !== withApostrophe) {
      if (bestNum) card = await apiSearch(`name:"${base}" number:${bestNum}`)
      if (!card)   card = await apiSearch(`name:"${base}"`)
    }

    // S5: número solo dígitos si es diferente al bestNum (30 vs TG30)
    if (!card && numOnly && numOnly !== bestNum) {
      card = await apiSearch(`name:"${withApostrophe}" number:${numOnly}`)
    }

    // S6: nombre sin comillas (algunos parsers de Lucene fallan con apóstrofe dentro de "")
    if (!card && withApostrophe.includes("'")) {
      if (bestNum) card = await apiSearch(`name:${withoutApostrophe} number:${bestNum}`)
      if (!card)   card = await apiSearch(`name:${withoutApostrophe}`)
    }

    // S7: wildcard con el nombre base  →  name:*Energy* number:35
    if (!card && base) {
      if (bestNum) card = await apiSearch(`name:*${base}* number:${bestNum}`)
      if (!card)   card = await apiSearch(`name:*${base}*`)
    }

    // S8: wildcard con última palabra significativa del nombre completo
    if (!card) {
      const words  = withoutApostrophe.split(' ').filter(w => w.length >= 4)
      const last   = words[words.length - 1]
      if (last && last !== base) {
        if (bestNum) card = await apiSearch(`name:*${last}* number:${bestNum}`)
        if (!card)   card = await apiSearch(`name:*${last}*`)
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
