/**
 * imageCache.js — Cache en memoria + sessionStorage + proxy CORS para imágenes de cartas
 *
 * Problema raíz: images.pokemontcg.io no envía headers CORS, por lo que
 * fetch() desde el browser falla y el canvas se tainta.
 * Solución: /api/img-proxy fetcha la imagen server-side y la devuelve
 * con Access-Control-Allow-Origin: *, haciendo el blobUrl CORS-safe.
 *
 * sessionStorage: persiste cardId→imageUrl durante la sesión del tab.
 * Al navegar de vuelta a Stock, las URLs ya están disponibles sin refetch.
 */

const SESSION_KEY = 'sst_img_urls'

// cardId (string) → imageUrl original
const _urlByCardId = new Map()

// Hidratar desde sessionStorage al cargar el módulo (síncrono)
;(() => {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY)
    if (!raw) return
    for (const [k, v] of Object.entries(JSON.parse(raw))) {
      if (k && v) _urlByCardId.set(k, v)
    }
  } catch {}
})()

// imageUrl → blobUrl CORS-safe (solo se guarda cuando tuvo ÉXITO)
const _blobByUrl = new Map()

// En-flight: imageUrl → Promise<blobUrl|null> (evita fetch duplicado)
const _inflight = new Map()

// Guardar en sessionStorage en batch (máx 1 write por segundo)
let _saveScheduled = false
function _scheduleSave() {
  if (_saveScheduled) return
  _saveScheduled = true
  setTimeout(() => {
    _saveScheduled = false
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(Object.fromEntries(_urlByCardId)))
    } catch {} // falla en privado sin storage — ignorar
  }, 1000)
}

/* ─── Helpers ───────────────────────────────────────────────────────── */

/** Devuelve la URL que se debe fetchear: usa proxy para URLs externas */
function proxyUrl(imageUrl) {
  if (!imageUrl) return null
  // blob: y data: son same-origin, no necesitan proxy
  if (imageUrl.startsWith('blob:') || imageUrl.startsWith('data:')) return imageUrl
  // URLs relativas tampoco
  if (!imageUrl.startsWith('http')) return imageUrl
  // Externas → pasar por nuestro proxy Vercel
  return `/api/img-proxy?url=${encodeURIComponent(imageUrl)}`
}

/* ─── API pública ───────────────────────────────────────────────────── */

/** Llamado por CardImage cuando carga una imagen con éxito */
export function setCardImage(cardId, imageUrl) {
  if (cardId != null && imageUrl) {
    _urlByCardId.set(String(cardId), imageUrl)
    _scheduleSave()
  }
}

/** Devuelve la URL de imagen para un cardId, si fue cargada en la lista */
export function getCardImageUrl(cardId) {
  return cardId != null ? (_urlByCardId.get(String(cardId)) ?? null) : null
}

/**
 * Pre-calienta un array de URLs como blobs con concurrencia limitada.
 * Fire-and-forget: no hace falta await. Los resultados se guardan en _blobByUrl
 * para que loadBlobUrl() los devuelva instantáneamente más tarde.
 */
export function warmBlobUrls(urls, concurrency = 6) {
  const queue = [...new Set(urls.filter(Boolean))]  // deduplicar
  let active = 0

  function next() {
    while (active < concurrency && queue.length > 0) {
      const url = queue.shift()
      active++
      loadBlobUrl(url).finally(() => { active--; next() })
    }
  }
  next()
}

/**
 * Carga imageUrl como blob CORS-safe (usable en canvas.toDataURL).
 * - Si ya está cacheado, devuelve instantáneamente.
 * - Si hay un fetch en vuelo para la misma URL, comparte ese Promise.
 * - NO cachea fallos, siempre reintenta.
 */
export async function loadBlobUrl(imageUrl) {
  if (!imageUrl) return null

  // Éxito ya cacheado → reusar directamente
  if (_blobByUrl.has(imageUrl)) return _blobByUrl.get(imageUrl)

  // Fetch en vuelo → esperar al mismo Promise
  if (_inflight.has(imageUrl)) return _inflight.get(imageUrl)

  const fetchTarget = proxyUrl(imageUrl)

  const promise = (async () => {
    try {
      const res = await fetch(fetchTarget)
      if (!res.ok) throw new Error(`HTTP ${res.status} para ${fetchTarget}`)
      const blob    = await res.blob()
      if (!blob.size) throw new Error('Blob vacío')
      const blobUrl = URL.createObjectURL(blob)
      _blobByUrl.set(imageUrl, blobUrl)   // cachear solo en éxito
      return blobUrl
    } catch (err) {
      console.warn('[imageCache] loadBlobUrl falló:', imageUrl, '→', err?.message)
      return null   // NO cachear el fallo → se podrá reintentar
    } finally {
      _inflight.delete(imageUrl)          // limpiar in-flight siempre
    }
  })()

  _inflight.set(imageUrl, promise)
  return promise
}
