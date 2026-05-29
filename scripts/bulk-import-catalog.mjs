#!/usr/bin/env node
/**
 * bulk-import-catalog.mjs
 * ──────────────────────────────────────────────────────────────────────────
 * Importa TODAS las cartas EN de pokemontcg.io al stock de Jonat/Kardia.
 *
 * Flujo por set:
 *   1. Fetch cartas desde pokemontcg.io (250 por página)
 *   2. Query Supabase → cartas ya existentes de ese set (para no duplicar)
 *   3. Inserta las nuevas en `cards`
 *   4. Junta IDs existentes + nuevos
 *   5. Query inventory → entradas ya existentes para este store
 *   6. Inserta las faltantes en `inventory` (quantity = 0)
 *
 * Es IDEMPOTENTE: se puede correr varias veces sin duplicar datos.
 *
 * Uso:
 *   node scripts/bulk-import-catalog.mjs
 *   node scripts/bulk-import-catalog.mjs --dry-run   (sin escribir a Supabase)
 *   node scripts/bulk-import-catalog.mjs --desde sv8 (retomar desde un setId)
 * ──────────────────────────────────────────────────────────────────────────
 */

// ── Configuración ──────────────────────────────────────────────────────────
const SUPABASE_URL   = 'https://psdadbxlwkjgcisviimo.supabase.co'
const SUPABASE_KEY   = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBzZGFkYnhsd2tqZ2Npc3ZpaW1vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY4OTgyNTQsImV4cCI6MjA5MjQ3NDI1NH0.jO9y--DsTRkpGz07j--UdoJXm_B9J6rV7W-NOX_i4Ls'
const JONAT_STORE_ID = '9bd85bd6-1b22-42e6-a070-862b63f37820'
const TCG_BASE       = 'https://api.pokemontcg.io/v2'

const DRY_RUN  = process.argv.includes('--dry-run')
const DESDE    = process.argv.find(a => a.startsWith('--desde='))?.split('=')[1] ?? null
const DELAY_SET = 400   // ms entre sets  (evita rate-limit pokemontcg.io)
const DELAY_REQ = 150   // ms entre requests de paginación

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

// ── pokemontcg.io ──────────────────────────────────────────────────────────

async function fetchAllSets() {
  const res  = await fetch(`${TCG_BASE}/sets?pageSize=250&orderBy=releaseDate`)
  const json = await res.json()
  return json.data ?? []
}

async function fetchCardsForSet(setId) {
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
  return all
}

// ── Supabase: cards ────────────────────────────────────────────────────────

/** Trae los IDs de cartas EN que ya existen en Supabase para este set */
async function getExistingCards(setName) {
  const encoded = encodeURIComponent(setName)
  const res = await supFetch(
    `/cards?select=id,name,card_number&set_name=eq.${encoded}&language=eq.en&limit=1000`
  )
  if (!res.ok) return new Map()
  const rows = await res.json()
  // key: "name|card_number"
  return new Map(rows.map(r => [`${r.name}|${r.card_number ?? ''}`, r.id]))
}

/** Inserta en batch las cartas nuevas, devuelve [{ id }] */
async function insertCards(cards) {
  if (DRY_RUN || cards.length === 0) return []
  const rows = cards.map(c => ({
    name:        c.name,
    set_name:    c.set?.name    || null,
    card_number: c.number       || null,
    language:    'en',
    image_url:   c.images?.small || c.images?.large || null,
  }))
  const res = await supFetch('/cards?select=id', {
    method:  'POST',
    headers: { Prefer: 'return=representation' },
    body:    JSON.stringify(rows),
  })
  if (!res.ok) {
    console.warn(`    ⚠ insertCards error: ${await res.text()}`)
    return []
  }
  return await res.json() // [{ id }]
}

// ── Supabase: inventory ────────────────────────────────────────────────────

/** Trae los card_ids que ya tienen entrada en inventory para este store */
async function getExistingInventory(cardIds) {
  if (cardIds.length === 0) return new Set()
  // Supabase REST: in filter
  const inParam = encodeURIComponent(`(${cardIds.join(',')})`)
  const res = await supFetch(
    `/inventory?select=card_id&store_id=eq.${JONAT_STORE_ID}&card_id=in.${inParam}&limit=5000`
  )
  if (!res.ok) return new Set()
  const rows = await res.json()
  return new Set(rows.map(r => r.card_id))
}

/** Inserta entradas de inventory con quantity=0 */
async function insertInventory(cardIds) {
  if (DRY_RUN || cardIds.length === 0) return
  const rows = cardIds.map(cardId => ({
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

// ── Main ───────────────────────────────────────────────────────────────────
async function main() {
  console.log('')
  console.log('╔══════════════════════════════════════════════════════╗')
  console.log('║   Bulk Import Catalog — Kardia (Jonat)               ║')
  console.log('╚══════════════════════════════════════════════════════╝')
  if (DRY_RUN) console.log('⚠  DRY-RUN activado — no se escribe en Supabase\n')
  if (DESDE)   console.log(`⏩  Retomando desde set: ${DESDE}\n`)

  const sets = await fetchAllSets()
  console.log(`📦 ${sets.length} sets encontrados\n`)

  let totalCartas = 0, totalSets = 0, skippedSets = 0
  let skipMode = !!DESDE

  for (let si = 0; si < sets.length; si++) {
    const set = sets[si]

    // --desde: saltar hasta encontrar el set indicado
    if (skipMode) {
      if (set.id === DESDE) skipMode = false
      else { skippedSets++; continue }
    }

    const prefix = `  [${si + 1 - skippedSets}/${sets.length - skippedSets}]`
    process.stdout.write(`${prefix} ${set.name} (${set.id}) — `)

    try {
      // 1. Cartas desde TCG API
      const tcgCards = await fetchCardsForSet(set.id)
      if (tcgCards.length === 0) { console.log('sin cartas'); continue }

      // 2. Cartas que ya existen en Supabase para este set
      const existing = await getExistingCards(set.name)

      // 3. Filtrar solo las nuevas
      const newTcg = tcgCards.filter(c => !existing.has(`${c.name}|${c.number ?? ''}`))

      // 4. Insertar nuevas → obtener IDs
      const inserted = await insertCards(newTcg)
      const newIds   = inserted.map(r => r.id)

      // 5. Combinar todos los IDs (existentes + nuevos)
      const allIds = [...existing.values(), ...newIds]

      // 6. Inventory: ver cuáles ya tienen entrada
      const existingInv = await getExistingInventory(allIds)
      const missingInv  = allIds.filter(id => !existingInv.has(id))

      // 7. Insertar las que faltan en inventory
      await insertInventory(missingInv)

      totalCartas += allIds.length
      totalSets++

      const detail = DRY_RUN
        ? `${tcgCards.length} cartas (dry-run)`
        : `${tcgCards.length} cartas (${newTcg.length} nuevas, ${missingInv.length} inv nuevas)`
      console.log(`✓ ${detail}`)

    } catch (err) {
      console.log(`✗ ERROR: ${err.message}`)
    }

    await sleep(DELAY_SET)
  }

  console.log('')
  console.log('─'.repeat(56))
  console.log(`✅ Listo: ${totalCartas} cartas en ${totalSets} sets`)
  if (DRY_RUN) console.log('   (dry-run: nada fue escrito en Supabase)')
  console.log('')
}

main().catch(err => {
  console.error('Error fatal:', err)
  process.exit(1)
})
