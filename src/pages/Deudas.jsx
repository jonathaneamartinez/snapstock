import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useDeudas }              from '../hooks/useDeudas'
import Spinner                    from '../components/ui/Spinner'
import EmptyState                 from '../components/ui/EmptyState'
import Toast                      from '../components/ui/Toast'
import CanalReservaSelect         from '../components/deudas/CanalReservaSelect'
import ReservaActions             from '../components/deudas/ReservaActions'
import CartasReservadasModal      from '../components/deudas/CartasReservadasModal'

const fmtARS   = (n) => `$${Number(n || 0).toLocaleString('es-AR', { maximumFractionDigits: 0 })}`
const fmtFecha = (s) => s ? new Date(s).toLocaleDateString('es-AR') : '—'

export default function Deudas() {
  const qc = useQueryClient()
  const { data, isLoading, error } = useDeudas()

  const [verCartasBuyer, setVerCartasBuyer] = useState(null) // buyer name
  const [toast, setToast] = useState({ visible: false, mensaje: '', tipo: 'success' })

  const showToast = (mensaje, tipo = 'success') => {
    setToast({ visible: true, mensaje, tipo })
    setTimeout(() => setToast(t => ({ ...t, visible: false })), 2500)
  }

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['deudas'] })
    qc.invalidateQueries({ queryKey: ['stock'] })
    qc.invalidateQueries({ queryKey: ['metricas'] })
  }

  // ── KPIs ───────────────────────────────────────────────────────────────────
  const reservasActivas = data?.reduce((s, d) => s + d.items.length, 0) ?? 0
  const deudaTotal      = data?.reduce((s, d) => s + d.total, 0) ?? 0
  const ahora           = Date.now()
  const vencidos        = data?.filter(d =>
    d.items.some(i => {
      const ts = new Date(i.reserved_at || Date.now()).getTime()
      return (ahora - ts) / 86400000 > 7
    })
  ).length ?? 0

  return (
    <div className="space-y-5">
      {/* KPIs */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm">
          <p className="text-xs text-gray-400 mb-1">Reservas activas</p>
          <p className="text-2xl font-extrabold text-amber-500">{reservasActivas} cartas</p>
          <p className="text-xs text-gray-400 mt-0.5">en poder de clientes</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm">
          <p className="text-xs text-gray-400 mb-1">Deuda total</p>
          <p className="text-2xl font-extrabold text-gray-800">{fmtARS(deudaTotal)}</p>
          <p className="text-xs text-gray-400 mt-0.5">ARS pendiente</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm">
          <p className="text-xs text-gray-400 mb-1">Vencidas +7 días</p>
          <p className="text-2xl font-extrabold text-red-500">{vencidos} clientes</p>
          <p className="text-xs text-gray-400 mt-0.5">requieren seguimiento</p>
        </div>
      </div>

      {/* Tabla compradores */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-semibold text-gray-800">Compradores con reservas activas</h3>
        </div>

        {isLoading && <div className="flex justify-center py-12"><Spinner size={32} className="text-blue-400" /></div>}
        {error     && <p className="text-red-500 text-sm p-6">{error.message}</p>}
        {!isLoading && data?.length === 0 && (
          <EmptyState emoji="🎉" title="Sin deudas activas" sub="Todo cobrado" />
        )}

        {!isLoading && data?.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                <tr>
                  {['Comprador','Contacto','Cartas','Monto ARS','F. Reserva','Canal','Estado','Acción'].map(h => (
                    <th key={h} className="px-4 py-3 text-left font-semibold whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.map(d => {
                  const estado = d.total > 0 ? 'pendiente' : 'cobrado'
                  const fechaReserva = fmtFecha(d.items[0]?.reserved_at || d.items[0]?.created_at)
                  // Canal de la primera carta (mostrar si todas coinciden, sino "varios")
                  const canales = [...new Set(d.items.map(i => i.canal_reserva).filter(Boolean))]
                  const canal   = canales.length === 1 ? canales[0] : (canales.length > 1 ? 'varios' : null)

                  return (
                    <tr key={d.buyer} className="hover:bg-gray-50 align-middle">
                      <td className="px-4 py-3 font-semibold text-gray-800">{d.buyer}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{d.contact || '—'}</td>
                      <td className="px-4 py-3 font-medium text-gray-700 text-center">{d.items.length}</td>
                      <td className="px-4 py-3 font-bold text-amber-600 whitespace-nowrap">{fmtARS(d.total)}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">{fechaReserva}</td>

                      {/* Canal (Feature 4) — selector sobre la primera carta de este comprador */}
                      <td className="px-4 py-3">
                        {d.items.length === 1
                          ? (
                            <CanalReservaSelect
                              inventoryId={d.items[0].inventory_id}
                              value={d.items[0].canal_reserva}
                              onSaved={() => refresh()}
                            />
                          )
                          : (
                            <span className="text-xs text-gray-400">
                              {canal ?? '—'}
                            </span>
                          )
                        }
                      </td>

                      {/* Estado */}
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium
                          ${estado === 'cobrado' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                          {estado}
                        </span>
                      </td>

                      {/* Acción (Feature 5 + Feature 6) */}
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1.5 items-center">
                          {/* Cobrar/Liberar solo si hay 1 item; si hay más, botones individuales en subfilas */}
                          {d.items.length === 1 && (
                            <ReservaActions
                              inventoryId={d.items[0].inventory_id}
                              buyerName={d.buyer}
                              onDone={() => {
                                refresh()
                                showToast('Reserva actualizada')
                              }}
                            />
                          )}
                          {/* Ver cartas (Feature 6) */}
                          <button
                            onClick={() => setVerCartasBuyer(d.buyer)}
                            className="px-2.5 py-1 bg-blue-50 text-blue-600 text-xs font-semibold rounded-lg hover:bg-blue-100 transition whitespace-nowrap"
                          >
                            🃏 Ver cartas
                          </button>
                        </div>

                        {/* Si hay más de una carta, mostrar acciones individuales */}
                        {d.items.length > 1 && (
                          <div className="mt-2 space-y-1">
                            {d.items.map(item => (
                              <div key={item.inventory_id} className="flex items-center gap-2 pl-1">
                                <span className="text-[10px] text-gray-400 truncate max-w-[80px]">
                                  {item.nombre_base || '—'}
                                </span>
                                <ReservaActions
                                  inventoryId={item.inventory_id}
                                  buyerName={d.buyer}
                                  onDone={() => {
                                    refresh()
                                    showToast('Reserva actualizada')
                                  }}
                                />
                              </div>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal cartas reservadas (Feature 6) */}
      {verCartasBuyer && (
        <CartasReservadasModal
          buyer={verCartasBuyer}
          onClose={() => setVerCartasBuyer(null)}
          onDone={() => {
            refresh()
            showToast('Cartas marcadas como vendidas')
          }}
        />
      )}

      <Toast mensaje={toast.mensaje} tipo={toast.tipo} visible={toast.visible} />
    </div>
  )
}
