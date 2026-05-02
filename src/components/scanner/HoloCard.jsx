import { useRef, useEffect, useCallback } from 'react'
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

// Actualiza todas las CSS custom properties del efecto
function setCardVars(scene, x, y, w, h) {
  const pfl = x / w          // pointer-from-left: 0 → 1
  const pft = y / h          // pointer-from-top:  0 → 1
  const px  = pfl * 100      // 0% → 100%
  const py  = pft * 100

  // Distancia desde el centro (0 = centro exacto, 1 = esquina)
  const dx  = (pfl - 0.5) * 2
  const dy  = (pft - 0.5) * 2
  const pfc = Math.min(1, Math.sqrt(dx * dx + dy * dy) / Math.SQRT2)

  // Ángulos de rotación 3-D (±15°)
  const MAX = 15
  const rx  =  dx * MAX   // rotateY en el CSS (tilt izquierda-derecha)
  const ry  = -dy * MAX   // rotateX en el CSS (tilt arriba-abajo)

  // Posición de fondo parallax
  const bx  = 50 + (pfl - 0.5) * 20
  const by  = 50 + (pft - 0.5) * 20

  scene.style.setProperty('--pointer-x',           px  + '%')
  scene.style.setProperty('--pointer-y',           py  + '%')
  scene.style.setProperty('--pointer-from-left',   String(pfl))
  scene.style.setProperty('--pointer-from-top',    String(pft))
  scene.style.setProperty('--pointer-from-center', String(pfc))
  scene.style.setProperty('--card-opacity',        '1')
  scene.style.setProperty('--rotate-x',            rx  + 'deg')
  scene.style.setProperty('--rotate-y',            ry  + 'deg')
  scene.style.setProperty('--background-x',        bx  + '%')
  scene.style.setProperty('--background-y',        by  + '%')
}

function resetCardVars(scene) {
  scene.style.setProperty('--pointer-x',           '50%')
  scene.style.setProperty('--pointer-y',           '50%')
  scene.style.setProperty('--pointer-from-left',   '0.5')
  scene.style.setProperty('--pointer-from-top',    '0.5')
  scene.style.setProperty('--pointer-from-center', '0')
  scene.style.setProperty('--card-opacity',        '0')
  scene.style.setProperty('--rotate-x',            '0deg')
  scene.style.setProperty('--rotate-y',            '0deg')
  scene.style.setProperty('--background-x',        '50%')
  scene.style.setProperty('--background-y',        '50%')
}

export default function HoloCard({ imagen, holoLevel = 'normal', alt = '' }) {
  const sceneRef = useRef(null)
  const gyroActiveRef = useRef(false)

  const cls = holoClass(holoLevel)
  const isHolo = cls !== ''

  const handleMouseMove = useCallback((e) => {
    if (!isHolo || gyroActiveRef.current) return
    const scene = sceneRef.current
    if (!scene) return
    const r = scene.getBoundingClientRect()
    setCardVars(scene, e.clientX - r.left, e.clientY - r.top, r.width, r.height)
    scene.classList.add('interacting')
  }, [isHolo])

  const handleMouseLeave = useCallback(() => {
    if (!isHolo) return
    const scene = sceneRef.current
    if (!scene) return
    resetCardVars(scene)
    scene.classList.remove('interacting')
  }, [isHolo])

  const handleTouchMove = useCallback((e) => {
    if (!isHolo) return
    const scene = sceneRef.current
    if (!scene) return
    const t = e.touches[0]
    const r = scene.getBoundingClientRect()
    setCardVars(scene, t.clientX - r.left, t.clientY - r.top, r.width, r.height)
    scene.classList.add('interacting')
  }, [isHolo])

  const handleTouchEnd = useCallback(() => {
    if (!isHolo) return
    const scene = sceneRef.current
    if (!scene) return
    resetCardVars(scene)
    scene.classList.remove('interacting')
  }, [isHolo])

  useEffect(() => {
    if (!isHolo) return

    const onGyro = (e) => {
      if (e.beta == null || e.gamma == null) return
      const scene = sceneRef.current
      if (!scene) return
      gyroActiveRef.current = true
      const r = scene.getBoundingClientRect()
      // gamma: -90 a +90 (tilt LR), beta: 0 a 180 (tilt F/B, ~45° en reposo)
      const gammaFrac = Math.max(0, Math.min(1, (e.gamma + 45) / 90))
      const betaFrac  = Math.max(0, Math.min(1, (e.beta  - 20) / 70))
      setCardVars(scene, gammaFrac * r.width, betaFrac * r.height, r.width, r.height)
      scene.classList.add('interacting')
    }

    window.addEventListener('deviceorientation', onGyro)
    return () => {
      window.removeEventListener('deviceorientation', onGyro)
      gyroActiveRef.current = false
    }
  }, [isHolo])

  return (
    <div
      ref={sceneRef}
      className={`card-scene${cls ? ' ' + cls : ''}`}
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
