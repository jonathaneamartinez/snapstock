#!/usr/bin/env node
/**
 * bulk-import-catalog.mjs
 * ──────────────────────────────────────────────────────────────────────────
 * Importa TODAS las cartas (EN + JP + CN) al stock de Jonat/Kardia.
 *
 * Fuentes:
 *   EN → pokemontcg.io API (173 sets, ~17.000 cartas)
 *   JP → Railway /catalog?lang=jp  (226 sets, desde R2)
 *   CN → Railway /catalog?lang=cn  (21 sets, desde R2)
 *
 * Flujo por set:
 *   1. Fetch cartas desde la API correspondiente
 *   2. Query Supabase → cartas ya existentes (para no duplicar)
 *   3. Inserta las nuevas en `cards` con ON CONFLICT DO NOTHING
 *   4. Re-query para obtener TODOS los IDs del set (nuevos + ya existentes)
 *   5. Query inventory → entradas ya existentes para este store
 *   6. Inserta las faltantes en `inventory` (quantity = 0)
 *
 * Es IDEMPOTENTE: se puede correr varias veces sin duplicar datos.
 *
 * Uso:
 *   node scripts/bulk-import-catalog.mjs            # EN + JP + CN
 *   node scripts/bulk-import-catalog.mjs --dry-run
 *   node scripts/bulk-import-catalog.mjs --lang=jp
 *   node scripts/bulk-import-catalog.mjs --lang=cn
 *   node scripts/bulk-import-catalog.mjs --lang=jp --desde=ancient-roar
 * ──────────────────────────────────────────────────────────────────────────
 */

// ── Configuración ──────────────────────────────────────────────────────────
const SUPABASE_URL   = 'https://psdadbxlwkjgcisviimo.supabase.co'
const SUPABASE_KEY   = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBzZGFkYnhsd2tqZ2Npc3ZpaW1vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY4OTgyNTQsImV4cCI6MjA5MjQ3NDI1NH0.jO9y--DsTRkpGz07j--UdoJXm_B9J6rV7W-NOX_i4Ls'
const JONAT_STORE_ID = '9bd85bd6-1b22-42e6-a070-862b63f37820'
const TCG_BASE       = 'https://api.pokemontcg.io/v2'
const SCANNER_BASE   = 'https://stock-tcg-production.up.railway.app'

const DRY_RUN   = process.argv.includes('--dry-run')
const LANG_ARG  = process.argv.find(a => a.startsWith('--lang='))?.split('=')[1] ?? null
const DESDE     = process.argv.find(a => a.startsWith('--desde='))?.split('=')[1] ?? null
const DELAY_SET = 400   // ms entre sets
const DELAY_REQ = 150   // ms entre requests de paginación

const LANGS_TO_RUN = LANG_ARG ? [LANG_ARG] : ['en', 'jp', 'cn']

// ── Helpers ────────────────────────────────────────────────────────────────
const sleep = ms => new Promise(r => setTimeout(r, ms))

