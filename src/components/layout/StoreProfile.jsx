/**
 * StoreProfile — tarjeta de perfil en el sidebar
 *
 * Muestra: avatar (imagen o initials fallback) + nombre del proyecto + integrantes.
 *
 * Para configurar por cliente → editar src/clients/{id}/config.js:
 *   logo:        null             → muestra initials con degradado
 *   logo:        'https://...'   → muestra la imagen (CDN, base64, etc.)
 *   displayName: 'Sebas y Melo'  → nombre visible en la tarjeta
 *   ownerNames:  ['Sebas', ...]  → personas listadas abajo
 */

/* ── Genera las iniciales de un nombre (máx. 2 letras) ──────────────── */
const toInitials = (name = '') =>
  name
    .split(/[\s&+,·]+/)
    .filter(Boolean)
    .map(w => w[0].toUpperCase())
    .slice(0, 2)
    .join('')

export default function StoreProfile({ logo, displayName, name, ownerNames = [] }) {
  const label    = displayName || name || '?'
  const subtitle = displayName && name && displayName !== name ? name : null
  const members  = ownerNames.join(' · ')

  return (
    <div className="mx-3 mb-1 p-3 rounded-2xl
                    bg-gradient-to-br from-blue-50 to-violet-50
                    border border-blue-100/60
                    flex items-center gap-3">

      {/* ── Avatar ──────────────────────────────────────────────────── */}
      <div className="w-11 h-11 rounded-xl overflow-hidden shrink-0 shadow-sm
                      ring-2 ring-white">
        {logo ? (
          <img
            src={logo}
            alt={label}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full
                          bg-gradient-to-br from-violet-300 to-blue-300
                          flex items-center justify-center
                          text-white font-black text-sm select-none">
            {toInitials(label)}
          </div>
        )}
      </div>

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
