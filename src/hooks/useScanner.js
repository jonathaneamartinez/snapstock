import { useState, useRef, useCallback } from 'react'
import { scannerApi } from '../lib/scanner'
import { supabase }   from '../lib/supabase'
import { STORE_ID }   from '../constants'

// Estados del flujo del scanner
// idle → detecting → identified → confirming → success | error

export function useScanner() {
  const [estado,   setEstado]   = useState('idle')
  const [opciones, setOpciones] = useState([])
  const [carta,    setCarta]    = useState(null)
  const [error,    setError]    = useState(null)
  const [sesion,   setSesion]   = useState({ cartas: 0, totalUSD: 0 })
  const procesandoRef = useRef(false)

  const capturar = useCallback(async (base64, idioma = 'en') => {
    if (procesandoRef.current) return
    procesandoRef.current = true
    setEstado('detecting')
    setError(null)

    const MAX_RETRIES = 2
    let lastErr = null

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        if (attempt > 1) {
          setError(`Reintentando… (${attempt}/${MAX_RETRIES})`)
          await new Promise(res => setTimeout(res, 900))
          setError(null)
        }

        const res = await scannerApi.identificar(base64, STORE_ID, idioma)

        if (res.carta) {
          const candidatas = res.candidatas?.length ? res.candidatas : []
          setOpciones([res.carta, ...candidatas])
          setCarta(res.carta)
          setEstado('identified')
          procesandoRef.current = false
          return
        } else if (res.error) {
          throw new Error(res.error)
        } else {
          // Carta no encontrada — no reintentar
          setEstado('idle')
          procesandoRef.current = false
          return
        }
      } catch (e) {
        lastErr = e
      }
    }

    setError(lastErr?.message || 'Error al identificar')
    setEstado('error')
    procesandoRef.current = false
  }, [])

  const confirmar = useCallback(async ({
    carta: c,
    cantidad,
    condicion,
    accion,
    sale_price_ars,
    buyer_name,
    idioma          = 'en',
    canal           = null,
    is_first_edition = false,
  }) => {
    setEstado('confirming')
    setError(null)
    try {
      // 1. Llamar al backend del scanner (maneja inventory + cards)
      const res = await scannerApi.confirmar({
        store_id:        STORE_ID,
        carta:           c,
        cantidad,
        condicion,
        accion,
        sale_price_ars:  sale_price_ars  ?? null,
        buyer_name:      buyer_name      ?? null,
        idioma,
        canal,
        is_first_edition,
      })

      if (res.guardado) {
        // 2. Si la acción es vender → insertar en la tabla sales con los campos nuevos
        if (accion === 'vender') {
          await supabase.from('sales').insert({
            store_id:    STORE_ID,
            channel:     canal || 'fuera_de_evento',
            buyer_name:  buyer_name  || null,
            notes:       c.nombre    || '',
            total_ars:   sale_price_ars || null,
            sold_at:     new Date().toISOString(),
            estado:      'pendiente',
            inventory_id: res.inventory_id || null,
          })
        }

        setSesion(prev => ({
          cartas:   prev.cartas + cantidad,
          totalUSD: prev.totalUSD + (c.precio_usd || 0) * cantidad,
        }))
        setEstado('success')
      } else {
        throw new Error(res.mensaje || 'No se pudo guardar')
      }
    } catch (e) {
      setError(e.message || 'Error al confirmar')
      setEstado('error')
    }
  }, [])

  const reset = useCallback(() => {
    setEstado('idle')
    setOpciones([])
    setCarta(null)
    setError(null)
    procesandoRef.current = false
  }, [])

  const resetSesion = useCallback(() => {
    setSesion({ cartas: 0, totalUSD: 0 })
  }, [])

  // Fuerza mostrar una carta directamente (desde buscador manual)
  const forceCard = useCallback((cartaItem) => {
    setCarta(cartaItem)
    setEstado('identified')
    setError(null)
    procesandoRef.current = false
  }, [])

  return { estado, opciones, carta, error, sesion, capturar, confirmar, reset, resetSesion, forceCard }
}
