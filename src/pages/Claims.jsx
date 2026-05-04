import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useClaims } from '../hooks/useClaims'
import Spinner from '../components/ui/Spinner'
import EmptyState from '../components/ui/EmptyState'
import { AnimatePresence, motion } from 'framer-motion'

const fmtFecha = (s) =>
  s ? new Date(s).toLocaleDateString('es-AR', {
    day: '2-digit', month: '2-digit', year: '2-digit',
  }) : '—'
const fmtHora = (s) =>
  s ? new Date(s).toLocaleTimeString('es-AR', {
    hour: '2-digit', minute: '2-digit',
  }) : ''

/* ─── Visor de imagen fullscreen ────────────────────────────────────── */
function ImagenFullscreen({ src, onClose }) {
  return (
    <div
      className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <img
        src={src}
        alt="Claim"
        className="max-h-full max-w-full object-contain rounded-xl shadow-2xl"
        onClick={e => e.stopPropagation()}
      />
      <button
        onClick={onClose}
        className="absolute top-4 right-4 text-white/70 hover:text-white text-3xl leading-none"
      >
        ×
      </button>
    </div>
  )
}

/* ─── Fila de claim expandible ───────────────────────────────────────── */
function ClaimRow({ claim }) {
  const [expanded, setExpanded] = useState(false)
  const [fullImg,  setFullImg]  = useState(null)
  const hasImages = claim.image_urls?.length > 0

  return (
    <>
      <tr
        className={`hover:bg-gray-50 cursor-pointer transition
          ${expanded ? 'bg-blue-50' : ''}`}
        onClick={() => setExpanded(e => !e)}
      >
        <td className="px-4 py-3">
          <div>
            <p className="text-xs font-semibold text-gray-500">{fmtFecha(claim.created_at)}</p>
            <p className="text-[10px] text-gray-400">{fmtHora(claim.created_at)}</p>
          </div>
        </td>
        <td className="px-4 py-3 font-medium text-gray-800 text-sm">{claim.title || '—'}</td>
        <td className="px-4 py-3">
          <span className="text-xs bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full font-semibold">
            {claim.style === 'A' ? 'Collage 6×5' : 'Grid 5×5'}
          </span>
        </td>
        <td className="px-4 py-3 text-gray-700 font-medium text-sm">{claim.card_count ?? '—'}</td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            {/* Thumbnails preview */}
            {hasImages ? (
              <div className="flex gap-1">
                {claim.image_urls.slice(0, 3).map((url, i) => (
                  <img
                    key={i}
                    src={url}
                    alt=""
                    className="w-8 h-8 object-cover rounded-md border border-gray-200 shadow-sm"
                  />
                ))}
                {claim.image_urls.length > 3 && (
                  <div className="w-8 h-8 rounded-md bg-gray-100 flex items-center justify-center
                                  text-[10px] font-bold text-gray-500 border border-gray-200">
                    +{claim.image_urls.length - 3}
                  </div>
                )}
              </div>
            ) : (
              <span className="text-xs text-gray-400">Sin imágenes</span>
            )}
            <span className="text-gray-300 text-sm ml-auto">{expanded ? '▲' : '▼'}</span>
          </div>
        </td>
        <td className="px-4 py-3">
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium
            ${claim.dark ? 'bg-gray-800 text-gray-200' : 'bg-gray-100 text-gray-600'}`}>
            {claim.dark ? '🌙' : '☀️'}
          </span>
        </td>
      </tr>

      {/* Galería expandida */}
      <AnimatePresence>
        {expanded && (
          <tr>
            <td colSpan={6} className="px-0 py-0">
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="px-5 py-4 bg-gray-50 border-t border-b border-gray-100">
                  {!hasImages ? (
                    <p className="text-sm text-gray-400 text-center py-4">
                      Este claim no tiene imágenes guardadas.
                    </p>
                  ) : (
                    <>
                      <p className="text-xs font-semibold text-gray-500 mb-3">
                        {claim.image_urls.length} {claim.image_urls.length === 1 ? 'imagen' : 'imágenes'} · Clic para ampliar
                      </p>
                      <div className="flex gap-3 flex-wrap">
                        {claim.image_urls.map((url, i) => (
                          <button
                            key={i}
                            onClick={() => setFullImg(url)}
                            className="relative group rounded-xl overflow-hidden shadow-md
                                       border-2 border-transparent hover:border-blue-400 transition"
                          >
                            <img
                              src={url}
                              alt={`Imagen ${i + 1}`}
                              className="h-36 w-auto object-cover"
                            />
                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20
                                            flex items-center justify-center transition">
                              <span className="opacity-0 group-hover:opacity-100 text-white text-2xl">
                                🔍
                              </span>
                            </div>
                            <p className="absolute bottom-1 right-2 text-[10px] text-white/80
                                          font-medium bg-black/40 px-1 rounded">
                              {i + 1}/{claim.image_urls.length}
                            </p>
                          </button>
                        ))}
                      </div>
                      {/* Botón descargar todas */}
                      <div className="mt-3 flex gap-2">
                        {claim.image_urls.map((url, i) => (
                          <a
                            key={i}
                            href={url}
                            download={`claim_${fmtFecha(claim.created_at).replace(/\//g,'-')}_${i+1}.png`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs text-blue-600 hover:underline"
                          >
                            ⬇ img {i + 1}
                          </a>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </motion.div>
            </td>
          </tr>
        )}
      </AnimatePresence>

      {fullImg && <ImagenFullscreen src={fullImg} onClose={() => setFullImg(null)} />}
    </>
  )
}

