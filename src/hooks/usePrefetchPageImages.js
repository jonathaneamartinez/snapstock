import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { fetchCardImages } from '../lib/pokemonTcg'
import { setCardImage, getCardImageUrl } from '../lib/imageCache'

const SCANNER_URL = import.meta.env.VITE_SCANNER_URL

// ─── Shared batch state (module-level singleton) ─────────────────────────────
// Tracks which card_ids are currently being resolved by the batch request.
// CardImage reads this to avoid firing 50 individual scanner requests while
// the batch is already in flight.
const _pendingBatchIds = new Set()

/** Returns true if this card_id is being resolved by the current batch. */
export function isBatchPending(cardId) {
  return cardId != null && _pendingBatchIds.has(String(cardId))
}

function cleanNameForScanner(nombre) {
  return (nombre || '')
    .replace(/\s*\[[^\]]*\]/g, '')
    .replace(/\s*#[A-Za-z0-9]+\s*$/, '')
    .trim()
}

function normLang(lang) {
  const l = (lang || 'en').toLowerCase()
  if (l === 'ja' || l === 'jp') return 'jp'
  if (l === 'zh' || l === 'cn') return 'cn'
  return 'en'
}

/**
 * Batch lookup en el scanner para hasta 200 cartas en 1 solo request.
 * Retorna { nombre: url } para las encontradas.
 */
async function batchScannerLookup(rows) {
  if (!SCANNER_URL || !rows.length) return {}
  try {
    const body = rows.map(r => ({
      key:    r.nombre,
      name:   cleanNameForScanner(r.nombre),
      number: r.numero || '',
      lang:   normLang(r.idioma),
      set_id: r.set_name ? r.set_name.toLowerCase().replace(/\s+/g, '-') : '',
    }))
    const res = await fetch(`${SCANNER_URL}/card-image-url-batch`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
      signal:  AbortSignal.timeout(8000),
    })
    if (!res.ok) return {}
    return await res.json()
  } catch {
    return {}
  }
}

/**
 * Cuando `rows` cambia (nueva página):
 *
 * 1. Preloads inmediatos: dispara new Image() para todas las URLs ya conocidas
 *    → el browser las descarga en background, de modo que cuando el <img> se
 *    renderice la respuesta ya está en caché HTTP y aparece instantáneamente.
 *
 * 2. Para las cartas SIN image_url (missing):
 *    - Las marca en _pendingBatchIds (CardImage lo consulta para NO hacer fetch
 *      individual mientras el batch está en vuelo → evita 50 requests simultáneos).
 *    - Hace 1 solo request batch al scanner.
 *    - Fallback pokemontcg.io para las EN no encontradas.
 *    - Persiste en Supabase para que la próxima sesión cargue directo desde DB.
 *
 * Retorna imageMap: { [card_id]: url } — se va completando conforme llegan.
 */
export function usePrefetchPageImages(rows) {
  const [imageMap, setImageMap] = useState({})
  const abortRef = useRef(false)

  useEffect(() => {
    if (!rows?.length) { setImageMap({}); return }

    // ── Preload inmediato para URLs ya conocidas en DB ────────────────────────
    // Arranca la descarga en el browser antes de que el <img> siquiera se renderice.
    rows.forEach(r => {
      if (r.image_url) {
        const img = new Image()
        img.src = r.image_url
      }
    })

    const missing = rows.filter(r => !r.image_url && !getCardImageUrl(r.card_id) && r.nombre && r.card_id)
    if (!missing.length) { setImageMap({}); return }

    // Marcar todas las cartas missing como "batch en vuelo"
    missing.forEach(r => _pendingBatchIds.add(String(r.card_id)))

    abortRef.current = false
    setImageMap({})

    const toSave = []

    ;(async () => {
      // ── Paso 1: batch al scanner ──────────────────────────────────────────
      const scannerResults = await batchScannerLookup(missing)

      if (abortRef.current) return

      const notFoundByScanner = []

      for (const row of missing) {
        if (abortRef.current) break

        // Desmarcar antes de resolver (CardImage puede arrancar su propio fetch
        // solo si el batch ya terminó sin encontrarla)
        _pendingBatchIds.delete(String(row.card_id))

        const hit = scannerResults[row.nombre]
        if (hit?.url) {
          setImageMap(prev => ({ ...prev, [row.card_id]: hit.url }))
          setCardImage(row.card_id, hit.url)
          if (hit.url.startsWith('http')) toSave.push({ id: row.card_id, image_url: hit.url })
        } else {
          if (normLang(row.idioma) === 'en') {
            notFoundByScanner.push(row)
          }
        }
      }

      // ── Paso 2: fallback pokemontcg.io para EN no encontradas ─────────────
      if (notFoundByScanner.length > 0 && !abortRef.current) {
        const CONCURRENCY = 6
        const queue = [...notFoundByScanner]
        let active = 0
        let done = 0

        await new Promise(resolve => {
          const processNext = () => {
            while (active < CONCURRENCY && queue.length > 0) {
              const row = queue.shift()
              active++
              fetchCardImages(row.nombre, row.numero, row.set_name)
                .then(imgs => {
                  if (abortRef.current || !imgs?.small) return
                  const bestUrl = imgs.large || imgs.small
                  setImageMap(prev => ({ ...prev, [row.card_id]: bestUrl }))
                  setCardImage(row.card_id, bestUrl)
                  if (imgs.large) toSave.push({ id: row.card_id, image_url: imgs.large })
                })
                .finally(() => {
                  active--
                  done++
                  if (done === notFoundByScanner.length) resolve()
                  else processNext()
                })
            }
          }
          processNext()
        })
      }

      // ── Guardar en Supabase (batch) ───────────────────────────────────────
      if (toSave.length > 0 && !abortRef.current) {
        batchSaveToSupabase(toSave)
      }
    })()

    return () => {
      abortRef.current = true
      // Limpiar pending para que CardImage no quede bloqueada en unmount
      missing.forEach(r => _pendingBatchIds.delete(String(r.card_id)))
    }
  }, [rows])

  return imageMap
}

async function batchSaveToSupabase(items) {
  if (!items.length) return
  const CHUNK = 50
  for (let i = 0; i < items.length; i += CHUNK) {
    const chunk = items.slice(i, i + CHUNK)
    await Promise.allSettled(
      chunk.map(({ id, image_url }) =>
        supabase.from('cards').update({ image_url }).eq('id', id)
      )
    )
  }
}
