// Pokemon TCG API — free, no key required
// https://docs.pokemontcg.io/

const BASE = 'https://api.pokemontcg.io/v2'

// In-memory cache
const _cache = new Map()

/** Extrae número embebido: "Mew VMAX #TG30" → { cleanName:"Mew VMAX", extraNum:"TG30" } */
function extractEmbeddedNumber(nombre) {
  const match = nombre.match(/\s*#([A-Za-z0-9]+)\s*$/)
  if (match) return { cleanName: nombre.slice(0, match.index).trim(), extraNum: match[1] }
  return { cleanName: nombre.trim(), extraNum: null }
}

/** Normaliza apóstrofes: Boss'S → Boss's */
function normalize(s) {
  return s.replace(/'([A-Z])/g, (_, c) => `'${c.toLowerCase()}`).replace(/\s+/g, ' ').trim()
}

/** Quita prefijos de entrenador */
function baseName(nombre) {
  return nombre
    .replace(/^(Team Rocket's|Dark |Light |Lt\. Surge's|Brock's|Misty's|Sabrina's|Giovanni's|Blaine's|Koga's|Erika's|Janine's|Pryce's|Jasmine's|Whitney's|Morty's|Chuck's|Karen's|Rosa's|Boss's|Marnie's|Raihan's|Bea's|Gordie's|Melony's|Piers')\s*/i, '')
    .trim()
}

/** Solo quita comillas dobles */
function forQuery(s) { return s.replace(/"/g, '').trim() }

/** Sin apóstrofes */
function noApostrophe(s) { return s.replace(/'/g, '').replace(/\s+/g, ' ').trim() }

/**
 * Extrae palabras clave del set_name para filtrar en la API.
 * "Pokemon Twilight Masquerade" → "Twilight Masquerade"
 * "Team Rocket Returns" → "Team Rocket Returns"
 */
function setFragment(setName) {
  if (!setName) return null
  return setName
    .replace(/^(Pokemon|Pokémon)\s+/i, '')
    .replace(/['"]/g, '')
    .trim()
    .slice(0, 40) // máx 40 chars
}

async function apiSearch(q, pageSize = 1) {
  const params = new URLSearchParams({ q, pageSize })
  const res = await fetch(`${BASE}/cards?${params}`)
  if (!res.ok) return null
  const json = await res.json()
  return json.data?.[0] ?? null
}

/** Extrae el precio de mercado más relevante de tcgplayer */
function extractPrice(card) {
  const p = card.tcgplayer?.prices
  if (!p) return null
  const grades = ['holofoil', 'normal', 'reverseHolofoil', '1stEditionHolofoil', 'unlimitedHolofoil']
  for (const g of grades) {
    const v = p[g]?.market ?? p[g]?.mid ?? p[g]?.low
    if (v != null && v > 0) return Number(v.toFixed(2))
  }
  return null
}

/**
 * Busca múltiples cartas por nombre parcial en la PokémonTCG API.
 * Ideal para autocomplete: devuelve hasta `limit` resultados con set, imagen y precio.
 */
export async function searchCardsByName(nombre, limit = 20) {
  if (!nombre || nombre.length < 2) return []
  const { cleanName } = extractEmbeddedNumber(nombre)
  const q = `name:*${noApostrophe(normalize(cleanName)).replace(/\s+/g, '*')}*`
  try {
    const params = new URLSearchParams({ q, pageSize: limit, orderBy: 'name' })
    const res  = await fetch(`${BASE}/cards?${params}`)
    if (!res.ok) return []
    const json = await res.json()
    return (json.data ?? []).map(c => {
      const prices = c.tcgplayer?.prices ?? {}
      const has1stEd = !!(prices['1stEditionHolofoil'] || prices['1stEditionNormal'] || prices['1stEditionNormal'])
      const subtypes = c.subtypes ?? []
      return {
        id:               null,
        name:             c.name,
        set_name:         c.set?.name   || null,
        set_series:       c.set?.series || null,   // 'Base', 'Neo', 'EX', etc.
        card_number:      c.number      || null,
        image_url:        c.images?.small || c.images?.large || null,
        price_usd:        extractPrice(c),
        subtypes,                                   // puede incluir '1st Edition'
        has_first_ed_price: has1stEd,               // tiene precio de 1ª ed en TCGplayer
        source:           'market',
      }
    })
  } catch (err) {
    console.warn('[pokemonTcg] searchCardsByName error:', err?.message)
    return []
  }
}

function toResult(card) {
  if (!card) return null
  return { small: card.images?.small ?? null, large: card.images?.large ?? null }
}

/**
 * Busca imágenes con múltiples estrategias fallback.
 * @param {string} nombre
 * @param {string|number} numero
 * @param {string} [setName]  — nombre del set de Supabase (opcional, mejora precisión)
 */
export async function fetchCardImages(nombre, numero, setName) {
  if (!nombre) return null

  const key = `${nombre}|${numero}`
  if (_cache.has(key)) return _cache.get(key)

  const { cleanName, extraNum } = extractEmbeddedNumber(nombre)
  const norm     = normalize(cleanName)
  const withAp   = forQuery(norm)           // mantiene apóstrofe, sin comillas dobles
  const noAp     = noApostrophe(norm)       // sin apóstrofe
  const base     = forQuery(baseName(norm)) // sin prefijo entrenador
  const setFrag  = setFragment(setName)

  const bestNum = extraNum || (numero ? String(numero) : '')
  const numOnly = bestNum.replace(/\D/g, '')

  let card = null

  try {
    // ── Búsquedas exactas con apóstrofe ──────────────────────────────────
    // S1: nombre + número
    if (bestNum) card = await apiSearch(`name:"${withAp}" number:${bestNum}`)
    // S2: nombre solo
    if (!card)   card = await apiSearch(`name:"${withAp}"`)

    // ── Sin apóstrofe (por si el parser de Lucene falla con '') ───────────
    if (!card && noAp !== withAp) {
      if (bestNum) card = await apiSearch(`name:"${noAp}" number:${bestNum}`)
      if (!card)   card = await apiSearch(`name:"${noAp}"`)
    }

    // ── Sin prefijo de entrenador ─────────────────────────────────────────
    if (!card && base && base !== withAp) {
      if (bestNum) card = await apiSearch(`name:"${base}" number:${bestNum}`)
      if (!card)   card = await apiSearch(`name:"${base}"`)
    }

    // ── Número solo dígitos (cuando bestNum es "TG30" y la DB tiene "30") ─
    if (!card && numOnly && numOnly !== bestNum) {
      card = await apiSearch(`name:"${withAp}" number:${numOnly}`)
      if (!card && noAp !== withAp)
        card = await apiSearch(`name:"${noAp}" number:${numOnly}`)
    }

    // ── Nombre sin comillas (fix apostrofe dentro de "") + set opcional ───
    if (!card) {
      const q = setFrag
        ? `name:${noAp} number:${bestNum || numOnly} set.name:"${setFrag}"`
        : `name:${noAp}${bestNum ? ` number:${bestNum}` : ''}`
      card = await apiSearch(q.trim())
    }

    // ── Nombre base sin comillas + set ─────────────────────────────────
    if (!card && base && setFrag) {
      card = await apiSearch(`name:"${base}" set.name:"${setFrag}"`)
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
