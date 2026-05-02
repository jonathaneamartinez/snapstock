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

// Vars por defecto: efecto visible sin interacción
const DEFAULT_VARS = {
  '--pointer-x':           '55%',
  '--pointer-y':           '40%',
  '--pointer-from-left':   '0.55',
  '--pointer-from-top':    '0.40',
  '--pointer-from-center': '0.22',
  '--card-opacity':        '0.65',
  '--rotate-x':            '3deg',
  '--rotate-y':            '5deg',
  '--background-x':        '55%',
  '--background-y':        '42%',
}

function computeVars(x, y, w, h) {
  const pfl = x / w
  const pft = y / h
  const dx  = (pfl - 0.5) * 2
  const dy  = (pft - 0.5) * 2
  const pfc = Math.min(1, Math.sqrt(dx * dx + dy * dy) / Math.SQRT2)
  const MAX = 15
  const rx  =  dx * MAX
  const ry  = -dy * MAX
  const bx  = 50 + (pfl - 0.5) * 20
  const by  = 50 + (pft - 0.5) * 20
  return {
    '--pointer-x':           (pfl * 100) + '%',
    '--pointer-y':           (pft * 100) + '%',
    '--pointer-from-left':   String(pfl),
    '--pointer-from-top':    String(pft),
    '--pointer-from-center': String(pfc),
    '--card-opacity':        '1',
    '--rotate-x':            rx + 'deg',
    '--rotate-y':            ry + 'deg',
    '--background-x':        bx + '%',
    '--background-y':        by + '%',
  }
}

export default function HoloCard({ imagen, holoLevel = 'normal', alt = '' }) {
  const gyroActiveRef = useRef(false)

  const cls    = holoClass(holoLevel)
  const isHolo = cls !== ''

  // CSS vars como estado — arranca con defaults visibles para cartas holo
  const [vars, setVars] = useState(isHolo ? DEFAULT_VARS : {})

  // Sincronizar si cambia el holoLevel (ej: usuario navega entre cartas)
  useEffect(() => {
    setVars(isHolo ? DEFAULT_VARS : {})
  }, [isHolo])

  const handleMouseMove = useCallback((e) => {
    if (!isHolo || gyroActiveRef.current) return
    const r = e.currentTarget.getBoundingClientRect()
    setVars(computeVars(e.clientX - r.left, e.clientY - r.top, r.width, r.height))
  }, [isHolo])

  const handleMouseLeave = useCallback(() => {
    if (!isHolo) return
    setVars(DEFAULT_VARS)
  }, [isHolo])

  const handleTouchMove = useCallback((e) => {
    if (!isHolo) return
    const t = e.touches[0]
    const r = e.currentTarget.getBoundingClientRect()
    setVars(computeVars(t.clientX - r.left, t.clientY - r.top, r.width, r.height))
  }, [isHolo])

  const handleTouchEnd = useCallback(() => {
    if (!isHolo) return
    setVars(DEFAULT_VARS)
  }, [isHolo])

  useEffect(() => {
    if (!isHolo) return
    const onGyro = (e) => {
      if (e.beta == null || e.gamma == null) return
      gyroActiveRef.current = true
      // gamma: tilt LR (-90 a +90), beta: tilt F/B (0 a 180, ~45° en reposo)
      const gammaFrac = Math.max(0, Math.min(1, (e.gamma + 45) / 90))
      const betaFrac  = Math.max(0, Math.min(1, (e.beta  - 20) / 70))
      // Simulamos ancho/alto fijos para el cálculo
      setVars(computeVars(gammaFrac * 100, betaFrac * 100, 100, 100))
    }
    window.addEventListener('deviceorientation', onGyro)
    return () => {
      window.removeEventListener('deviceorientation', onGyro)
      gyroActiveRef.current = false
    }
  }, [isHolo])

  return (
    <div
      className={`card-scene${cls ? ' ' + cls : ''}${isHolo ? ' interacting' : ''}`}
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
