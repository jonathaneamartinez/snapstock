/**
 * imageCache.js — Cache en memoria compartida entre CardImage y useClaimGenerator
 *
 * Cuando CardImage carga una imagen exitosamente, registra la URL aquí.
 * El generador de claims consulta este cache en primer lugar, sin depender
 * de que Supabase ya tenga la URL actualizada (evita race conditions).
 */

// cardId (string) → imageUrl original
const _urlByCardId = new Map()

// imageUrl → blobUrl (listo para canvas, CORS-safe) | null (falló)
const _blobByUrl = new Map()

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
 * Carga una URL de imagen como blob URL (CORS-safe para canvas).
 * Cachea el resultado. Devuelve null si falla.
 */
export async function loadBlobUrl(imageUrl) {
  if (!imageUrl) return null

  // Ya cacheado (incluso si fue null = fallo previo conocido)
  if (_blobByUrl.has(imageUrl)) return _blobByUrl.get(imageUrl)

  try {
    const res = await fetch(imageUrl)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const blob   = await res.blob()
    const blobUrl = URL.createObjectURL(blob)
    _blobByUrl.set(imageUrl, blobUrl)
    return blobUrl
  } catch {
    // Falló el fetch normal → intentar con crossOrigin + mini-canvas para pre-validar
    const result = await new Promise(resolve => {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.onload = () => {
        try {
          // Crear mini-canvas para verificar que no taintea
          const c = document.createElement('canvas')
          c.width = 4; c.height = 4
          c.getContext('2d').drawImage(img, 0, 0, 4, 4)
          c.toDataURL() // Lanza si está taintado
          resolve(imageUrl) // CORS OK → devolver URL original (img ya cargada)
        } catch {
          resolve(null) // Canvas tainted → no usable
        }
      }
      img.onerror = () => resolve(null)
      img.src = imageUrl
    })
    _blobByUrl.set(imageUrl, result)
    return result
  }
}
