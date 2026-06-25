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
      const [invRes, saleRes] = await Promise.all([
        supabase
          .from('inventory')
          .select(`id, sale_price_ars, price_ars_blue, condition, cards(name, image_url, card_number, language)`)
          .eq('store_id', STORE_ID)
          .eq('buyer_name', buyer)
          .or('status.eq.reservada,estado.eq.reservada'),
        supabase
          .from('sales')
          .select(`id, total_ars, notes, inventory_id, inventory:inventory_id(condition, cards(name, image_url, card_number, language))`)
          .eq('store_id', STORE_ID)
          .eq('buyer_name', buyer)
          .eq('estado', 'deuda'),
      ])
      const reservas = (invRes.data ?? []).map(c => ({
        _source: 'reserva', key: `i-${c.id}`, inventory_id: c.id, sale_id: null,
        sale_price_ars: c.sale_price_ars ?? c.price_ars_blue ?? null,
        condition: c.condition, cards: c.cards,
      }))
      const ventas = (saleRes.data ?? []).map(s => ({
        _source: 'venta', key: `s-${s.id}`, inventory_id: s.inventory_id, sale_id: s.id,
        sale_price_ars: s.total_ars ?? null,
        condition: s.inventory?.condition || '',
        cards: s.inventory?.cards || { name: s.notes },
      }))
      if (!cancelled) {
        setCartas([...reservas, ...ventas])
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
      const now = new Date().toISOString()
      const reservas = cartas.filter(c => c._source === 'reserva')
      const ventas   = cartas.filter(c => c._source === 'venta')

      // Reservas: inventory → vendida + registrar venta en sales
      if (reservas.length) {
        await supabase
          .from('inventory')
          .update({ status: 'vendida', estado: 'vendida', sold_at_date: now })
          .in('id', reservas.map(c => c.inventory_id))
        await supabase.from('sales').insert(reservas.map(c => ({
          store_id:     STORE_ID,
          channel:      'claims',
          buyer_name:   buyer || null,
          notes:        c.cards?.name || '',
          total_ars:    c.sale_price_ars ?? null,
          sold_at:      now,
          estado:       'pendiente',
          inventory_id: c.inventory_id,
        })))
      }
      // Ventas en deuda: la venta queda pagada
      if (ventas.length) {
        await supabase.from('sales').update({ estado: 'pagada' })
          .in('id', ventas.map(c => c.sale_id))
      }
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
          <h3 className="font-bold text-gray-800">🃏 Cartas en deuda · <span className="text-blue-600">{buyer}</span></h3>
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
            <p className="text-gray-400 text-sm text-center py-8">No hay cartas en deuda.</p>
          )}
          {!loading && cartas.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {cartas.map(c => (
                <ReservaCard key={c.key} c={c} />
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-100 shrink-0">
          {showConfirm ? (
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-gray-700 font-medium">
                ¿Saldar las {totalCartas} cartas (marcarlas como cobradas)?
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
                  ✓ Saldar todas (cobradas)
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
