import { AnimatePresence, motion } from 'framer-motion'

const fmtARS = (n) =>
  n != null ? `$${Number(n).toLocaleString('es-AR', { maximumFractionDigits: 0 })}` : '—'

/**
 * Modal del carrito de claim — permite ver, quitar cartas y continuar a generar.
 *
 * Props:
 *   cart      – Map<inventory_id, cardData>
 *   onClose   – cerrar sin cambios
 *   onContinue – pasar a ClaimOptionsModal
 *   onRemove(inventoryId) – quitar 1 carta del carrito
 *   onClear   – vaciar todo el carrito
 */
export default function ClaimCartModal({ cart, onClose, onContinue, onRemove, onClear }) {
  const cards = [...cart.values()]
  const totalARS = cards.reduce((s, c) =>
    s + (c.sale_price_ars ?? c._ars_blue ?? 0), 0)

  return (
    <div className="fixed inset-0 z-[60] bg-black/60 flex items-end sm:items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{    opacity: 0, y: 40 }}
        transition={{ type: 'spring', damping: 28, stiffness: 380 }}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[85vh] flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <div>
            <h3 className="font-bold text-gray-800 text-sm">🃏 Carrito del claim</h3>
            <p className="text-xs text-gray-400 mt-0.5">
              {cards.length} {cards.length === 1 ? 'carta' : 'cartas'} ·{' '}
              <span className="text-blue-600 font-semibold">{fmtARS(totalARS)}</span>
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 text-2xl leading-none"
          >
            ×
          </button>
        </div>

        {/* Lista */}
        <div className="flex-1 overflow-y-auto p-3 space-y-1">
          {cards.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-gray-300">
              <span className="text-5xl mb-3">🃏</span>
              <p className="text-sm">El carrito está vacío.</p>
            </div>
          ) : (
            <AnimatePresence initial={false}>
              {cards.map(card => (
                <motion.div
                  key={card.inventory_id}
                  layout
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{    opacity: 0, x:  20, height: 0, marginBottom: 0 }}
                  transition={{ duration: 0.15 }}
                  className="flex items-center gap-3 px-2.5 py-2 rounded-xl hover:bg-gray-50 group"
                >
                  {/* Thumbnail */}
                  <div className="w-8 h-11 rounded-lg bg-gray-100 overflow-hidden shrink-0 shadow-sm">
                    {card.image_url ? (
                      <img
                        src={card.image_url}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-base">🃏</div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-gray-800 truncate">
                      {card.nombre || '—'}
                      {card.holo && <span className="ml-1">✨</span>}
                    </p>
                    <p className="text-[10px] text-gray-400 truncate">
                      {[card.set_name, card.condicion].filter(Boolean).join(' · ')}
                    </p>
                  </div>

                  {/* Precio */}
                  <span className="text-xs font-bold text-blue-600 whitespace-nowrap shrink-0">
                    {fmtARS(card.sale_price_ars ?? card._ars_blue)}
                  </span>

                  {/* Botón quitar */}
                  <button
                    onClick={() => onRemove(card.inventory_id)}
                    title="Quitar del carrito"
                    className="w-6 h-6 flex items-center justify-center rounded-full
                               bg-gray-100 hover:bg-red-100
                               text-gray-400 hover:text-red-500
                               opacity-0 group-hover:opacity-100
                               transition-all text-sm shrink-0"
                  >
                    ×
                  </button>
                </motion.div>
              ))}
            </AnimatePresence>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 pb-4 pt-3 border-t border-gray-100 shrink-0 flex items-center gap-2">
          <button
            onClick={() => { onClear(); onClose() }}
            className="text-xs text-red-400 hover:text-red-600 font-medium transition px-2 py-2"
          >
            🗑 Vaciar
          </button>
          <div className="flex-1" />
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-100 text-gray-600 text-xs font-semibold
                       rounded-xl hover:bg-gray-200 transition whitespace-nowrap"
          >
            ← Seguir agregando
          </button>
          <button
            onClick={onContinue}
            disabled={!cards.length}
            className="px-4 py-2 bg-violet-600 text-white text-xs font-bold
                       rounded-xl hover:bg-violet-500 disabled:opacity-50 transition whitespace-nowrap"
          >
            ✨ Generar claim →
          </button>
        </div>
      </motion.div>
    </div>
  )
}
