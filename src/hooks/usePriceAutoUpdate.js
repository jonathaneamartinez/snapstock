/**
 * usePriceAutoUpdate
 *
 * Hook que dispara una revalidación silenciosa de precios 1 vez por día.
 * - Chequea localStorage['ss_last_price_update'] al montar
 * - Si pasaron más de 24 h (o nunca corrió), lanza revalidarPrecios en background
 * - Al terminar, guarda el timestamp y invalida la query 'stock' para que
 *   el Stock y el Dashboard refresquen los precios sin recargar la página
 *
 * Montar en Layout (sólo corre cuando el usuario ya está autenticado).
 */

import { useEffect, useRef } from 'react'
import { useQueryClient }   from '@tanstack/react-query'
import { useDolar }         from './useDolar'
import { revalidarPrecios } from '../lib/revalidarPrecios'

const LS_KEY      = 'ss_last_price_update'
const ONE_DAY_MS  = 24 * 60 * 60 * 1000

export function usePriceAutoUpdate() {
  const { blue, oficial } = useDolar()
  const queryClient       = useQueryClient()
  const ran               = useRef(false)   // evita doble disparo en StrictMode

  useEffect(() => {
    if (!blue || ran.current) return

    const last = localStorage.getItem(LS_KEY)
    const now  = Date.now()

    if (last && now - parseInt(last, 10) < ONE_DAY_MS) return  // ya corrió hoy

    ran.current = true

    console.info('[PriceAutoUpdate] iniciando revalidación diaria…')

    revalidarPrecios({ blue, oficial })
      .then(({ updated, noPrice, total }) => {
        console.info(`[PriceAutoUpdate] listo: ${updated}/${total} actualizadas, ${noPrice} sin precio`)
        localStorage.setItem(LS_KEY, String(now))
        // Refrescar Stock y Dashboard con los nuevos precios
        queryClient.invalidateQueries({ queryKey: ['stock'] })
        queryClient.invalidateQueries({ queryKey: ['metricas'] })
      })
      .catch(err => {
        console.warn('[PriceAutoUpdate] error:', err?.message)
        ran.current = false  // permitir reintento si falla
      })
  }, [blue])  // espera a que cargue el dólar blue
}
