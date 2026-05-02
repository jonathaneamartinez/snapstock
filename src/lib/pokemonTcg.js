// Pokemon TCG API — free, no key required
// https://docs.pokemontcg.io/

const BASE = 'https://api.pokemontcg.io/v2'

// In-memory cache: "nombre|numero" → { small, large } | null
const _cache = new Map()

/**
 * Extrae el sufijo de número del nombre si está incluido.
 * Ej: "Mew VMAX #TG30" → { cleanName: "Mew VMAX", extraNum: "TG30" }
 * Ej: "Pikachu #001"   → { cleanName: "Pikachu",   extraNum: "001"  }
 * Ej: "Oddish"         → { cleanName: "Oddish",     extraNum: null   }
 */
function extractEmbeddedNumber(nombre) {
  // Patrón: cualquier cosa que empiece con # seguido de letras/números al final del nombre
  const match = nombre.match(/\s*#([A-Za-z0-9]+)\s*$/)
  if (match) {
    return {
      cleanName: nombre.slice(0, match.index).trim(),
      extraNum:  match[1],
    }
  }
  return { cleanName: nombre.trim(), extraNum: null }
}

/** Quita prefijos de entrenador: "Team Rocket's", "Dark", "Lt. Surge's", etc. */
function baseName(nombre) {
  return nombre
    .replace(/^(Team Rocket's|Dark |Light |Lt\. Surge's|Brock's|Misty's|Sabrina's|Giovanni's|Blaine's|Koga's|Erika's|Janine's|Pryce's|Jasmine's|Whitney's|Morty's|Chuck's|Karen's)\s*/i, '')
    .trim()
}

/** Limpia comillas/apóstrofes para la query */
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

  // Limpiar número embebido en el nombre ("Mew VMAX #TG30" → "Mew VMAX", "TG30")
  const { cleanName, extraNum } = extractEmbeddedNumber(nombre)

  // Número a usar: preferir el extraído del nombre (TG30, GG70, etc.) sobre el campo numero
  const bestNum = extraNum || (numero ? String(numero) : '')
  // También preparar versión solo dígitos como fallback
  const numOnly = bestNum.replace(/\D/g, '')

  const safeName = sanitize(cleanName)
  const baseN    = sanitize(baseName(cleanName))

  let card = null

  try {
    // S1: nombre limpio + número completo (ej: number:TG30)
    if (bestNum) {
      card = await apiSearch(`name:"${safeName}" number:${bestNum}`)
    }

    // S2: nombre limpio sin número
    if (!card) {
      card = await apiSearch(`name:"${safeName}"`)
    }

    // S3: nombre base (sin prefijo entrenador) + número completo
    if (!card && baseN !== safeName) {
      if (bestNum) card = await apiSearch(`name:"${baseN}" number:${bestNum}`)
      if (!card)   card = await apiSearch(`name:"${baseN}"`)
    }

    // S4: con número solo dígitos (por si el campo tiene "30" en vez de "TG30")
    if (!card && numOnly && numOnly !== bestNum) {
      card = await apiSearch(`name:"${safeName}" number:${numOnly}`)
    }

    // S5: wildcard con primera palabra significativa
    if (!card && safeName) {
      const firstWord = safeName.split(' ')[0]
      if (firstWord.length >= 4) {
        const q = `name:${firstWord}*${bestNum ? ` number:${bestNum}` : ''}`
        card = await apiSearch(q.trim())
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
