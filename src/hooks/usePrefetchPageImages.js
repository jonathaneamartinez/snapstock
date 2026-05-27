import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { fetchCardImages } from '../lib/pokemonTcg'
import { setCardImage, getCardImageUrl } from '../lib/imageCache'

const SCANNER_URL = import.meta.env.VITE_SCANNER_URL

// Limpia el nombre antes de enviarlo al scanner:
// "Pikachu [Reverse Holo] #25" → "Pikachu"
function cleanNameForScanner(nombre) {
  return (nombre || '')
    .replace(/\s*\[[^\]]*\]/g, '')        // quita [Reverse Holo] etc.
    .replace(/\s*#[A-Za-z0-9]+\s*$/, '')  // quita #25, #TG30
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
      key:    r.nombre,           // usamos nombre como key para el lookup
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
    return await res.json()  // { nombre: { url, set_name, number } }
  } catch {
    return {}
  }
}

/**
 * Cuando `rows` cambia (nueva página), busca imágenes en background
 * para las cartas que no tienen image_url, en 2 pasos:
 *
 * 1. Batch al scanner (1 request para todas) → EN via pokemontcg.io CDN + JP/CN via R2
 * 2. Para EN no encontradas por scanner → pokemontcg.io API (fallback)
 *
 * Retorna imageMap: { [card_id]: url } — se va completando mientras llegan.
 * También persiste en Supabase para que la próxima vez carguen directo.
 */
export function usePrefetchPageImages(rows) {
  const [imageMap, setImageMap] = useState({})
  const abortRef = useRef(false)

  useEffect(() => {
    if (!rows?.length) { setImageMap({}); return }

    const missing = rows.filter(r => !r.image_url && !getCardImageUrl(r.card_id) && r.nombre && r.card_id)
    if (!missing.length) { setImageMap({}); return }

    abortRef.current = false
    setImageMap({})

    const toSave = []

    ;(async () => {
      // ── Paso 1: batch al scanner ──────────────────────────────────────
      const scannerResults = await batchScannerLookup(missing)

      if (abortRef.current) return

      const notFoundByScanner = []

      for (const row of missing) {
        if (abortRef.current) break

        const hit = scannerResults[row.nombre]
        if (hit?.url) {
          setImageMap(prev => ({ ...prev, [row.card_id]: hit.url }))
          setCardImage(row.card_id, hit.url)
          if (hit.url.startsWith('http')) toSave.push({ id: row.card_id, image_url: hit.url })
        } else {
          // Solo EN cards tienen fallback en pokemontcg.io
          if (normLang(row.idioma) === 'en') {
            notFoundByScanner.push(row)
          }
        }
      }

      // ── Paso 2: fallback pokemontcg.io para EN no encontradas ─────────
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

      // ── Guardar en Supabase (batch) ───────────────────────────────────
      if (toSave.length > 0 && !abortRef.current) {
        batchSaveToSupabase(toSave)
      }
    })()

    return () => { abortRef.current = true }
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
