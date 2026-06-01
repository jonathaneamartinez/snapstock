#!/usr/bin/env node
/**
 * migrate-en-images-to-r2.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Actualiza image_url de las cartas EN en Supabase:
 *   pokemontcg.io (externo) → R2 propio (Railway)
 *
 * El backend Railway expone /card-image-url que busca en el pHash index
 * la URL de R2 para cualquier carta. Este script lo consulta en paralelo
 * para todas las cartas EN y escribe los resultados en batch a Supabase.
 *
 * Es IDEMPOTENTE: puede correrse varias veces sin problema.
 *
 * Uso:
 *   node scripts/migrate-en-images-to-r2.mjs              # migración real
 *   node scripts/migrate-en-images-to-r2.mjs --dry-run    # solo muestra ejemplos
 *   node scripts/migrate-en-images-to-r2.mjs --desde=500  # retomar desde offset
 * ─────────────────────────────────────────────────────────────────────────────
 */

const SUPABASE_URL = 'https://psdadbxlwkjgcisviimo.supabase.co'
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBzZGFkYnhsd2tqZ2Npc3ZpaW1vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY4OTgyNTQsImV4cCI6MjA5MjQ3NDI1NH0.jO9y--DsTRkpGz07j--UdoJXm_B9J6rV7W-NOX_i4Ls'
const SCANNER_BASE = 'https://stock-tcg-production.up.railway.app'

const DRY_RUN      = process.argv.includes('--dry-run')
const DESDE_ARG    = process.argv.find(a => a.startsWith('--desde='))
const START_OFFSET = DESDE_ARG ? parseInt(DESDE_ARG.split('=')[1], 10) : 0
const LANG_ARG     = process.argv.find(a => a.startsWith('--lang='))
const LANG         = LANG_ARG ? LANG_ARG.split('=')[1] : 'en'   // en | jp | cn

const PAGE         = 300   // cartas por página de Supabase
const CONCURRENCY  = 10    // requests en paralelo al scanner
const PATCH_CONC   = 30    // PATCH requests en paralelo a Supabase
const DELAY_MS     = 80    // pausa entre páginas para no saturar Railway

// ── Helpers ───────────────────────────────────────────────────────────────────

const sleep = ms => new Promise(r => setTimeout(r, ms))

const withTimeout = (promise, ms) =>
  Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ])

// ── Supabase fetch ────────────────────────────────────────────────────────────

async function supFetch(path, opts = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    ...opts,
    headers: {
      apikey:        SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      ...opts.headers,
    },
  })
  return res
}

// ── Contar total de cartas EN ─────────────────────────────────────────────────

async function getTotalCards(lang) {
  const res = await supFetch(
    `/cards?language=eq.${lang}&select=id`,
    { headers: { 'Range-Unit': 'items', Range: '0-0', Prefer: 'count=exact' } }
  )
  const cr = res.headers.get('content-range') ?? ''
  return parseInt(cr.split('/')[1] ?? '0', 10)
}

// ── Traer una página de cartas ────────────────────────────────────────────────

