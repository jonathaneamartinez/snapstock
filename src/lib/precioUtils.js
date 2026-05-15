/**
 * Devuelve el precio USD efectivo de una carta según el proveedor seleccionado.
 * Prioridad: override individual > global > fallback a price_usd legado.
 *
 * @param {object} row        - fila de inventory (con precios_fuentes, precio_fuente_override, price_usd)
 * @param {string} globalFuente - proveedor global de la tienda ('tcgplayer' | 'cardmarket')
 * @returns {{ usd: number|null, eur: number|null, fuente: string, label: string }}
 */
export function getPrecioEfectivo(row, globalFuente = 'tcgplayer') {
  const fuente = row.precio_fuente_override ?? globalFuente
  const fuentes = row.precios_fuentes ?? {}
  const datos = fuentes[fuente]

  if (datos?.usd != null) {
    return { usd: datos.usd, eur: datos.eur ?? null, fuente, label: datos.label ?? fuente }
  }

  // Fallback: otro proveedor disponible
  for (const [key, val] of Object.entries(fuentes)) {
    if (val?.usd != null) {
      return { usd: val.usd, eur: val.eur ?? null, fuente: key, label: val.label ?? key, fallback: true }
    }
  }

  // Fallback legacy: price_usd directo
  if (row.price_usd != null) {
    return { usd: row.price_usd, eur: null, fuente: 'legacy', label: 'Precio', fallback: true }
  }

  return { usd: null, eur: null, fuente, label: fuente }
}

/**
 * Convierte USD → ARS usando el tipo de cambio blue.
 */
export function usdToArs(usd, blue, margen = 0) {
  if (!usd || !blue) return null
  return Math.round((usd * blue * (1 + margen / 100)) / 500) * 500
}

/**
 * Etiqueta corta del proveedor para mostrar en UI.
 */
export const FUENTE_LABELS = {
  tcgplayer:    { label: 'TCGPlayer',  flag: '🇺🇸', currency: 'USD' },
  cardmarket:   { label: 'CardMarket', flag: '🇪🇺', currency: 'EUR' },
  pricecharting:{ label: 'PriceCharting', flag: '📊', currency: 'USD' },
  legacy:       { label: 'Precio',     flag: '💲', currency: 'USD' },
}
