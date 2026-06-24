import { supabase } from './supabase'

// Etiquetas legibles por categoría de producto sellado
export const SEALED_LABELS = {
  etb:            'Elite Trainer Box',
  booster_box:    'Booster Box',
  booster_bundle: 'Booster Bundle',
  bundle:         'Bundle',
  blister:        'Blister',
  booster_pack:   'Booster Pack',
  tin:            'Tin',
  collection_box: 'Collection Box',
  build_battle:   'Build & Battle',
  starter:        'Starter',
}
export const sealedLabel = (t) => SEALED_LABELS[t] || (t || 'Sellado')

/**
 * Busca productos sellados (ETB, Booster Box, Bundle…) por nombre o set.
 * @returns {Promise<Array>} sugerencias en formato unificado con la carga.
 */
export async function searchSealedByName(query, limit = 25) {
  const q = (query || '').trim().replace(/%/g, '\\%').replace(/_/g, '\\_')
  if (q.length < 2) return []
  const { data, error } = await supabase
    .from('sealed_products')
    .select('id, name, set_name, product_type, pack_count, image_url, pricecharting_url, language')
    .or(`name.ilike.*${q}*,set_name.ilike.*${q}*`)
    .limit(limit)
  if (error) return []
  return (data ?? []).map(p => ({
    sealedId:     p.id,
    nombre:       p.name,
    set:          p.set_name,
    product_type: p.product_type,
    pack_count:   p.pack_count,
    imagen:       p.image_url,
    pricecharting_url: p.pricecharting_url,
    language:     p.language,
    source:       'sealed',
  }))
}
