/**
 * populate-images.mjs
 * ─────────────────────────────────────────────────────────────────────
 * Busca en PokémonTCG API la imagen de cada carta que tenga image_url
 * NULL o vacío en la tabla `cards`, y la guarda en Supabase.
 *
 * Una vez guardada, la app carga la imagen directamente desde la DB
 * sin depender del fetch on-demand (que puede fallar por rate-limit).
 *
 * Uso:
 *   node scripts/populate-images.mjs
 * ─────────────────────────────────────────────────────────────────────
 */

const SUPABASE_URL = 'https://psdadbxlwkjgcisviimo.supabase.co'
const ANON_KEY     = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBzZGFkYnhsd2tqZ2Npc3ZpaW1vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY4OTgyNTQsImV4cCI6MjA5MjQ3NDI1NH0.jO9y--DsTRkpGz07j--UdoJXm_B9J6rV7W-NOX_i4Ls'
const TCG_BASE     = 'https://api.pokemontcg.io/v2'

const headers = {
  apikey:        ANON_KEY,
  Authorization: `Bearer ${ANON_KEY}`,
}

// ── Helpers ────────────────────────────────────────────────────────────

function cleanName(n) {
  if (!n) return ''
  return n
    .replace(/\s*\[[^\]]*\]/g, '')       // quita [Reverse Holo], [Energy]…
    .replace(/\s*#[A-Za-z0-9]+\s*$/, '') // quita #70 al final
    .replace(/"/g, '')
    .replace(/\s+/g, ' ')
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

function noApostrophe(s) { return s.replace(/'/g, '').replace(/\s+/g, ' ').trim() }

async function tcgSearch(q) {
  const url = `${TCG_BASE}/cards?q=${encodeURIComponent(q)}&pageSize=1`
  const res  = await fetch(url)
  if (!res.ok) return null
  const json = await res.json()
  return json.data?.[0] ?? null
}

async function findCard(name, number, setName) {
  const n   = cleanName(name)
  const num = cleanNumber(number)
  const set = setFragment(setName)
  const noAp = noApostrophe(n)

  let card = null

  if (n && num && set)  card = await tcgSearch(`name:"${n}" number:${num} set.name:"${set}"`)
  if (!card && n && num) card = await tcgSearch(`name:"${n}" number:${num}`)
  if (!card && n && set) card = await tcgSearch(`name:"${n}" set.name:"${set}"`)
  if (!card && n)        card = await tcgSearch(`name:"${n}"`)
  if (!card && noAp !== n) {
    if (num && set) card = await tcgSearch(`name:"${noAp}" number:${num} set.name:"${set}"`)
    if (!card && num) card = await tcgSearch(`name:"${noAp}" number:${num}`)
    if (!card)        card = await tcgSearch(`name:"${noAp}"`)
  }
  // Último recurso sin comillas
  if (!card && n) card = await tcgSearch(`name:${noAp}`)

  return card
}

// ── Fetch cartas sin imagen ────────────────────────────────────────────

async function fetchCardsMissingImage() {
  const url = `${SUPABASE_URL}/rest/v1/cards`
    + `?select=id,name,set_name,card_number`
    + `&image_url=is.null`
    + `&order=name.asc`
    + `&limit=2000`
  const res  = await fetch(url, { headers })
  const data = await res.json()
  return Array.isArray(data) ? data : []
}

// ── PATCH image_url ────────────────────────────────────────────────────

async function patchCard(id, imageUrl) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/cards?id=eq.${id}`,
    {
      method:  'PATCH',
      headers: { ...headers, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ image_url: imageUrl }),
    }
  )
  return res.ok
}

// ── Main ───────────────────────────────────────────────────────────────

console.log('\n🖼️  Buscando cartas sin imagen en Supabase...\n')
const cards = await fetchCardsMissingImage()
console.log(`   ${cards.length} cartas sin image_url\n`)

if (cards.length === 0) {
  console.log('✅  Todas las cartas ya tienen imagen guardada.\n')
  process.exit(0)
}

console.log('─'.repeat(80))

let saved = 0, notFound = 0, errors = 0

for (let i = 0; i < cards.length; i++) {
  const c   = cards[i]
  const idx = String(i + 1).padStart(4)
  const label = `${c.name}${c.set_name ? ` · ${c.set_name}` : ''}`
  process.stdout.write(`${idx}  ${label.slice(0, 45).padEnd(45)}  `)

  const card = await findCard(c.name, c.card_number, c.set_name)
  const imageUrl = card?.images?.large || card?.images?.small || null

  if (!imageUrl) {
    console.log('❌  no encontrada')
    notFound++
  } else {
    const ok = await patchCard(c.id, imageUrl)
    if (ok) {
      console.log(`✅  ${imageUrl.split('/').slice(-2).join('/')}`)
      saved++
    } else {
      console.log('⚠️   error al guardar')
      errors++
    }
  }

  // Pausa breve para no saturar la API
  await new Promise(r => setTimeout(r, 250))
}

console.log('─'.repeat(80))
console.log(`\n✅  ${saved} imágenes guardadas   ❌  ${notFound} no encontradas   ⚠️  ${errors} errores\n`)
