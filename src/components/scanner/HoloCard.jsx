import { useState, useEffect, useCallback, useRef } from 'react'
import '../../styles/holo.css'

// Mapea holoLevel del backend al class CSS
function holoClass(level) {
  switch (level) {
    case 'holo':    return 'holo'
    case 'ultra':   return 'holo-v'
    case 'secret':  return 'holo-rainbow'
    case 'reverse': return 'reverse-holo'
    default:        return ''
  }
}

// Vars que dejan el efecto en estado neutral (sin interacción activa)
const IDLE_VARS = {
  '--pointer-x':           '50%',
  '--pointer-y':           '50%',
  '--pointer-from-left':   '0.5',
  '--pointer-from-top':    '0.5',
  '--pointer-from-center': '0',
  '--card-opacity':        '0',
  '--rotate-x':            '0deg',
  '--rotate-y':            '0deg',
  '--background-x':        '50%',
  '--background-y':        '50%',
}

// Igual que setCardVars en el HTML original
function computeVarsFromPercent(px, py, op) {
  const pfl = px / 100
  const pft = py / 100
  const pfc = Math.min(1, Math.sqrt((pfl - 0.5) ** 2 + (pft - 0.5) ** 2) / 0.7071)
  const rx  = ((px - 50) / 3.5).toFixed(2)
  const ry  = (-(py - 50) / 3.5).toFixed(2)
  const bx  = (37 + pfl * 26).toFixed(1)
  const by  = (33 + pft * 34).toFixed(1)
  return {
    '--pointer-x':           px.toFixed(1) + '%',
    '--pointer-y':           py.toFixed(1) + '%',
    '--pointer-from-left':   pfl.toFixed(3),
    '--pointer-from-top':    pft.toFixed(3),
    '--pointer-from-center': pfc.toFixed(3),
    '--card-opacity':        op.toFixed(3),
    '--rotate-x':            rx + 'deg',
    '--rotate-y':            ry + 'deg',
    '--background-x':        bx + '%',
    '--background-y':        by + '%',
  }
}

// Calcula vars desde coordenadas en píxeles dentro del elemento
function computeVarsFromPixels(x, y, w, h) {
  return computeVarsFromPercent((x / w) * 100, (y / h) * 100, 1)
}

export default function HoloCard({ imagen, holoLevel = 'normal', alt = '' }) {
  const gyroActiveRef    = useRef(false)
  const animFrameRef     = useRef(null)
  const interactingRef   = useRef(false)

  const cls    = holoClass(holoLevel)
  const isHolo = cls !== ''

  const [vars,        setVars]        = useState(IDLE_VARS)
  const [interacting, setInteracting] = useState(false)

  // ── Animación de entrada (igual al triggerEntryAnimation del HTML) ────────
  const triggerEntry = useCallback(() => {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
    setInteracting(true)
    interactingRef.current = true

    const start = performance.now()
    const total = 1200

    const frame = (now) => {
      const t     = Math.min((now - start) / total, 1)
      const angle = Math.sin(t * Math.PI * 2) * 15
      const op    = Math.sin(t * Math.PI)
      setVars(computeVarsFromPercent(50 + angle, 50 + angle * 0.5, op))
      if (t < 1) {
        animFrameRef.current = requestAnimationFrame(frame)
      } else {
        // Al terminar: volver a idle pero mantener un leve efecto visible
        setVars(computeVarsFromPercent(55, 40, 0.65))
        setInteracting(true)
        interactingRef.current = true
      }
    }
    animFrameRef.current = requestAnimationFrame(frame)
  }, [])

  // Disparar animación de entrada cuando cambia la carta/holoLevel
  useEffect(() => {
    if (!isHolo) {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
      setVars(IDLE_VARS)
      setInteracting(false)
      interactingRef.current = false
      return
    }
    const timer = setTimeout(triggerEntry, 80)
    return () => {
      clearTimeout(timer)
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [holoLevel, imagen])

  // ── Mouse ─────────────────────────────────────────────────────────────────
  const handleMouseMove = useCallback((e) => {
    if (!isHolo || gyroActiveRef.current) return
    if (animFrameRef.current) { cancelAnimationFrame(animFrameRef.current); animFrameRef.current = null }
    const r = e.currentTarget.getBoundingClientRect()
    setVars(computeVarsFromPixels(e.clientX - r.left, e.clientY - r.top, r.width, r.height))
    if (!interactingRef.current) { setInteracting(true); interactingRef.current = true }
  }, [isHolo])

  const handleMouseLeave = useCallback(() => {
    if (!isHolo) return
    setTimeout(() => {
      setVars(computeVarsFromPercent(55, 40, 0.65))
    }, 300)
  }, [isHolo])

  // ── Touch ─────────────────────────────────────────────────────────────────
  const handleTouchMove = useCallback((e) => {
    if (!isHolo) return
    if (animFrameRef.current) { cancelAnimationFrame(animFrameRef.current); animFrameRef.current = null }
    const t = e.touches[0]
    const r = e.currentTarget.getBoundingClientRect()
    setVars(computeVarsFromPixels(t.clientX - r.left, t.clientY - r.top, r.width, r.height))
    if (!interactingRef.current) { setInteracting(true); interactingRef.current = true }
  }, [isHolo])

  const handleTouchEnd = useCallback(() => {
    if (!isHolo) return
    setTimeout(() => {
      setVars(computeVarsFromPercent(55, 40, 0.65))
    }, 400)
  }, [isHolo])

  // ── Giroscopio ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isHolo) return
    let gyroBase = null

    const onGyro = (e) => {
      if (e.gamma === null || e.beta === null) return
      gyroActiveRef.current = true
      if (!gyroBase) gyroBase = { gamma: e.gamma, beta: e.beta }
      const dx = Math.max(-30, Math.min(30, e.gamma - gyroBase.gamma))
      const dy = Math.max(-20, Math.min(20, (e.beta  - gyroBase.beta) * 0.5))
      setVars(computeVarsFromPercent(50 + (dx / 30) * 40, 50 + (dy / 20) * 30, 0.9))
      if (!interactingRef.current) { setInteracting(true); interactingRef.current = true }
    }

    window.addEventListener('deviceorientation', onGyro)
    return () => {
      window.removeEventListener('deviceorientation', onGyro)
      gyroActiveRef.current = false
    }
  }, [isHolo])

  return (
    <div
      className={`card-scene${cls ? ' ' + cls : ''}${interacting ? ' interacting' : ''}`}
      style={vars}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <div className="card-rotator">
        <img
          src={imagen}
          alt={alt}
          className="card-img"
          draggable={false}
          onError={e => { e.target.style.opacity = '0.3' }}
        />
        <div className="card-shine" />
        <div className="card-glare" />
      </div>
    </div>
  )
}
