import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import PriceHistoryChart from './PriceHistoryChart'

const fmtUSD = (n) => n != null ? `$${Number(n).toFixed(2)}` : '—'
const fmtARS = (n) => n != null
  ? `$${Number(n).toLocaleString('es-AR', { maximumFractionDigits: 0 })}`
  : '—'

/**
 * Modal de historial de precio para una carta.
 * Se abre al clickear la celda USD en Stock.jsx.
 *
 * Props:
 *   card    — objeto con { inventory_id, nombre, set_name, numero, idioma,
 *                          price_usd_efectivo, _ars_blue, _ars_ofic, image_url }
 *   onClose — función para cerrar
 */
export default function CardPriceModal({ card, onClose }) {
  const [days, setDays] = useState(30)

  if (!card) return null

  return (
    <AnimatePresence>
      {card && (
        <>
          {/* Overlay */}
          <motion.div
            key="overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 z-50 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Panel */}
          <motion.div
            key="panel"
            initial={{ opacity: 0, scale: 0.95, y: 16 }}
            animate={{ opacity: 1, scale: 1,    y: 0  }}
            exit={{    opacity: 0, scale: 0.95, y: 16 }}
            transition={{ type: 'spring', damping: 24, stiffness: 320 }}
            className="fixed inset-x-4 top-1/2 -translate-y-1/2 z-50
                       max-w-md mx-auto bg-white rounded-3xl shadow-2xl p-5
                       sm:inset-x-auto sm:w-full sm:max-w-md"
          >
            {/* Header */}
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                {card.image_url && (
                  <img
                    src={card.image_url}
                    alt={card.nombre}
                    className="w-10 h-14 object-contain rounded-lg shadow"
                  />
                )}
                <div>
                  <h2 className="font-bold text-gray-800 text-sm leading-tight">
                    {card.nombre || '—'}
                  </h2>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {card.set_name} {card.numero ? `· #${card.numero}` : ''}
                    {card.idioma ? ` · ${card.idioma.toUpperCase()}` : ''}
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="w-7 h-7 flex items-center justify-center
                           rounded-full bg-gray-100 hover:bg-gray-200
                           text-gray-400 text-base transition"
              >
                ×
              </button>
            </div>

            {/* Precios actuales */}
            <div className="grid grid-cols-3 gap-2 mb-4">
              {[
                { label: 'USD',      value: fmtUSD(card.price_usd_efectivo ?? card.price_usd), color: 'text-emerald-600' },
                { label: 'ARS Blue', value: fmtARS(card._ars_blue),  color: 'text-blue-600'    },
                { label: 'ARS Ofic.',value: fmtARS(card._ars_ofic),  color: 'text-gray-600'    },
              ].map(p => (
                <div key={p.label}
                  className="bg-gray-50 rounded-2xl px-3 py-2.5 text-center">
                  <p className="text-[10px] text-gray-400 mb-0.5">{p.label}</p>
                  <p className={`text-sm font-bold ${p.color}`}>{p.value}</p>
                </div>
              ))}
            </div>

            {/* Selector de ventana de tiempo */}
            <div className="flex items-center gap-1 mb-3">
              <span className="text-xs text-gray-400 mr-1">Ver:</span>
              {[7, 14, 30, 60, 90].map(d => (
                <button
                  key={d}
                  onClick={() => setDays(d)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition
                    ${days === d
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
                >
                  {d}d
                </button>
              ))}
            </div>

            {/* Gráfico */}
            <PriceHistoryChart cardId={card.inventory_id} days={days} />
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
