/**
 * imageCache.js — Cache en memoria + proxy CORS para imágenes de cartas
 *
 * Problema raíz: images.pokemontcg.io no envía headers CORS, por lo que
 * fetch() desde el browser falla y el canvas se tainta.
 * Solución: /api/img-proxy fetcha la imagen server-side y la devuelve
 * con Access-Control-Allow-Origin: *, haciendo el blobUrl CORS-safe.
 */

// cardId (string) → imageUrl original
const _urlByCardId = new Map()

// imageUrl → blobUrl CORS-safe | null (falló)
const _blobByUrl = new Map()

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
  }
}

/** Devuelve la URL de imagen para un cardId, si fue cargada en la lista */
export function getCardImageUrl(cardId) {
  return cardId != null ? (_urlByCardId.get(String(cardId)) ?? null) : null
}

/**
 * Carga imageUrl como blob URL CORS-safe (usable en canvas.toDataURL).
 * Usa el proxy /api/img-proxy para evitar restricciones CORS del browser.
 * Cachea resultado. Devuelve null si falla.
 */
export async function loadBlobUrl(imageUrl) {
  if (!imageUrl) return null

  // Resultado ya cacheado (null = fallo conocido, no reintentar)
  if (_blobByUrl.has(imageUrl)) return _blobByUrl.get(imageUrl)

  const fetchTarget = proxyUrl(imageUrl)

  try {
    const res = await fetch(fetchTarget)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const blob    = await res.blob()
    const blobUrl = URL.createObjectURL(blob)
    _blobByUrl.set(imageUrl, blobUrl)
    return blobUrl
  } catch (err) {
    console.warn('[imageCache] loadBlobUrl failed for', imageUrl, err?.message)
    _blobByUrl.set(imageUrl, null)
    return null
  }
}
