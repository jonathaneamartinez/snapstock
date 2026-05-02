import { useState, useRef, useCallback } from 'react'
import { scannerApi } from '../lib/scanner'
import { STORE_ID } from '../constants'

// Estados del flujo del scanner
// idle → detecting → identified → confirming → success | error

export function useScanner() {
  const [estado,   setEstado]  = useState('idle')
  const [opciones, setOpciones] = useState([])
  const [carta,    setCarta]   = useState(null)
  const [error,    setError]   = useState(null)
  const [sesion,   setSesion]  = useState({ cartas: 0, totalUSD: 0 })
  const procesandoRef = useRef(false)

  const capturar = useCallback(async (base64) => {
    if (procesandoRef.current) return
    procesandoRef.current = true
    setEstado('detecting')
    setError(null)
    try {
      const res = await scannerApi.identificar(base64, STORE_ID)
      if (res.encontrado && res.opciones?.length) {
        setOpciones(res.opciones)
        setCarta(res.opciones[0])
        setEstado('identified')
      } else {
        setEstado('idle')
      }
    } catch (e) {
      setError(e.message || 'Error al identificar')
      setEstado('error')
    } finally {
      procesandoRef.current = false
    }
  }, [])

  const confirmar = useCallback(async ({ carta: c, cantidad, condicion, accion }) => {
    setEstado('confirming')
    setError(null)
    try {
      const res = await scannerApi.confirmar({
        store_id: STORE_ID,
        carta: c,
        cantidad,
        condicion,
        accion,
      })
      if (res.guardado) {
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
