import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { fetchCardImages } from '../lib/pokemonTcg'
import { setCardImage, loadBlobUrl, getCardImageUrl } from '../lib/imageCache'

const CONCURRENCY = 5   // máx llamadas paralelas a la API

/**
 * Cuando `rows` cambia (nueva página), busca imágenes en background
 * para todas las cartas que no tienen image_url.
 *
 * Retorna imageMap: { [card_id]: url } — se completa mientras van llegando.
 * También persiste en Supabase para que la próxima vez carguen directo.
 */
export function usePrefetchPageImages(rows) {
  const [imageMap, setImageMap] = useState({})
  const abortRef = useRef(false)   // para cancelar si cambia la página antes de terminar

  useEffect(() => {
    if (!rows?.length) { setImageMap({}); return }

    // Solo las que no tienen imagen en Supabase ni en caché de sesión
    const missing = rows.filter(r => !r.image_url && !getCardImageUrl(r.card_id) && r.nombre && r.card_id)
    if (!missing.length) { setImageMap({}); return }

    abortRef.current = false
    setImageMap({})

    const queue   = [...missing]
    let   active  = 0
    let   done    = 0
    const toSave  = []   // acumula para batch save al final

    const processNext = () => {
      while (active < CONCURRENCY && queue.length > 0) {
        const row = queue.shift()
        active++

        fetchCardImages(row.nombre, row.numero, row.set_name)
          .then(imgs => {
            if (abortRef.current || !imgs?.small) return

            const bestUrl = imgs.large || imgs.small

            // Mostrar en UI inmediatamente
            setImageMap(prev => ({ ...prev, [row.card_id]: bestUrl }))

            // Guardar en cache de memoria y pre-calentar blob CORS-safe para claims
            setCardImage(row.card_id, bestUrl)
            loadBlobUrl(bestUrl)   // fire-and-forget: precachea mientras navega

            // Acumular para guardar en Supabase
            if (imgs.large) {
              toSave.push({ id: row.card_id, image_url: imgs.large })
            }
          })
          .finally(() => {
            active--
            done++

            // Siguiente tanda
            processNext()

            // Cuando termina todo el batch → guardar en Supabase de una sola vez
            if (done === missing.length && toSave.length > 0 && !abortRef.current) {
              batchSaveToSupabase(toSave)
            }
          })
      }
    }

    processNext()

    // Cleanup: si el usuario cambia de página antes de terminar, cancelamos
    return () => { abortRef.current = true }
  }, [rows])

  return imageMap
}

/** Guarda un array de { id, image_url } en cards de Supabase (upsert por id) */
async function batchSaveToSupabase(items) {
  if (!items.length) return
  // Actualizamos de a 50 para no hacer una query gigante
  const CHUNK = 50
  for (let i = 0; i < items.length; i += CHUNK) {
    const chunk = items.slice(i, i + CHUNK)
    // update individual por id (Supabase no tiene upsert por array en REST v1 fácil)
    await Promise.allSettled(
      chunk.map(({ id, image_url }) =>
        supabase.from('cards').update({ image_url }).eq('id', id)
      )
    )
  }
}
