/**
 * revalidarPrecios.js
 *
 * Recorre el inventario disponible, consulta PriceCharting (/card-price)
 * por cada carta+grado y actualiza price_usd + ARS en inventory.
 * El backend guarda en price_history con grade, price_buy_usd, price_sell_usd.
 *
 * Usada por:
 *   - Settings.jsx  → botón manual con UI de progreso
 *   - usePriceAutoUpdate.js → cron silencioso 1 vez/día
 */

import { supabase }  from './supabase'
import { STORE_ID }  from '../constants'

const BACKEND = 'https://stock-tcg-production.up.railway.app'

/**
 * @param {object} opts
 * @param {number} opts.blue      — cotización dólar blue
 * @param {number} [opts.oficial] — cotización dólar oficial (opcional)
 * @param {function} [opts.onProgress] — callback({ current, total, updated, noPrice, entry })
 * @returns {Promise<{ updated: number, noPrice: number, total: number }>}
 */
export async function revalidarPrecios({ blue, oficial, onProgress }) {
  if (!blue) return { updated: 0, noPrice: 0, total: 0 }

  // Traer inventario disponible con grade + info de carta
  const { data: items, error } = await supabase
    .from('inventory')
    .select('id, price_usd, finish, grade, cards(id, name, set_name, card_number, language)')
    .eq('store_id', STORE_ID)
    .eq('status', 'disponible')

  if (error || !items) {
    console.warn('[revalidarPrecios] Error cargando inventario:', error?.message)
    return { updated: 0, noPrice: 0, total: 0 }
  }

  const total = items.length
  let updated = 0
  let noPrice = 0

  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    const card = item.cards
    if (!card?.name) { noPrice++; continue }

    const grade  = item.grade  || 'ungraded'
    const finish = item.finish || 'normal'

    let newUsd      = null
    let newBuyUsd   = null
    let newSellUsd  = null

    try {
      const params = new URLSearchParams({
        name:    card.name,
        lang:    card.language || 'en',
        grade,
        finish,
      })
      if (card.card_number) params.set('number',   card.card_number)
      if (card.set_name)    params.set('set_name', card.set_name)
      if (card.id)          params.set('card_id',  card.id)

      const res = await fetch(`${BACKEND}/card-price?${params}`)
      if (res.ok) {
        const json = await res.json()
        newUsd     = json.price_usd      ?? null
        newBuyUsd  = json.price_buy_usd  ?? null
        newSellUsd = json.price_sell_usd ?? null
      }
    } catch (_) {
      // sin precio
    }

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
          grade,
        })
        .eq('id', item.id)

      updated++
      entry = {
        label:  `${card.name}${card.set_name ? ` · ${card.set_name}` : ''}`,
        grade,
        before: item.price_usd,
        after:  newUsd,
        buy:    newBuyUsd,
        sell:   newSellUsd,
        ok:     true,
      }
    } else {
      noPrice++
      entry = {
        label:  `${card.name}${card.set_name ? ` · ${card.set_name}` : ''}`,
        grade,
        before: item.price_usd,
        after:  null,
        ok:     false,
      }
    }

    onProgress?.({ current: i + 1, total, updated, noPrice, entry })
  }

  return { updated, noPrice, total }
}
