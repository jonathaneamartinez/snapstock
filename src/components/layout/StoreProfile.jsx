/**
 * StoreProfile — tarjeta de perfil en el sidebar
 *
 * Hover sobre el avatar → aparece lápiz → click → file picker nativo.
 * La imagen se redimensiona a 256px y se guarda en localStorage.
 *
 * Para resetear: localStorage.removeItem('snapstock_store_logo') en consola.
 */

import { useState, useRef } from 'react'
import { Pencil } from 'lucide-react'

const LOGO_KEY = 'snapstock_store_logo'

/* ── Genera las iniciales de un nombre (máx. 2 letras) ──────────────── */
const toInitials = (name = '') =>
  name
    .split(/[\s&+,·]+/)
    .filter(Boolean)
    .map(w => w[0].toUpperCase())
    .slice(0, 2)
    .join('')

/* ── Redimensiona la imagen a maxSize×maxSize antes de guardar ───────── */
function resizeImage(file, maxSize = 256) {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const img = new Image()
      img.onload = () => {
        const scale  = Math.min(maxSize / img.width, maxSize / img.height, 1)
        const canvas = document.createElement('canvas')
        canvas.width  = Math.round(img.width  * scale)
        canvas.height = Math.round(img.height * scale)
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
        resolve(canvas.toDataURL('image/jpeg', 0.85))
      }
      img.src = e.target.result
    }
    reader.readAsDataURL(file)
  })
}

export default function StoreProfile({ logo: propLogo, displayName, name, ownerNames = [] }) {
  const [logo,  setLogo]  = useState(() => localStorage.getItem(LOGO_KEY) || propLogo || null)
  const [hover, setHover] = useState(false)
  const fileRef = useRef(null)

  const label    = displayName || name || '?'
  const subtitle = displayName && name && displayName !== name ? name : null
  const members  = ownerNames.join(' · ')

  const handleFile = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const dataUrl = await resizeImage(file, 256)
    localStorage.setItem(LOGO_KEY, dataUrl)
    setLogo(dataUrl)
    e.target.value = '' // permite volver a elegir el mismo archivo
  }

  return (
    <div className="mx-3 mb-1 p-3 rounded-2xl
                    bg-gradient-to-br from-blue-50 to-violet-50
                    border border-blue-100/60
                    flex items-center gap-3">

      {/* ── Avatar editable ─────────────────────────────────────────── */}
      <div
        className="relative w-11 h-11 rounded-xl overflow-hidden shrink-0
                   shadow-sm ring-2 ring-white cursor-pointer"
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        onClick={() => fileRef.current?.click()}
        title="Cambiar foto de perfil"
      >
        {/* Imagen o iniciales */}
        {logo ? (
          <img src={logo} alt={label} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full
                          bg-gradient-to-br from-violet-300 to-blue-300
                          flex items-center justify-center
                          text-white font-black text-sm select-none">
            {toInitials(label)}
          </div>
        )}

        {/* Overlay lápiz al hacer hover */}
        {hover && (
          <div className="absolute inset-0 bg-black/45 flex items-center justify-center
                          transition-opacity duration-150">
            <Pencil size={13} className="text-white drop-shadow" />
          </div>
        )}
      </div>

      {/* Input de archivo — oculto, activado por el avatar */}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFile}
      />

      {/* ── Info ────────────────────────────────────────────────────── */}
      <div className="min-w-0 flex-1">
        <p className="font-bold text-gray-800 text-[13px] leading-tight truncate">
          {label}
        </p>
        {subtitle && (
          <p className="text-[11px] text-gray-400 leading-tight truncate mt-0.5">
            {subtitle}
          </p>
        )}
        {members && (
          <p className="text-[10px] text-gray-400 leading-tight truncate mt-0.5">
            {members}
          </p>
        )}
      </div>
    </div>
  )
}
