import { useRef, useEffect, useState } from 'react'
import '../../../src/styles/holo.css'

const DIMS = {
  single:       { w: 240, h: 336 },
  booster_pack: { w: 160, h: 320 },
  booster_box:  { w: 320, h: 240 },
  etb:          { w: 260, h: 300 },
  tin:          { w: 200, h: 280 },
}

export default function HoloCard({ imagen, holoLevel = 'normal', tipo = 'single', alt = '' }) {
  const cardRef = useRef(null)
  const [active, setActive] = useState(false)
  const dim = DIMS[tipo] ?? DIMS.single

  useEffect(() => {
    const el = cardRef.current
    if (!el || holoLevel === 'normal') return

    const applyTransform = (rx, ry, mx, my) => {
      el.style.transform = `perspective(600px) rotateX(${ry}deg) rotateY(${rx}deg)`
      el.style.setProperty('--mx', `${mx}%`)
      el.style.setProperty('--my', `${my}%`)
      setActive(true)
    }

    const reset = () => {
      el.style.transform = 'perspective(600px) rotateX(0deg) rotateY(0deg)'
      setActive(false)
    }

    const onMouseMove = (e) => {
      const r = el.getBoundingClientRect()
      const x = e.clientX - r.left, y = e.clientY - r.top
      const rx = ((x / r.width)  - 0.5) * 20
      const ry = ((y / r.height) - 0.5) * -20
      applyTransform(rx, ry, (x / r.width) * 100, (y / r.height) * 100)
    }

    const onMouseLeave = reset

    const onTouch = (e) => {
      const t = e.touches[0]
      const r = el.getBoundingClientRect()
      const x = t.clientX - r.left, y = t.clientY - r.top
      const rx = ((x / r.width)  - 0.5) * 20
      const ry = ((y / r.height) - 0.5) * -20
      applyTransform(rx, ry, (x / r.width) * 100, (y / r.height) * 100)
    }

    // Giroscopio (iOS 13+)
    const onDeviceOrientation = (e) => {
      if (e.beta == null) return
      const rx = (e.gamma / 45) * 10
      const ry = ((e.beta  - 45) / 45) * -10
      applyTransform(rx, ry, 50 + rx * 3, 50 + ry * 3)
    }

    el.addEventListener('mousemove',  onMouseMove)
    el.addEventListener('mouseleave', onMouseLeave)
    el.addEventListener('touchmove',  onTouch, { passive: true })
    el.addEventListener('touchend',   reset)
    window.addEventListener('deviceorientation', onDeviceOrientation)

    return () => {
      el.removeEventListener('mousemove',  onMouseMove)
      el.removeEventListener('mouseleave', onMouseLeave)
      el.removeEventListener('touchmove',  onTouch)
      el.removeEventListener('touchend',   reset)
      window.removeEventListener('deviceorientation', onDeviceOrientation)
    }
  }, [holoLevel])

  return (
    <div
      ref={cardRef}
      className={`holo-card holo-${holoLevel} ${active ? 'holo-active' : ''}`}
      style={{ width: dim.w, height: dim.h }}
    >
      <img
        src={imagen}
        alt={alt}
        className="w-full h-full object-cover select-none"
        draggable={false}
      />
    </div>
  )
}
