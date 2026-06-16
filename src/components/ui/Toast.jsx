import { AnimatePresence, motion } from 'framer-motion'

export default function Toast({ mensaje, tipo = 'success', visible }) {
  const bg = tipo === 'success' ? 'bg-emerald-600' : tipo === 'warning' ? 'bg-amber-500' : 'bg-red-600'
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 40, scale: 0.9 }}
          animate={{ opacity: 1, y: 0,  scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.9 }}
          className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50
                      ${bg} text-white px-5 py-3 rounded-2xl shadow-lg
                      text-sm font-medium max-w-xs text-center pointer-events-none`}
        >
          {mensaje}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