/* ═══════════════════════════════════════════════════════════════════════
   Página principal
════════════════════════════════════════════════════════════════════════ */
export default function Claims() {
  const navigate = useNavigate()
  const { data, isLoading, error } = useClaims()
  const claims = data ?? []

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm
                      flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-gray-800">🃏 Claims</h2>
          <p className="text-sm text-gray-400 mt-0.5">
            Historial de imágenes generadas · {claims.length} claims
          </p>
        </div>
        <button
          onClick={() => navigate('/stock')}
          className="px-4 py-2 bg-violet-600 text-white text-sm font-bold rounded-xl
                     hover:bg-violet-500 transition"
        >
          + Nuevo claim
        </button>
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        {isLoading && (
          <div className="flex justify-center py-12">
            <Spinner size={28} className="text-violet-400" />
          </div>
        )}
        {error && <p className="text-red-500 text-sm p-5">{error.message}</p>}
        {!isLoading && claims.length === 0 && (
          <div className="p-8">
            <EmptyState emoji="🃏" title="Sin claims todavía" sub="Generá el primero desde Stock" />
            <div className="mt-5 bg-gray-50 rounded-xl p-4 max-w-lg mx-auto">
              <p className="text-xs font-semibold text-gray-500 mb-2">Cómo generar un claim:</p>
              <ol className="space-y-1.5">
                {[
                  'Stock → seleccioná cartas disponibles',
                  'Barra inferior → botón violeta 🃏 Claim',
                  'Elegí estilo A (30 cartas) o B (25 cartas)',
                  'Generá → descargá → Confirmar claim',
                ].map((s, i) => (
                  <li key={i} className="flex items-center gap-2 text-xs text-gray-600">
                    <span className="w-4 h-4 bg-violet-100 text-violet-600 rounded-full
                                     flex items-center justify-center font-bold shrink-0">
                      {i + 1}
                    </span>
                    {s}
                  </li>
                ))}
              </ol>
            </div>
          </div>
        )}

        {!isLoading && claims.length > 0 && (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-400 text-xs uppercase">
              <tr>
                {['Fecha', 'Título', 'Estilo', 'Cartas', 'Imágenes', 'Tema'].map(h => (
                  <th key={h} className="px-4 py-3 text-left font-semibold whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {claims.map(c => <ClaimRow key={c.id} claim={c} />)}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
