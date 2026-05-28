import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useI18n }               from '../lib/i18n'
import { usePurchases }          from '../hooks/usePurchases'
import Spinner                   from '../components/ui/Spinner'
import EmptyState                from '../components/ui/EmptyState'
import Toast                     from '../components/ui/Toast'
import CompraDetalleModal        from '../components/compras/CompraDetalleModal'
import RegistrarCompraModal      from '../components/compras/RegistrarCompraModal'

const fmtARS  = (n) => `$${Number(n || 0).toLocaleString('es-AR', { maximumFractionDigits: 0 })}`
const fmtUSD  = (n) => `U$D ${Number(n || 0).toLocaleString('en',  { maximumFractionDigits: 0 })}`
const fmtDate = (s) => s ? new Date(s).toLocaleDateString('es-AR', { day:'2-digit', month:'2-digit', year:'2-digit' }) : '—'

const ESTADO_CLS = {
  pagada:          'bg-emerald-100 text-emerald-700',
  pendiente:       'bg-amber-100   text-amber-700',
  'deuda parcial': 'bg-amber-100   text-amber-700',
  deuda:           'bg-red-100     text-red-700',
}

export default function Compras() {
  const { t } = useI18n()
  const qc = useQueryClient()
  const { data, isLoading, error } = usePurchases()

  const [detalleId,  setDetalleId]  = useState(null)   // id de compra para modal detalle
  const [showForm,   setShowForm]   = useState(false)
  const [toast,      setToast]      = useState({ visible: false, mensaje: '', tipo: 'success' })

  const showToast = (mensaje, tipo = 'success') => {
    setToast({ visible: true, mensaje, tipo })
    setTimeout(() => setToast(t => ({ ...t, visible: false })), 2500)
  }

  const refresh = () => qc.invalidateQueries({ queryKey: ['purchases'] })

  const compras = data ?? []

  // ── KPIs ──────────────────────────────────────────────────────────────
  const comprasMes   = compras.length
  const cartasTotal  = compras.reduce((s, c) => s + (c.cartas || 0), 0)
  const invertidoUSD = compras.reduce((s, c) => s + (c.total_usd || 0), 0)
  const invertidoARS = compras.reduce((s, c) => s + (c.total_ars || 0), 0)

  return (
    <div className="space-y-5">
      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: t('compras_kpi_registered'),   value: comprasMes,          sub: t('compras_sub_operations'), color: 'text-blue-600'    },
          { label: t('compras_kpi_cards_bought'),  value: cartasTotal,          sub: t('compras_sub_units'),      color: 'text-gray-800'    },
          { label: t('compras_kpi_invested_usd'),  value: fmtUSD(invertidoUSD), sub: t('compras_sub_accumulated'),color: 'text-amber-500'   },
          { label: t('compras_kpi_invested_ars'),  value: fmtARS(invertidoARS), sub: t('compras_sub_accumulated'),color: 'text-emerald-600' },
        ].map(k => (
          <div key={k.label} className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm">
            <p className="text-xs text-gray-400 mb-1">{k.label}</p>
            <p className={`text-2xl font-extrabold ${k.color}`}>{k.value}</p>
            <p className="text-xs text-gray-400 mt-0.5">{k.sub}</p>
          </div>
        ))}
      </div>

      {/* Historial */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-semibold text-gray-800">{t('compras_history')}</h3>
          <button
            onClick={() => setShowForm(true)}
            className="px-3 py-1.5 bg-blue-600 text-white text-xs font-semibold rounded-xl hover:bg-blue-500 transition"
          >
            {t('compras_add_btn')}
          </button>
        </div>

        {isLoading && (
          <div className="flex justify-center py-12">
            <Spinner size={32} className="text-blue-400" />
          </div>
        )}
        {error && (
          <p className="text-red-500 text-sm p-6">{error.message}</p>
        )}
        {!isLoading && compras.length === 0 && (
          <EmptyState emoji="📦" title={t('compras_no_purchases')} sub={t('compras_empty_sub')} />
        )}

        {!isLoading && compras.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                <tr>
                  {[t('compras_col_date'),t('compras_col_seller'),t('compras_col_cards'),t('compras_col_usd'),t('compras_col_ars_col'),t('compras_col_status'),''].map((h, i) => (
                    <th key={i} className="px-4 py-3 text-left font-semibold whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {compras.map(c => (
                  <tr key={c.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-500">{fmtDate(c.purchased_at)}</td>
                    <td className="px-4 py-3 font-medium text-gray-800">{c.vendor_name || '—'}</td>
                    <td className="px-4 py-3 text-gray-700">{c.cartas}</td>
                    <td className="px-4 py-3 text-emerald-600 font-semibold whitespace-nowrap">
                      {c.total_usd ? fmtUSD(c.total_usd) : '—'}
                    </td>
                    <td className="px-4 py-3 text-blue-600 font-semibold whitespace-nowrap">
                      {c.total_ars ? fmtARS(c.total_ars) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium
                        ${ESTADO_CLS[c.payment_status] ?? 'bg-gray-100 text-gray-600'}`}>
                        {c.payment_status || '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => setDetalleId(c.id)}
                        className="text-xs text-blue-600 hover:underline whitespace-nowrap"
                      >
                        {t('compras_view_detail')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Resumen financiero */}
      {compras.length > 0 && (
        <div className="grid lg:grid-cols-2 gap-3">
          <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm flex justify-between items-center">
            <span className="text-sm text-gray-500">{t('compras_total_usd')}</span>
            <span className="font-bold text-lg text-red-500">{fmtUSD(invertidoUSD)}</span>
          </div>
          <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm flex justify-between items-center">
            <span className="text-sm text-gray-500">{t('compras_total_ars_label')}</span>
            <span className="font-bold text-lg text-red-500">{fmtARS(invertidoARS)}</span>
          </div>
        </div>
      )}

      {/* Modal detalle */}
      {detalleId && (
        <CompraDetalleModal
          purchaseId={detalleId}
          onClose={() => setDetalleId(null)}
        />
      )}

      {/* Modal registrar */}
      {showForm && (
        <RegistrarCompraModal
          onClose={() => setShowForm(false)}
          onDone={() => {
            refresh()
            showToast(t('compras_registered_ok'))
          }}
        />
      )}

      <Toast mensaje={toast.mensaje} tipo={toast.tipo} visible={toast.visible} />
    </div>
  )
}
