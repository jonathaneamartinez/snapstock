/**
 * fix-prices.mjs
 * Busca precio de mercado en PokémonTCG API para las 11 primeras cartas
 * del inventario y los actualiza en Supabase.
 *
 * Ejecutar: node scripts/fix-prices.mjs
 */

const SUPABASE_URL = 'https://psdadbxlwkjgcisviimo.supabase.co'
const ANON_KEY     = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBzZGFkYnhsd2tqZ2Npc3ZpaW1vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY4OTgyNTQsImV4cCI6MjA5MjQ3NDI1NH0.jO9y--DsTRkpGz07j--UdoJXm_B9J6rV7W-NOX_i4Ls'
const TCG_BASE     = 'https://api.pokemontcg.io/v2'
const BLUE         = 1400   // dólar blue aproximado — ajustar si es necesario
const OFICIAL      = 1100   // dólar oficial aproximado

// ── Solo las 3 cartas WotC que fallaron (precios encontrados manualmente) ──
// Night Stretcher: sin precio en TCGplayer (set nuevo) — se omite
const ITEMS = [
  // base2-62: unlimited market $0.40 · 1ªEd market $3.16
  { id: '003faa61-3501-4640-861e-710a21f75fc5', name: 'Spearow',      set_name: 'Jungle',        number: '62', prev: 1.49,
    forcedPrice: 0.40 },   // unlimited; si es 1ªEd el precio sería $3.16

  // base2-60: unlimited market $5.93 · 1ªEd market $27.24
  { id: '00414fc9-a298-49a1-88ae-2ded0bf34ecf', name: 'Pikachu',      set_name: 'Jungle',        number: '60', prev: 15.00,
    forcedPrice: 5.93 },   // unlimited; si es 1ªEd el precio sería $27.24

  // gym2-78: unlimited market $1.13 · 1ªEd market $3.70
  { id: '002538b3-27d7-413e-b5fa-0897b86ce686', name: "Koga's Grimer", set_name: 'Gym Challenge', number: '78', prev: 2.00,
    forcedPrice: 1.13 },   // unlimited; si es 1ªEd el precio sería $3.70
]

// ── Helpers ───────────────────────────────────────────────────────────
function extractPrice(card) {
  const p = card?.tcgplayer?.prices
  if (!p) return null
  const grades = ['holofoil','normal','reverseHolofoil','1stEditionHolofoil','unlimitedHolofoil']
  for (const g of grades) {
    const v = p[g]?.market ?? p[g]?.mid ?? p[g]?.low
    if (v != null && v > 0) return +v.toFixed(2)
  }
  return null
}

async function tcgSearch(q) {
  const url = `${TCG_BASE}/cards?q=${encodeURIComponent(q)}&pageSize=1`
  const res  = await fetch(url)
  if (!res.ok) return null
  const json = await res.json()
  return json.data?.[0] ?? null
}

async function fetchPrice(item) {
  const n   = item.name.replace(/"/g,'').trim()
  const num = item.number
  const set = item.set_name

  let card = null

  // Estrategia 1: nombre + número + set
  if (n && num && set)
    card = await tcgSearch(`name:"${n}" number:${num} set.name:"${set}"`)

  // Estrategia 2: nombre + número (sin set)
  if (!card && n && num)
    card = await tcgSearch(`name:"${n}" number:${num}`)

  // Estrategia 3: nombre + set (sin número)
  if (!card && n && set)
    card = await tcgSearch(`name:"${n}" set.name:"${set}"`)

  // Estrategia 4: nombre solo
  if (!card && n)
    card = await tcgSearch(`name:"${n}"`)

  return { price: extractPrice(card), card }
}

// ── Main ──────────────────────────────────────────────────────────────
const headers = {
  'apikey':        ANON_KEY,
  'Authorization': `Bearer ${ANON_KEY}`,
  'Content-Type':  'application/json',
  'Prefer':        'return=minimal',
}

console.log('\n🔍 Buscando precios en PokémonTCG API...\n')
console.log('─'.repeat(80))

let updated = 0, noPrice = 0

for (const item of ITEMS) {
  process.stdout.write(`  ${item.name.padEnd(28)} `)

  let price = item.forcedPrice ?? null
  let card  = null

  if (!price) {
    const result = await fetchPrice(item)
    price = result.price
    card  = result.card
  }

  if (price == null) {
    console.log(`❌  sin precio    (anterior: $${item.prev})`)
    noPrice++
    continue
  }

  const arsBlue = Math.round(price * BLUE)
  const arsOfic = Math.round(price * OFICIAL)

  // Actualizar en Supabase
  const patchUrl = `${SUPABASE_URL}/rest/v1/inventory?id=eq.${item.id}`
  const res = await fetch(patchUrl, {
    method:  'PATCH',
    headers,
    body: JSON.stringify({
      price_usd:         price,
      price_ars_blue:    arsBlue,
      price_ars_oficial: arsOfic,
    }),
  })

  const arrow  = price !== item.prev ? ' ←' : ''
  const status = res.ok ? '✅' : '⚠️ '
  console.log(`${status}  $${String(item.prev).padEnd(7)} → $${String(price).padEnd(7)}  ARS $${arsBlue.toLocaleString()}${arrow}  [${card?.set?.name ?? '?'} #${card?.number ?? '?'}]`)

  if (res.ok) updated++

  // Pequeña pausa para no saturar la API
  await new Promise(r => setTimeout(r, 250))
}

console.log('─'.repeat(80))
console.log(`\n✅  ${updated} actualizadas   ❌  ${noPrice} sin precio\n`)
