import { useState, useRef, useEffect } from 'react'
import { createPortal }   from 'react-dom'
import { supabase }       from '../../lib/supabase'

/**
 * Botones "✓ Cobrar" y "✕ Liberar" con confirmación via portal
 * (evita el clipping de overflow-x-auto en tablas)
 *
 * Props:
 *   inventoryId  – id de la fila en inventory
 *   buyerName    – nombre del comprador (para el mensaje)
 *   onDone       – callback después de ejecutar la acción
 */
export default function ReservaActions({ inventoryId, buyerName, onDone }) {
  const [confirm,  setConfirm]  = useState(null)  // 'cobrar' | 'liberar' | null
  const [loading,  setLoading]  = useState(false)
  const [pos,      setPos]      = useState({ top: 0, left: 0 })
  const containerRef = useRef(null)
  const portalRef    = useRef(null)

  /* Cerrar al hacer click afuera (del portal también) */
  useEffect(() => {
    if (!confirm) return
    const close = (e) => {
      if (
        containerRef.current?.contains(e.target) ||
        portalRef.current?.contains(e.target)
      ) return
      setConfirm(null)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [confirm])

  const execute = async () => {
    setLoading(true)
    try {
      if (confirm === 'cobrar') {
        await supabase
          .from('inventory')
          .update({ status: 'vendida', sold_at_date: new Date().toISOString() })
          .eq('id', inventoryId)
      } else if (confirm === 'liberar') {
        await supabase
          .from('inventory')
          .update({
            status:        'disponible',
            buyer_name:    null,
            buyer_contact: null,
            canal_reserva: null,
            reserved_at:   null,
          })
          .eq('id', inventoryId)
      }
    } finally {
      setLoading(false)
      setConfirm(null)
      onDone?.()
    }
  }

  const toggle = (which) => {
    if (confirm === which) { setConfirm(null); return }
    /* Calcular posición relativa al viewport para portal fixed */
    if (containerRef.current) {
      const r = containerRef.current.getBoundingClientRect()
      setPos({ top: r.top - 8, left: r.left })
    }
    setConfirm(which)
  }

  return (
    <>
      <div ref={containerRef} className="flex gap-1 items-center">
        <button
          onClick={() => toggle('cobrar')}
          className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition whitespace-nowrap
            ${confirm === 'cobrar'
              ? 'bg-emerald-500 text-white'
              : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'}`}
        >
          ✓ Cobrar
        </button>
        <button
          onClick={() => toggle('liberar')}
          className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition whitespace-nowrap
            ${confirm === 'liberar'
              ? 'bg-red-500 text-white'
              : 'bg-red-50 text-red-600 hover:bg-red-100'}`}
        >
          ✕ Liberar
        </button>
      </div>

      {/* Portal: el popover se renderiza en <body> → nunca clippeado */}
      {confirm && createPortal(
        <div
          ref={portalRef}
          style={{
            position:  'fixed',
            top:       pos.top,
            left:      pos.left,
            transform: 'translateY(-100%)',
            zIndex:    9999,
          }}
          className="bg-white border border-gray-200 rounded-xl shadow-2xl p-3 min-w-[230px] text-xs"
        >
          <p className="text-gray-700 font-medium mb-2.5 leading-snug">
            {confirm === 'cobrar'
              ? `¿Marcar como vendida${buyerName ? ` a ${buyerName}` : ''}?`
              : `¿Liberar reserva${buyerName ? ` de ${buyerName}` : ''}? Vuelve al stock.`}
          </p>
          <div className="flex gap-2">
            <button
              onClick={execute}
              disabled={loading}
              className={`flex-1 py-1.5 rounded-lg text-white text-xs font-bold transition
                disabled:opacity-50
                ${confirm === 'cobrar'
                  ? 'bg-emerald-500 hover:bg-emerald-400'
                  : 'bg-red-500 hover:bg-red-400'}`}
            >
              {loading ? '…' : 'Confirmar'}
            </button>
            <button
              onClick={() => setConfirm(null)}
              className="flex-1 py-1.5 bg-gray-100 rounded-lg text-gray-600
                         text-xs font-semibold hover:bg-gray-200 transition"
            >
              Cancelar
            </button>
          </div>
        </div>,
        document.body
      )}
    </>
  )
}
