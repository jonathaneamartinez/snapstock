import { useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

/**
 * Modal para visualizar una carta en grande.
 * Props:
 *  card  — { src, nombre, set, numero, condicion, statusLabel, priceUSD, priceARS }
 *  onClose — fn
 */
export default function CardModal({ card, onClose }) {
  // Cerrar con ESC
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <AnimatePresence>
      {card && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 z-50 backdrop-blur-sm"
          />

          {/* Panel */}
          <motion.div
            key="modal"
            initial={{ opacity: 0, scale: 0.85, y: 40 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.85, y: 40 }}
            transition={{ type: 'spring', damping: 20, stiffness: 300 }}
            className="fixed z-50 inset-0 flex items-center justify-center p-4 pointer-events-none"
          >
            <div className="bg-white rounded-3xl shadow-2xl overflow-hidden
                            w-full max-w-sm pointer-events-auto">

              {/* Header */}
              <div className="flex items-center justify-between px-5 pt-4 pb-2">
                <div>
                  <p className="font-bold text-gray-800 text-base leading-tight">{card.nombre}</p>
                  {card.set && (
                    <p className="text-xs text-gray-400 mt-0.5">
                      {card.set} {card.numero ? `· #${card.numero}` : ''}
                    </p>
                  )}
                </div>
                <button
                  onClick={onClose}
                  className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200
                             flex items-center justify-center text-gray-500 text-lg transition">
                  ×
                </button>
              </div>

              {/* Imagen */}
              <div className="px-8 py-3 flex justify-center bg-gradient-to-b from-gray-50 to-white">
                {card.src ? (
                  <img
                    src={card.src}
                    alt={card.nombre}
                    className="max-h-72 w-auto rounded-xl shadow-lg object-contain"
                    draggable={false}
                  />
                ) : (
                  <div className="h-48 w-36 bg-gray-100 rounded-xl flex items-center
                                  justify-center text-gray-300 text-sm">
                    Sin imagen
                  </div>
                )}
              </div>

              {/* Detalles */}
              {(card.condicion || card.statusLabel || card.priceUSD || card.priceARS) && (
                <div className="px-5 py-4 grid grid-cols-2 gap-2 border-t border-gray-100">
                  {card.condicion && (
                    <div className="bg-gray-50 rounded-xl p-3 text-center">
                      <p className="text-xs text-gray-400 mb-0.5">Condición</p>
                      <p className="font-semibold text-gray-700 text-sm">{card.condicion}</p>
                    </div>
                  )}
                  {card.statusLabel && (
                    <div className="bg-gray-50 rounded-xl p-3 text-center">
                      <p className="text-xs text-gray-400 mb-0.5">Estado</p>
                      <p className="font-semibold text-gray-700 text-sm">{card.statusLabel}</p>
                    </div>
                  )}
                  {card.priceUSD && (
                    <div className="bg-emerald-50 rounded-xl p-3 text-center">
                      <p className="text-xs text-gray-400 mb-0.5">USD</p>
                      <p className="font-bold text-emerald-600 text-sm">{card.priceUSD}</p>
                    </div>
                  )}
                  {card.priceARS && (
                    <div className="bg-blue-50 rounded-xl p-3 text-center">
                      <p className="text-xs text-gray-400 mb-0.5">ARS Blue</p>
                      <p className="font-bold text-blue-600 text-sm">{card.priceARS}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
