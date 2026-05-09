/**
 * revalidar-todos.mjs
 * Actualiza el precio USD de TODAS las cartas del inventario disponible.
 * Consulta la API de PokémonTCG y escribe en Supabase.
 *
 * node scripts/revalidar-todos.mjs
 */

const SUPABASE_URL = 'https://psdadbxlwkjgcisviimo.supabase.co'
const ANON_KEY     = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBzZGFkYnhsd2tqZ2Npc3ZpaW1vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY4OTgyNTQsImV4cCI6MjA5MjQ3NDI1NH0.jO9y--DsTRkpGz07j--UdoJXm_B9J6rV7W-NOX_i4Ls'
const STORE_ID     = 'd0ccc053-bc2f-4d84-bb04-3e8222404172'
const TCG_BASE     = 'https://api.pokemontcg.io/v2'
const BLUE         = 1400
const OFICIAL      = 1100

// ── Helpers ────────────────────────────────────────────────────────────
function extractPrice(card) {
  const p = card?.tcgplayer?.prices
  if (!p) return null
  const grades = [
    'holofoil', 'normal', 'reverseHolofoil',
    '1stEditionHolofoil', 'unlimitedHolofoil',
    'unlimited', '1stEdition', '1stEditionNormal',
  ]
  for (const g of grades) {
    const v = p[g]?.market ?? p[g]?.mid ?? p[g]?.low
    if (v != null && v > 0) return +v.toFixed(2)
  }
  return null
}

function cleanName(n) {
  if (!n) return ''
  return n
    .replace(/\s*\[[^\]]*\]/g, '')   // quita [Reverse Holo], [Master Ball]…
    .replace(/\s*#[A-Za-z0-9]+\s*$/, '') // quita #70 al final
    .replace(/"/g, '')
    .replace(/\.0+$/, '')
    .trim()
}

function cleanNumber(n) {
  if (!n) return ''
  return String(n).replace(/\.0+$/, '').trim()
}

function setFragment(s) {
  if (!s) return null
  return s.replace(/^(Pokemon|Pokémon)\s+/i, '').replace(/['"]/g, '').trim().slice(0, 40)
}

async function tcgSearch(q) {
  const url = `${TCG_BASE}/cards?q=${encodeURIComponent(q)}&pageSize=1`
  const res  = await fetch(url)
  if (!res.ok) return null
  const json = await res.json()
  return json.data?.[0] ?? null
}

async function findPrice(name, number, setName) {
  const n   = cleanName(name)
  const num = cleanNumber(number)
  const set = setFragment(setName)

  let card = null

  if (n && num && set)  card = await tcgSearch(`name:"${n}" number:${num} set.name:"${set}"`)
  if (!card && n && num) card = await tcgSearch(`name:"${n}" number:${num}`)
  if (!card && n && set) card = await tcgSearch(`name:"${n}" set.name:"${set}"`)
  if (!card && n)        card = await tcgSearch(`name:"${n}"`)

  // Sin apóstrofe
  const noAp = n.replace(/'/g, '')
  if (!card && noAp !== n) {
    if (num && set) card = await tcgSearch(`name:"${noAp}" number:${num} set.name:"${set}"`)
    if (!card && num) card = await tcgSearch(`name:"${noAp}" number:${num}`)
    if (!card)        card = await tcgSearch(`name:"${noAp}"`)
  }

  return extractPrice(card)
}

// ── Fetch paginado de TODO el inventario ────────────────────────────────
async function fetchAllInventory() {
  const headers = {
    apikey: ANON_KEY,
    Authorization: `Bearer ${ANON_KEY}`,
  }
  let all = [], from = 0
  const pageSize = 1000
  while (true) {
    const url = `${SUPABASE_URL}/rest/v1/inventory`
      + `?select=id,price_usd,cards(name,set_name,card_number)`
      + `&store_id=eq.${STORE_ID}&status=eq.disponible`
      + `&order=id.desc`
      + `&offset=${from}&limit=${pageSize}`
    const res  = await fetch(url, { headers })
    const data = await res.json()
    if (!Array.isArray(data) || data.length === 0) break
    all.push(...data)
    if (data.length < pageSize) break
    from += pageSize
  }
  return all
}

// ── PATCH un item ───────────────────────────────────────────────────────
async function patchItem(id, price) {
  const arsBlue = Math.round(price * BLUE)
  const arsOfic = Math.round(price * OFICIAL)
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/inventory?id=eq.${id}`,
    {
      method:  'PATCH',
      headers: {
        apikey:         ANON_KEY,
        Authorization:  `Bearer ${ANON_KEY}`,
        'Content-Type': 'application/json',
        Prefer:         'return=minimal',
      },
      body: JSON.stringify({ price_usd: price, price_ars_blue: arsBlue, price_ars_oficial: arsOfic }),
    }
  )
  return res.ok
}

// ── Main ────────────────────────────────────────────────────────────────
console.log('\n📦 Cargando inventario desde Supabase…')
const items = await fetchAllInventory()
console.log(`   ${items.length} cartas encontradas\n`)
console.log('─'.repeat(90))

let updated = 0, noPrice = 0, errors = 0

for (let i = 0; i < items.length; i++) {
  const item = items[i]
  const card = item.cards
  const idx  = String(i + 1).padStart(4)

  if (!card?.name) {
    console.log(`${idx}  [sin datos de carta]   ⚠️  omitida`)
    noPrice++
    continue
  }

  const label = `${card.name}${card.set_name ? ` · ${card.set_name}` : ''}`
  process.stdout.write(`${idx}  ${label.slice(0, 48).padEnd(48)}  `)

  const price = await findPrice(card.name, card.card_number, card.set_name)

  if (price == null) {
    console.log(`❌  sin precio  (actual $${item.price_usd ?? '—'})`)
    noPrice++
  } else {
    const ok = await patchItem(item.id, price)
    const arrow = item.price_usd != null && Math.abs(item.price_usd - price) > 0.01
      ? ` (antes $${item.price_usd})`
      : ''
    if (ok) {
      console.log(`✅  $${String(price).padEnd(8)} → ARS $${Math.round(price * BLUE).toLocaleString()}${arrow}`)
      updated++
    } else {
      console.log(`⚠️   error al guardar`)
      errors++
    }
  }

  // Pausa breve para no saturar la API
  await new Promise(r => setTimeout(r, 200))
}

console.log('─'.repeat(90))
console.log(`\n✅  ${updated} actualizadas   ❌  ${noPrice} sin precio   ⚠️  ${errors} errores`)
console.log(`    Dólar blue usado: $${BLUE} · Oficial: $${OFICIAL}\n`)
