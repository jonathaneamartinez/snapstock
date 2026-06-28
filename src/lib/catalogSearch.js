import { supabase } from './supabase'

/**
 * Búsqueda unificada en NUESTRO catálogo (tabla cards), igual que el Pokédex:
 * matchea por name + name_en (substring) → trae todas las variantes/dueños/
 * regiones e idiomas (Galarian Moltres, Team Rocket's Moltres, JP por name_en…).
 *
 * @param {string} query  texto a buscar
 * @param {string|null} lang  'en'|'jp'|'cn' para filtrar; null = todos
 * @param {number} limit
 * @returns {Promise<Array>} sugerencias en formato de Ingresos
 */
export async function searchCatalogByName(query, lang = null, limit = 25) {
  const q = (query || '').trim().replace(/%/g, '\\%').replace(/_/g, '\\_')
  if (q.length < 2) return []
  let req = supabase
    .from('cards')
    .select('id, name, name_en, set_name, card_number, image_url, language, finish')
    .limit(limit)
  // En EN, name == name_en (derivado) → buscar una sola columna es más rápido.
  // En JP/CN, buscar también name_en para poder escribir en inglés.
  if (lang === 'en') req = req.ilike('name', `*${q}*`)
  else               req = req.or(`name.ilike.*${q}*,name_en.ilike.*${q}*`)
  if (lang) req = req.eq('language', lang)
  const { data, error } = await req
  if (error) return []
  return (data ?? []).map(c => ({
    nombre:     c.name,
    set:        c.set_name,
    set_id:     null,
    numero:     c.card_number,
    imagen:     c.image_url,
    language:   c.language,
    finish:     c.finish,
    precio_usd: null,
    source:     'catalog',
  }))
}
