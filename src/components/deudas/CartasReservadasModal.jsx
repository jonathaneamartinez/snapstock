import { useState, useEffect } from 'react'
import { supabase }   from '../../lib/supabase'
import { STORE_ID }   from '../../constants'
import Spinner        from '../ui/Spinner'
import { useCardImage } from '../../hooks/useCardImage'

const fmtARS = (n) =>
  n != null ? `$${Number(n).toLocaleString('es-AR', { maximumFractionDigits: 0 })}` : '—'

function ReservaCard({ c }) {
  const [imgSrc, onImgError] = useCardImage(c.cards?.image_url, { name: c.cards?.name, number: c.cards?.card_number, lang: c.cards?.language })
  return (
    <div className="flex flex-col items-center text-center gap-1.5">
      {imgSrc
        ? <img src={imgSrc} alt={c.cards?.name} onError={onImgError}
            className="w-full aspect-[2.5/3.5] object-cover rounded-lg bg-gray-100 shadow-sm" />
        : <div className="w-full aspect-[2.5/3.5] bg-gray-100 rounded-lg flex items-center justify-center text-3xl">🃏</div>
      }
      <p className="text-xs font-semibold text-gray-800 leading-tight line-clamp-2">{c.cards?.name || '—'}</p>
      <p className="text-xs text-blue-600 font-bold">{fmtARS(c.sale_price_ars)}</p>
      {c.condition && (
        <span className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded font-medium">{c.condition}</span>
      )}
    </div>
  )
}

export default function CartasReservadasModal({ buyer, onClose, onDone }) {
  const [cartas,      setCartas]      = useState([])
  const [loading,     setLoading]     = useState(true)
  const [confirming,  setConfirming]  = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data } = await supabase
        .from('inventory')
        .select(`id, sale_price_ars, price_ars_blue, condition, cards(name, image_url, card_number, language)`)
        .eq('store_id', STORE_ID)
        .eq('buyer_name', buyer)
        .or('status.eq.reservada,estado.eq.reservada')
      if (!cancelled) {
        setCartas(data ?? [])
        setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [buyer])

  const totalARS    = cartas.reduce((s, c) => s + (c.sale_price_ars ?? 0), 0)
  const totalCartas = cartas.length

  const markAllSold = async () => {
    setConfirming(true)
    try {
      const ids = cartas.map(c => c.id)
      const now = new Date().toISOString()
      await supabase
        .from('inventory')
        .update({ status: 'vendida', estado: 'vendida', sold_at_date: now })
        .in('id', ids)
      // Registrar en sales para que aparezcan en Ventas del Mes
      await supabase.from('sales').insert(cartas.map(c => ({
        store_id:     STORE_ID,
        channel:      'claims',
        buyer_name:   buyer || null,
        notes:        c.cards?.name || '',
        total_ars:    c.sale_price_ars ?? c.price_ars_blue ?? null,
        sold_at:      now,
        estado:       'pendiente',
        inventory_id: c.id,
      })))
      onDone?.()
      onClose()
    } finally {
      setConfirming(false)
      setShowConfirm(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <h3 className="font-bold text-gray-800">🃏 Cartas reservadas · <span className="text-blue-600">{buyer}</span></h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-2xl leading-none">×</button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {loading && (
            <div className="flex justify-center py-12">
              <Spinner size={32} className="text-blue-400" />
            </div>
          )}
          {!loading && cartas.length === 0 && (
            <p className="text-gray-400 text-sm text-center py-8">No hay cartas reservadas.</p>
          )}
          {!loading && cartas.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {cartas.map(c => (
                <ReservaCard key={c.id} c={c} />
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-100 shrink-0">
          {showConfirm ? (
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-gray-700 font-medium">
                ¿Marcar las {totalCartas} cartas como vendidas?
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowConfirm(false)}
                  className="px-4 py-2 bg-gray-100 text-gray-600 text-sm font-medium rounded-xl hover:bg-gray-200 transition"
                >
                  Cancelar
                </button>
                <button
                  onClick={markAllSold}
                  disabled={confirming}
                  className="px-4 py-2 bg-emerald-500 text-white text-sm font-bold rounded-xl hover:bg-emerald-400 disabled:opacity-50 transition"
                >
                  {confirming ? '…' : 'Confirmar'}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm text-gray-600">
                <span className="font-bold text-gray-800">{totalCartas}</span> cartas ·
                Total: <span className="font-bold text-amber-600">{fmtARS(totalARS)}</span>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={onClose}
                  className="px-4 py-2 bg-gray-100 text-gray-600 text-sm font-medium rounded-xl hover:bg-gray-200 transition"
                >
                  Cerrar
                </button>
                <button
                  onClick={() => setShowConfirm(true)}
                  disabled={!cartas.length}
                  className="px-4 py-2 bg-emerald-500 text-white text-sm font-bold rounded-xl hover:bg-emerald-400 disabled:opacity-50 transition"
                >
                  ✓ Marcar todas como vendidas
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
