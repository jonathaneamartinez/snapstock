import { supabase } from './supabase'

// Etiquetas legibles por categoría de producto sellado
export const SEALED_LABELS = {
  etb:            'Elite Trainer Box',
  etb_case:       'ETB Case',
  booster_box:    'Booster Box',
  booster_box_case:'Booster Box Case',
  booster_bundle: 'Booster Bundle',
  bundle:         'Bundle',
  blister:        'Blister',
  checklane:      'Checklane Blister',
  booster_pack:   'Booster Pack',
  sleeved_pack:   'Sleeved Booster Pack',
  art_bundle:     'Art Bundle',
  tin:            'Tin',
  collection_box: 'Collection Box',
  premium_collection: 'Premium Collection',
  build_battle:   'Build & Battle',
  starter:        'Starter',
}
export const sealedLabel = (t) => SEALED_LABELS[t] || (t || 'Sellado')

const _map = (p) => ({
  sealedId: p.id, nombre: p.name, set: p.set_name, product_type: p.product_type,
  pack_count: p.pack_count, imagen: p.image_url, pricecharting_url: p.pricecharting_url,
  language: p.language, source: 'sealed',
})

// Categoriza un producto sellado por su nombre (espejo del populate_sealed_products.py)
export function categorizeSealed(name) {
  const n = (name || '').toLowerCase()
  const rules = [
    [/elite trainer box case|etb case/, 'etb_case'],
    [/booster box case/, 'booster_box_case'],
    [/art bundle/, 'art_bundle'],
    [/checklane/, 'checklane'],
    [/sleeved booster/, 'sleeved_pack'],
    [/premium collection|ultra-?premium|super premium/, 'premium_collection'],
    [/elite trainer box/, 'etb'],
    [/booster box/, 'booster_box'],
    [/booster bundle/, 'booster_bundle'],
    [/build ?& ?battle/, 'build_battle'],
    [/collection box|collection$|gift set/, 'collection_box'],
    [/blister/, 'blister'],
    [/booster pack|mini booster/, 'booster_pack'],
    [/\btin\b/, 'tin'],
    [/\bbundle\b/, 'bundle'],
  ]
  for (const [rx, t] of rules) if (rx.test(n)) return t
  return null
}

// Deriva el nombre de set legible desde el slug de consola de la URL de PC.
export function setFromPcUrl(url) {
  const m = (url || '').match(/\/game\/pokemon-([a-z0-9-]+)\//i)
  if (!m) return ''
  return m[1].replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

/**
 * Resuelve un sellado desde un link de PriceCharting (find por URL/nombre, o lo crea).
 * @param {object} r  resultado de resolvePcUrl: {name, set_name, image_url, ...}
 * @returns {Promise<object|null>} el sealed_product (con id) o null.
 */
export async function upsertSealedFromUrl(url, r) {
  if (!r || !r.name) return null
  const setName = r.set_name || setFromPcUrl(url)
  // 1) por pricecharting_url exacto
  let { data } = await supabase.from('sealed_products')
    .select('id, name, set_name, product_type, image_url, pricecharting_url')
    .eq('pricecharting_url', url).limit(1).maybeSingle()
  // 2) por nombre + set
  if (!data && setName) {
    const res = await supabase.from('sealed_products')
      .select('id, name, set_name, product_type, image_url, pricecharting_url')
      .ilike('name', r.name).ilike('set_name', `*${setName}*`).limit(1).maybeSingle()
    data = res.data
  }
  // 3) crear si no existe
  if (!data) {
    const ptype = categorizeSealed(r.name) || 'booster_pack'
    const ins = await supabase.from('sealed_products').insert({
      name: r.name, set_name: setName, product_type: ptype,
      image_url: r.image_url || null, pricecharting_url: url, language: 'en',
    }).select('id, name, set_name, product_type, image_url').maybeSingle()
    data = ins.data
  }
  return data || null
}

/** Lista los sellados de un set (para el flujo "elegí set → opciones de sellado"). */
export async function searchSealedBySet(setName, limit = 60) {
  if (!setName) return []
  const s = setName.replace(/^Pokemon\s+/i, '').replace(/%/g, '\\%').replace(/_/g, '\\_')
  const { data, error } = await supabase
    .from('sealed_products')
    .select('id, name, set_name, product_type, pack_count, image_url, pricecharting_url, language')
    .ilike('set_name', `*${s}*`)
    .order('product_type')
    .limit(limit)
  if (error) return []
  return (data ?? []).map(_map)
}

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