async function fetchPage(offset, lang) {
  const from = offset
  const to   = offset + PAGE - 1
  const res = await supFetch(
    `/cards?language=eq.${lang}&select=id,name,card_number,set_name,image_url&limit=${PAGE}&offset=${from}`,
    { headers: { 'Range-Unit': 'items', Range: `${from}-${to}` } }
  )
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`)
  return await res.json()
}

// ── Consultar URL R2 para una carta EN ───────────────────────────────────────

async function getR2Url(card) {
  try {
    // Normalizar número: "001" → "1", "5/198" → "5"
    const numRaw = String(card.card_number ?? '').split('/')[0].replace(/^0+/, '') || ''
    const params = new URLSearchParams({ name: card.name, lang: 'en' })
    if (numRaw) params.set('number', numRaw)

    const res = await withTimeout(
      fetch(`${SCANNER_BASE}/card-image-url?${params}`),
      8000
    )
    if (!res.ok) return null
    const { url } = await res.json()
    return url ?? null
  } catch (_) {
    return null
  }
}

// ── Procesar una página con concurrencia ──────────────────────────────────────

async function processBatch(cards) {
  const results = []
  for (let i = 0; i < cards.length; i += CONCURRENCY) {
    const chunk   = cards.slice(i, i + CONCURRENCY)
    const settled = await Promise.allSettled(
      chunk.map(card => getR2Url(card).then(url => ({ card, url })))
    )
    for (const s of settled) {
      if (s.status === 'fulfilled') results.push(s.value)
    }
  }
  return results
}

// ── PATCH individual por carta (el upsert POST/on_conflict no funciona con anon key) ──
// PATCH /cards?id=eq.{id}  body: { image_url }  → actualiza solo ese campo

async function patchCards(updates) {
  if (DRY_RUN || updates.length === 0) return

  let errors = 0
  for (let i = 0; i < updates.length; i += PATCH_CONC) {
    const chunk = updates.slice(i, i + PATCH_CONC)
    const settled = await Promise.allSettled(
      chunk.map(({ id, image_url }) =>
        supFetch(`/cards?id=eq.${id}`, {
          method:  'PATCH',
          headers: { Prefer: 'return=minimal' },
          body:    JSON.stringify({ image_url }),
        }).then(r => { if (!r.ok) errors++; return r.ok })
      )
    )
    for (const s of settled) {
      if (s.status === 'rejected') errors++
    }
  }
  if (errors) console.warn(`\n  ⚠ ${errors} errores en PATCH`)
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('')
  console.log('╔══════════════════════════════════════════════════════════╗')
  console.log(`║   Migrate ${LANG.toUpperCase()} images → R2 — Kardia (Jonat)               ║`)
  console.log('╚══════════════════════════════════════════════════════════╝')
  if (DRY_RUN)       console.log('⚠  DRY-RUN — nada se escribe en Supabase\n')
  if (START_OFFSET)  console.log(`⏩  Retomando desde offset ${START_OFFSET}\n`)

  // ── Warm-up Railway (cold start puede tardar) ──
  process.stdout.write('🔥 Warm-up Railway… ')
  try {
    await withTimeout(fetch(`${SCANNER_BASE}/health`), 15000)
    console.log('ok')
  } catch (_) {
    console.log('sin respuesta — continuando igual')
  }

  const total = await getTotalCards(LANG)
  const toProcess = total - START_OFFSET
  console.log(`\n📦 ${total} cartas ${LANG.toUpperCase()} en Supabase (procesando ${toProcess} desde offset ${START_OFFSET})\n`)

  let processed = 0
  let updated   = 0
  let alreadyR2 = 0
  let notFound  = 0
  let dryRunExamples = 0

  const R2_PREFIX = 'https://pub-9bff851767154369b00cfc4be1fadb87.r2.dev'

  for (let offset = START_OFFSET; offset < total; offset += PAGE) {
    const page = await fetchPage(offset, LANG)
    if (!page.length) break

    const results  = await processBatch(page)
    const toUpdate = []

    for (const { card, url } of results) {
      if (!url) {
        notFound++
        continue
      }
      // "ya R2" solo si la URL ES de R2 (no si coincide con pokemontcg.io)
      if (url === card.image_url && url.startsWith(R2_PREFIX)) {
        alreadyR2++
        continue
      }
      // Si el scanner devolvió la misma URL pokemontcg.io que ya tiene → sin cambio
      if (url === card.image_url && !url.startsWith(R2_PREFIX)) {
        notFound++
        continue
      }
      // Solo actualizar si la nueva URL es R2
      if (!url.startsWith(R2_PREFIX)) {
        notFound++
        continue
      }
      toUpdate.push({ id: card.id, image_url: url })
      updated++

      if (DRY_RUN && dryRunExamples < 8) {
        dryRunExamples++
        console.log(`  [${dryRunExamples}] ${card.name} #${card.card_number}`)
        console.log(`       antes: ${card.image_url ?? 'null'}`)
        console.log(`       ahora: ${url}`)
      }
    }

    await patchCards(toUpdate)

    processed += page.length
    const pct = Math.round(((processed + START_OFFSET - START_OFFSET) / toProcess) * 100)
    process.stdout.write(
      `\r  ⏳ ${processed + START_OFFSET}/${total} (${pct}%) — ` +
      `✅ ${updated} actualizadas  ⏭ ${alreadyR2} ya R2  ❌ ${notFound} sin R2`
    )

    if (offset + PAGE < total) await sleep(DELAY_MS)
  }

  console.log('\n')
  console.log('═'.repeat(58))
  console.log(`✅ Procesadas    : ${processed}`)
  console.log(`🔄 Actualizadas  : ${updated}  (imagen movida a R2)`)
  console.log(`⏭  Ya en R2     : ${alreadyR2}  (URL ya era R2, sin cambio)`)
  console.log(`❌ Sin imagen R2 : ${notFound}  (scanner no encontró la carta o devolvió pokemontcg.io)`)
  if (DRY_RUN) console.log('\n  ⚠  dry-run: nada fue escrito en Supabase')
  console.log('')
}

main().catch(err => {
  console.error('\nFatal:', err)
  process.exit(1)
})