async function supFetch(path, opts = {}) {
  const url = `${SUPABASE_URL}/rest/v1${path}`
  const res  = await fetch(url, {
    ...opts,
    headers: {
      apikey:         SUPABASE_KEY,
      Authorization:  `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      ...opts.headers,
    },
  })
  return res
}

// ── pokemontcg.io (EN) ─────────────────────────────────────────────────────

async function fetchAllSetsEN() {
  const res  = await fetch(`${TCG_BASE}/sets?pageSize=250&orderBy=releaseDate`)
  const json = await res.json()
  return (json.data ?? []).map(s => ({ id: s.id, name: s.name, lang: 'en' }))
}

async function fetchCardsEN(setId) {
  let page = 1, all = []
  while (true) {
    const params = new URLSearchParams({
      q:        `set.id:${setId}`,
      pageSize: '250',
      page:     String(page),
      orderBy:  'number',
    })
    let res
    for (let attempt = 0; attempt < 3; attempt++) {
      res = await fetch(`${TCG_BASE}/cards?${params}`)
      if (res.status !== 429) break
      console.warn(`    ⏳ Rate-limit pokemontcg.io — esperando 5s...`)
      await sleep(5000)
    }
    if (!res.ok) { console.warn(`    ✗ TCG API error ${res.status}`); break }
    const json  = await res.json()
    const batch = json.data ?? []
    all = [...all, ...batch]
    if (all.length >= (json.totalCount ?? 0) || batch.length === 0) break
    page++
    await sleep(DELAY_REQ)
  }
  return all.map(c => ({
    name:      c.name,
    set_name:  c.set?.name || null,
    set_id:    c.set?.id   || null,
    number:    c.number    || null,
    lang:      'en',
    image_url: c.images?.small || c.images?.large || null,
  }))
}

// ── Railway scanner (JP / CN) ──────────────────────────────────────────────

async function fetchAllSetsLang(lang) {
  try {
    const res  = await fetch(`${SCANNER_BASE}/available-sets?lang=${lang}`)
    const json = await res.json()
    return (json.sets ?? []).map(s => ({ id: s.id, name: s.name, lang }))
  } catch (e) {
    console.warn(`  ⚠ No se pudieron obtener sets ${lang}: ${e.message}`)
    return []
  }
}

async function fetchCardsLang(setId, lang) {
  for (const url of [
    `${SCANNER_BASE}/catalog?lang=${lang}&set_id=${encodeURIComponent(setId)}`,
    `${SCANNER_BASE}/scanner/search?q=&idioma=${lang}&set_id=${encodeURIComponent(setId)}&limit=500`,
  ]) {
    try {
      const res = await fetch(url)
      if (!res.ok) continue
      const json = await res.json()
      const raw = json.results ?? []
      if (raw.length === 0 && url.includes('/catalog')) continue
      return raw.map(c => ({
        name:      c.nombre   || c.name      || null,
        set_name:  c.set_name || c.set       || null,
        set_id:    c.set_code || c.set_id    || setId,
        number:    String(c.numero || c.number || ''),
        lang,
        image_url: c.imagen   || c.image_url || null,
      }))
    } catch (_) {}
  }
  return []
}

// ── Supabase: cards ────────────────────────────────────────────────────────

/**
 * Trae todos los IDs de cartas en Supabase para este set + idioma.
 * Clave del map: "name|card_number"
 */
async function getAllCardIds(setName, lang) {
  const encoded = encodeURIComponent(setName)
  let page = 0, all = new Map()
  // paginar de 1000 en 1000 (sets grandes pueden tener >1000 entradas con variantes)
  while (true) {
    const from = page * 1000
    const to   = from + 999
    const res = await supFetch(
      `/cards?select=id,name,card_number&set_name=eq.${encoded}&language=eq.${lang}&limit=1000&offset=${from}`,
      { headers: { 'Range-Unit': 'items', Range: `${from}-${to}` } }
    )
    if (!res.ok) break
    const rows = await res.json()
    if (!Array.isArray(rows) || rows.length === 0) break
    for (const r of rows) all.set(`${r.name}|${r.card_number ?? ''}`, r.id)
    if (rows.length < 1000) break
    page++
  }
  return all
}

/**
 * Inserta en batch las cartas nuevas con ON CONFLICT DO NOTHING.
 * Devuelve [{ id }] de las cartas efectivamente insertadas.
 */
async function insertCards(cards) {
  if (DRY_RUN || cards.length === 0) return []
  const rows = cards.map(c => ({
    name:        c.name,
    set_name:    c.set_name || null,
    card_number: c.number   || null,
    language:    c.lang,
    image_url:   c.image_url || null,
  }))
  // on_conflict lista las columnas del unique index (incluyendo variant para cubrir el default)
  const res = await supFetch(
    '/cards?on_conflict=name,set_name,card_number,language,variant&select=id',
    {
      method:  'POST',
      headers: { Prefer: 'return=representation,resolution=ignore-duplicates' },
      body:    JSON.stringify(rows),
    }
  )
  if (!res.ok) {
    const txt = await res.text()
    console.warn(`    ⚠ insertCards error: ${txt}`)
    return []
  }
  return await res.json() // [{ id }] — solo las recién insertadas
}

// ── Supabase: inventory ────────────────────────────────────────────────────

async function getExistingInventory(cardIds) {
  if (cardIds.length === 0) return new Set()
  // Supabase tiene límite en la longitud de la URL — paginar de 500 en 500
  const existing = new Set()
  for (let i = 0; i < cardIds.length; i += 500) {
    const chunk   = cardIds.slice(i, i + 500)
    const inParam = encodeURIComponent(`(${chunk.join(',')})`)
    const res = await supFetch(
      `/inventory?select=card_id&store_id=eq.${JONAT_STORE_ID}&card_id=in.${inParam}&limit=500`
    )
    if (!res.ok) continue
    const rows = await res.json()
    for (const r of rows) existing.add(r.card_id)
  }
  return existing
}

async function insertInventory(cardIds) {
  if (DRY_RUN || cardIds.length === 0) return
  // Insertar en chunks de 500 para no superar límites de Railway/Supabase
  for (let i = 0; i < cardIds.length; i += 500) {
    const chunk = cardIds.slice(i, i + 500)
    const rows  = chunk.map(cardId => ({
      store_id:  JONAT_STORE_ID,
      card_id:   cardId,
      quantity:  0,
      condicion: 'NM',
      condition: 'NM',
      status:    'disponible',
      estado:    'disponible',
      scan_date: new Date().toISOString(),
    }))
    const res = await supFetch('/inventory', {
      method:  'POST',
      headers: { Prefer: 'return=minimal' },
      body:    JSON.stringify(rows),
    })
    if (!res.ok) {
      console.warn(`    ⚠ insertInventory error: ${await res.text()}`)
    }
  }
}

// ── Procesar un set ────────────────────────────────────────────────────────

async function processSet(set, cards) {
  try {
    if (cards.length === 0) { console.log('sin cartas'); return { sets: 0, cartas: 0 } }

    // 1. Cartas ya existentes en Supabase (para saber cuáles son nuevas)
    const existingBefore = await getAllCardIds(set.name, set.lang)

    // 2. Filtrar solo las nuevas (no en Supabase)
    const newCards = cards.filter(c => !existingBefore.has(`${c.name}|${c.number ?? ''}`))

    // 3. Insertar nuevas con ON CONFLICT DO NOTHING
    await insertCards(newCards)

    // 4. Re-query para obtener TODOS los IDs actualizados (nuevas + preexistentes)
    //    Solo si hay nuevas, para ahorrar un request cuando ya todo existe
    let allCardIds
    if (newCards.length > 0) {
      const existingAfter = await getAllCardIds(set.name, set.lang)
      allCardIds = [...existingAfter.values()]
    } else {
      allCardIds = [...existingBefore.values()]
    }

    // 5. Inventory: ver cuáles ya tienen entrada
    const existingInv = await getExistingInventory(allCardIds)
    const missingInv  = allCardIds.filter(id => !existingInv.has(id))

    // 6. Insertar las que faltan en inventory
    await insertInventory(missingInv)

    const detail = DRY_RUN
      ? `${cards.length} cartas (dry-run)`
      : `${cards.length} cartas (${newCards.length} nuevas, ${missingInv.length} inv nuevas)`
    console.log(`✓ ${detail}`)

    return { sets: 1, cartas: allCardIds.length }
  } catch (err) {
    console.log(`✗ ERROR: ${err.message}`)
    return { sets: 0, cartas: 0 }
  }
}

// ── Correr un idioma completo ──────────────────────────────────────────────

async function runLang(lang) {
  console.log('')
  console.log(`${'─'.repeat(56)}`)
  console.log(`🌐 Idioma: ${lang.toUpperCase()}`)
  console.log(`${'─'.repeat(56)}`)

  let sets
  if (lang === 'en') {
    sets = await fetchAllSetsEN()
  } else {
    sets = await fetchAllSetsLang(lang)
  }

  if (sets.length === 0) {
    console.log(`  (sin sets disponibles para ${lang})`)
    return
  }

  let skipMode    = !!DESDE
  let skippedSets = 0
  let totalCartas = 0, totalSets = 0

  console.log(`📦 ${sets.length} sets encontrados\n`)

  for (let si = 0; si < sets.length; si++) {
    const set = sets[si]

    if (skipMode) {
      if (set.id === DESDE) skipMode = false
      else { skippedSets++; continue }
    }

    const idx    = si + 1 - skippedSets
    const total  = sets.length - skippedSets
    process.stdout.write(`  [${idx}/${total}] ${set.name} (${set.id}) — `)

    let cards
    if (lang === 'en') {
      cards = await fetchCardsEN(set.id)
    } else {
      cards = await fetchCardsLang(set.id, lang)
    }

    const result = await processSet(set, cards)
    totalSets   += result.sets
    totalCartas += result.cartas

    await sleep(DELAY_SET)
  }

  console.log('')
  console.log(`  ✅ ${lang.toUpperCase()}: ${totalCartas} cartas en ${totalSets} sets`)
}

// ── Main ───────────────────────────────────────────────────────────────────
async function main() {
  console.log('')
  console.log('╔══════════════════════════════════════════════════════╗')
  console.log('║   Bulk Import Catalog EN+JP+CN — Kardia (Jonat)      ║')
  console.log('╚══════════════════════════════════════════════════════╝')
  if (DRY_RUN)  console.log('⚠  DRY-RUN activado — no se escribe en Supabase\n')
  if (LANG_ARG) console.log(`🌐 Solo idioma: ${LANG_ARG.toUpperCase()}`)
  if (DESDE)    console.log(`⏩  Retomando desde set: ${DESDE}`)

  for (const lang of LANGS_TO_RUN) {
    await runLang(lang)
  }

  console.log('')
  console.log('═'.repeat(56))
  console.log(`✅ Importación completa — idiomas: ${LANGS_TO_RUN.join(', ')}`)
  if (DRY_RUN) console.log('   (dry-run: nada fue escrito en Supabase)')
  console.log('')
}

main().catch(err => {
  console.error('Error fatal:', err)
  process.exit(1)
})
