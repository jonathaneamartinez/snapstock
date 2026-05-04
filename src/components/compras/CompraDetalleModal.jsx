import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import Spinner from '../ui/Spinner'

const fmtARS = (n) =>
  n != null ? `$${Number(n).toLocaleString('es-AR', { maximumFractionDigits: 0 })}` : '—'
const fmtUSD = (n) =>
  n != null ? `U$D ${Number(n).toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'
const fmtFecha = (s) =>
  s ? new Date(s).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'

const ESTADO_CLS = {
  pagada:          'bg-emerald-100 text-emerald-700',
  deuda:           'bg-red-100     text-red-700',
  'deuda parcial': 'bg-amber-100   text-amber-700',
  pendiente:       'bg-amber-100   text-amber-700',
}

export default function CompraDetalleModal({ purchaseId, onClose }) {
  const [compra,   setCompra]   = useState(null)
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        // 1. Traer compra + items (sin join a cards — el FK no está en schema cache)
        const { data: compraData, error: errC } = await supabase
          .from('purchases')
          .select(`
            id, vendor_name, purchased_at,
            total_ars, total_usd, payment_status, notes,
            purchase_items(id, quantity, condition, price_ars, price_usd, card_id)
          `)
          .eq('id', purchaseId)
          .single()

        if (cancelled) return
        if (errC) { setError(errC.message); setLoading(false); return }

        // 2. Buscar datos de las cartas por card_id (query separado)
        const cardIds = (compraData.purchase_items ?? [])
          .map(i => i.card_id).filter(Boolean)

        let cardsMap = {}
        if (cardIds.length > 0) {
          const { data: cardsData } = await supabase
            .from('cards')
            .select('id, name, image_url')
            .in('id', cardIds)
          ;(cardsData ?? []).forEach(c => { cardsMap[c.id] = c })
        }

        // 3. Combinar items con sus cartas
        const itemsWithCards = (compraData.purchase_items ?? []).map(item => ({
          ...item,
          cards: cardsMap[item.card_id] ?? null,
        }))

        if (!cancelled) {
          setCompra({ ...compraData, purchase_items: itemsWithCards })
          setLoading(false)
        }
      } catch (e) {
        if (!cancelled) { setError(e.message); setLoading(false) }
      }
    })()
    return () => { cancelled = true }
  }, [purchaseId])

  const items      = compra?.purchase_items ?? []
  const totalItems = items.reduce((s, i) => s + (i.quantity || 1), 0)

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[88vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <div>
            <h3 className="font-bold text-gray-800">
              🛒 {compra?.vendor_name ?? '…'}
            </h3>
            <p className="text-xs text-gray-400 mt-0.5">
              {fmtFecha(compra?.purchased_at)} · {totalItems} cartas
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 text-2xl leading-none"
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {loading && (
            <div className="flex justify-center py-16">
              <Spinner size={32} className="text-blue-400" />
            </div>
          )}
          {error && (
            <p className="text-red-500 text-sm p-6">{error}</p>
          )}
          {!loading && !error && (
            <>
              {/* Resumen superior */}
              <div className="grid grid-cols-3 gap-3 p-5 border-b border-gray-100">
                <div className="bg-gray-50 rounded-xl p-3 text-center">
                  <p className="text-xs text-gray-400 mb-0.5">Total USD</p>
                  <p className="font-bold text-emerald-600">{fmtUSD(compra?.total_usd)}</p>
                </div>
                <div className="bg-gray-50 rounded-xl p-3 text-center">
                  <p className="text-xs text-gray-400 mb-0.5">Total ARS</p>
                  <p className="font-bold text-blue-600">{fmtARS(compra?.total_ars)}</p>
                </div>
                <div className="bg-gray-50 rounded-xl p-3 text-center">
                  <p className="text-xs text-gray-400 mb-0.5">Estado pago</p>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full
                    ${ESTADO_CLS[compra?.payment_status] ?? 'bg-gray-100 text-gray-600'}`}>
                    {compra?.payment_status ?? '—'}
                  </span>
                </div>
              </div>

              {/* Tabla de ítems */}
              {items.length === 0 ? (
                <p className="text-gray-400 text-sm text-center py-10">
                  No hay ítems registrados.
                </p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-500 text-xs uppercase sticky top-0">
                    <tr>
                      {['Carta', 'Cond.', 'Qty', 'P. USD', 'P. ARS'].map(h => (
                        <th key={h} className="px-4 py-2.5 text-left font-semibold whitespace-nowrap">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {items.map(item => (
                      <tr key={item.id} className="hover:bg-gray-50">
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2">
                            {item.cards?.image_url && (
                              <img
                                src={item.cards.image_url}
                                alt={item.cards?.name}
                                className="w-7 h-9 object-cover rounded shadow-sm bg-gray-100 shrink-0"
                              />
                            )}
                            <span className="font-medium text-gray-800 leading-tight">
                              {item.cards?.name || '—'}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-2.5">
                          {item.condition ? (
                            <span className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded font-medium">
                              {item.condition}
                            </span>
                          ) : '—'}
                        </td>
                        <td className="px-4 py-2.5 text-gray-700 font-medium">
                          {item.quantity ?? 1}
                        </td>
                        <td className="px-4 py-2.5 text-emerald-600 font-semibold whitespace-nowrap">
                          {fmtUSD(item.price_usd)}
                        </td>
                        <td className="px-4 py-2.5 text-blue-600 font-semibold whitespace-nowrap">
                          {fmtARS(item.price_ars)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {/* Notas */}
              {compra?.notes && (
                <div className="px-5 py-3 border-t border-gray-100">
                  <p className="text-xs text-gray-400 mb-1">Notas</p>
                  <p className="text-sm text-gray-600">{compra.notes}</p>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-gray-100 shrink-0 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-100 text-gray-600 text-sm font-medium rounded-xl hover:bg-gray-200 transition"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  )
}
