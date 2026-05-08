// Pokemon TCG API — free, no key required
// https://docs.pokemontcg.io/

const BASE = 'https://api.pokemontcg.io/v2'

// Resultados ya resueltos (nombre|numero → result)
const _cache = new Map()

// In-flight: evita lanzar el mismo fetch dos veces para la misma carta
const _inflight = new Map()

// Semáforo: máximo 3 fetchCardImages simultáneos para no saturar la API
const MAX_CONCURRENT = 3
let   _running = 0
const _queue   = []

function runQueued(fn) {
  return new Promise((resolve, reject) => {
    const task = () => {
      _running++
      fn()
        .then(resolve, reject)
        .finally(() => {
          _running--
          if (_queue.length > 0) _queue.shift()()
        })
    }
    if (_running < MAX_CONCURRENT) task()
    else _queue.push(task)
  })
}

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
export function fetchCardImages(nombre, numero, setName) {
  if (!nombre) return Promise.resolve(null)

  const key = `${nombre}|${numero}`
  if (_cache.has(key))    return Promise.resolve(_cache.get(key))
  if (_inflight.has(key)) return _inflight.get(key)

  const promise = runQueued(() => _doFetchCardImages(nombre, numero, setName, key))
  _inflight.set(key, promise)
  promise.finally(() => _inflight.delete(key))
  return promise
}

async function _doFetchCardImages(nombre, numero, setName, key) {
  // ── 1. Extraer número embebido en el nombre ("Mew #TG30" → extraNum:"TG30") ──
  const { cleanName, extraNum } = extractEmbeddedNumber(nombre)

  // ── 2. Limpiar el nombre ANTES de construir queries ────────────────────────
  //    Quitamos variantes entre corchetes ([Reverse Holo], [Ball], [Prize Pack]…)
  //    porque son chars especiales en Lucene y nunca forman parte del nombre en la API.
  const cleanBase = cleanName.replace(/\s*\[[^\]]*\]/g, '').replace(/\s+/g, ' ').trim()

  const norm   = normalize(cleanBase)
  const withAp = forQuery(norm)            // mantiene apóstrofe, sin comillas dobles
  const noAp   = noApostrophe(norm)        // sin apóstrofe
  const trainer = forQuery(baseName(norm)) // sin prefijo de entrenador
  const setFrag = setFragment(setName)

  // ── 3. Número limpio ────────────────────────────────────────────────────────
  //    Prioridad: número embebido en nombre > campo numero de la DB
  //    Quita sufijo .0 de Excel ("22.0" → "22") y espacios
  const rawNum  = (extraNum || (numero ? String(numero).trim() : '')).replace(/\.0+$/, '')
  const numOnly = rawNum.replace(/\D/g, '')   // solo dígitos ("TG30" → "30")

  let card = null

  try {
    // ── Estrategia 1 (más precisa): nombre + número + set ─────────────────
    if (withAp && rawNum && setFrag) {
      card = await apiSearch(`name:"${withAp}" number:${rawNum} set.name:"${setFrag}"`)
      if (!card && numOnly && numOnly !== rawNum)
        card = await apiSearch(`name:"${withAp}" number:${numOnly} set.name:"${setFrag}"`)
    }

    // ── Estrategia 2: nombre + número (sin set) ────────────────────────────
    if (!card && rawNum)
      card = await apiSearch(`name:"${withAp}" number:${rawNum}`)
    if (!card && numOnly && numOnly !== rawNum)
      card = await apiSearch(`name:"${withAp}" number:${numOnly}`)

    // ── Estrategia 3: nombre + set (sin número) ────────────────────────────
    if (!card && setFrag)
      card = await apiSearch(`name:"${withAp}" set.name:"${setFrag}"`)

    // ── Estrategia 4: nombre solo ──────────────────────────────────────────
    if (!card) card = await apiSearch(`name:"${withAp}"`)

    // ── Estrategia 5: sin apóstrofe ────────────────────────────────────────
    if (!card && noAp !== withAp) {
      if (rawNum && setFrag)
        card = await apiSearch(`name:"${noAp}" number:${rawNum} set.name:"${setFrag}"`)
      if (!card && rawNum)
        card = await apiSearch(`name:"${noAp}" number:${rawNum}`)
      if (!card)
        card = await apiSearch(`name:"${noAp}"`)
    }

    // ── Estrategia 6: sin prefijo de entrenador ────────────────────────────
    if (!card && trainer && trainer !== withAp) {
      if (rawNum && setFrag)
        card = await apiSearch(`name:"${trainer}" number:${rawNum} set.name:"${setFrag}"`)
      if (!card && rawNum)
        card = await apiSearch(`name:"${trainer}" number:${rawNum}`)
      if (!card)
        card = await apiSearch(`name:"${trainer}"`)
    }

    // ── Estrategia 7: nombre sin comillas + set (máximo tolerante) ─────────
    if (!card && setFrag)
      card = await apiSearch(`name:${noAp} set.name:"${setFrag}"`)
    if (!card && rawNum)
      card = await apiSearch(`name:${noAp} number:${rawNum}`)
    if (!card)
      card = await apiSearch(`name:${noAp}`)

    const result = toResult(card)
    _cache.set(key, result)
    return result

  } catch (err) {
    console.warn('[pokemonTcg] error buscando', nombre, err?.message)
    _cache.set(key, null)
    return null
  }
}
