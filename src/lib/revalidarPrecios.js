/**
 * revalidarPrecios.js
 *
 * Función central que recorre todo el inventario disponible,
 * consulta la API TCG por cada carta y actualiza price_usd + ARS.
 *
 * Usada por:
 *   - Settings.jsx  → botón manual con UI de progreso
 *   - usePriceAutoUpdate.js → cron silencioso 1 vez/día
 */

import { supabase }             from './supabase'
import { fetchCardMarketData }  from './pokemonTcg'
import { STORE_ID }             from '../constants'

/**
 * @param {object} opts
 * @param {number} opts.blue     — cotización dólar blue
 * @param {number} [opts.oficial]— cotización dólar oficial (opcional)
 * @param {function} [opts.onProgress] — callback({ current, total, updated, noPrice, entry })
 * @returns {Promise<{ updated: number, noPrice: number, total: number }>}
 */
export async function revalidarPrecios({ blue, oficial, onProgress }) {
  if (!blue) return { updated: 0, noPrice: 0, total: 0 }

  // Traer todo el inventario disponible con la info de la carta
  const { data: items, error } = await supabase
    .from('inventory')
    .select('id, price_usd, cards(name, set_name, card_number)')
    .eq('store_id', STORE_ID)
    .eq('status', 'disponible')

  if (error || !items) {
    console.warn('[revalidarPrecios] Error cargando inventario:', error?.message)
    return { updated: 0, noPrice: 0, total: 0 }
  }

  const total   = items.length
  let updated   = 0
  let noPrice   = 0

  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    const card = item.cards
    if (!card?.name) { noPrice++; continue }

    // Buscar precio + imagen en TCG API (comparte caché con el visor de imágenes)
    const data   = await fetchCardMarketData(card.name, card.card_number, card.set_name)
    const newUsd = data?.price_usd ?? null

    let entry = null

    if (newUsd != null && newUsd > 0) {
      const newArsBlue = Math.round(newUsd * blue)
      const newArsOfic = oficial ? Math.round(newUsd * oficial) : null

      await supabase
        .from('inventory')
        .update({
          price_usd:         newUsd,
          price_ars_blue:    newArsBlue,
          price_ars_oficial: newArsOfic,
        })
        .eq('id', item.id)

      updated++
      entry = {
        label:  `${card.name}${card.set_name ? ` · ${card.set_name}` : ''}`,
        before: item.price_usd,
        after:  newUsd,
        ok:     true,
      }
    } else {
      noPrice++
      entry = {
        label:  `${card.name}${card.set_name ? ` · ${card.set_name}` : ''}`,
        before: item.price_usd,
        after:  null,
        ok:     false,
      }
    }

    onProgress?.({ current: i + 1, total, updated, noPrice, entry })
  }

  return { updated, noPrice, total }
}
