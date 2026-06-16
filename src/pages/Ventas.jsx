import { useState, useRef, useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useVentas } from '../hooks/useVentas'
import { supabase }  from '../lib/supabase'
import { BarChart, Bar, XAxis, YAxis, Tooltip, Cell, ResponsiveContainer } from 'recharts'
import Spinner    from '../components/ui/Spinner'
import EmptyState from '../components/ui/EmptyState'
import { useI18n }   from '../lib/i18n'
import FinishBadge  from '../components/ui/FinishBadge'

const fmtARS = (n) => `$${Number(n || 0).toLocaleString('es-AR', { maximumFractionDigits: 0 })}`

const CANAL_LABEL = {
  claims:          '🃏 Claims',
  charly:          '👤 Charly',
  fuera_de_evento: '📍 Fuera de evento',
  instagram:       '📸 Instagram',
  whatsapp:        '💬 WhatsApp',
}
const canalLabel = (v) => CANAL_LABEL[v] ?? v ?? '—'

const CANALES_COLOR = {
  claims:          '#10B981',
  charly:          '#3B6BF5',
  fuera_de_evento: '#F59E0B',
  instagram:       '#E1306C',
  whatsapp:        '#25D366',
}

// ── Configuración de estados (labels se pasan como prop desde el componente padre) ──
const ESTADOS_CLS = {
  pendiente: { cls: 'bg-amber-100 text-amber-700',    dot: 'bg-amber-400'   },
  pagada:    { cls: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500' },
  deuda:     { cls: 'bg-red-100 text-red-700',         dot: 'bg-red-500'    },
  cancelada: { cls: 'bg-gray-100 text-gray-500',       dot: 'bg-gray-400'   },
}

// ── Dropdown de estado inline ─────────────────────────────────────────────────
function EstadoDropdown({ venta, onEstadoChange, loading, labels }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const cfgBase = ESTADOS_CLS[venta.estado] ?? ESTADOS_CLS.pendiente
  const cfg = { ...cfgBase, label: labels[venta.estado] ?? venta.estado }

  // Cerrar al clickear afuera
  useEffect(() => {
    if (!open) return
    const handler = (e) => { if (!ref.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const opciones = [
    {
      value: 'pagada',
      label: `✅ ${labels.pagada}`,
      sub:   labels.confirm,
      cls:   'hover:bg-emerald-50',
    },
    {
      value: 'pendiente',
      label: `⏳ ${labels.pendiente}`,
      sub:   labels.unconfirmed,
      cls:   'hover:bg-amber-50',
    },
    {
      value: 'deuda',
      label: `🏦 ${labels.deuda}`,
      sub:   labels.nodebts,
      cls:   'hover:bg-red-50',
    },
    ...(venta.inventory_id ? [{
      value: 'cancelada',
      label: `↩ ${labels.cancelada}`,
      sub:   labels.return_stock,
      cls:   'hover:bg-blue-50',
    }] : []),
  ]

  const handleSelect = async (valor) => {
    setOpen(false)
    if (valor === venta.estado) return
    await onEstadoChange(venta, valor)
  }

  return (
    <div ref={ref} className="relative inline-block">
      <button
        onClick={() => !loading && setOpen(o => !o)}
        disabled={loading}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium
          transition cursor-pointer select-none ${cfg.cls}
          ${loading ? 'opacity-60 cursor-not-allowed' : 'hover:opacity-80'}`}
      >
        <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
        {loading ? '…' : cfg.label}
        <svg className="w-3 h-3 ml-0.5 opacity-60" viewBox="0 0 12 12" fill="currentColor">
          <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 mt-1 z-50 bg-white rounded-xl shadow-xl border border-gray-100
                        min-w-[190px] py-1 overflow-hidden">
          {opciones.map(op => (
            <button
              key={op.value}
              onClick={() => handleSelect(op.value)}
              className={`w-full text-left px-4 py-2.5 transition ${op.cls}
                ${op.value === venta.estado ? 'opacity-40 cursor-default pointer-events-none' : ''}`}
            >
              <p className="text-sm font-medium text-gray-800">{op.label}</p>
              <p className="text-[11px] text-gray-400 mt-0.5">{op.sub}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Página principal ──────────────────────────────────────────────────────────
export default function Ventas() {
  const qc  = useQueryClient()
  const now = new Date()
  const [year,     setYear]     = useState(now.getFullYear())
  const [month,    setMonth]    = useState(now.getMonth() + 1)
  const [loadingId, setLoadingId] = useState(null)
  const [toast,    setToast]    = useState(null)
  const { t } = useI18n()

  const { data, isLoading } = useVentas(year, month)

  const MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

  // Labels traducidos para el dropdown de estado
  const estadoLabels = {
    pendiente:   t('ventas_status_pending'),
    pagada:      t('ventas_status_paid'),
    deuda:       t('ventas_status_debt'),
    cancelada:   t('ventas_status_returned'),
    confirm:     t('ventas_status_confirm'),
    unconfirmed: t('ventas_status_unconfirmed'),
    nodebts:     t('ventas_status_nodebts'),
    return_stock:t('ventas_status_return'),
  }

  const ventas = data ?? []

  const showToast = (msg, tipo = 'success') => {
    setToast({ msg, tipo })
    setTimeout(() => setToast(null), 2800)
  }

  // ── Cambiar estado de una venta ────────────────────────────────────────────
  const handleEstadoChange = async (venta, nuevoEstado) => {
    setLoadingId(venta.id)
    try {
      // 1. Actualizar el estado en sales
      const { error } = await supabase
        .from('sales')
        .update({ estado: nuevoEstado })
        .eq('id', venta.id)

      if (error) {
        showToast(`Error: ${error.message}`, 'error')
        return
      }

      // 2. Si "cancelada" → volver la carta al stock
      if (nuevoEstado === 'cancelada' && venta.inventory_id) {
        const { error: invErr } = await supabase
          .from('inventory')
          .update({
            status:     'disponible',
            estado:     'disponible',
            buyer_name: null,
          })
          .eq('id', venta.inventory_id)

        if (invErr) {
          showToast(`${t('ventas_toast_cancel_err')}${invErr.message}`, 'error')
        } else {
          showToast(t('ventas_toast_returned'))
        }
        qc.invalidateQueries({ queryKey: ['stock'] })
        qc.invalidateQueries({ queryKey: ['metricas'] })
      } else if (nuevoEstado === 'pagada') {
        showToast(t('ventas_toast_paid'))
      } else if (nuevoEstado === 'deuda') {
        showToast(t('ventas_toast_debt'))
        qc.invalidateQueries({ queryKey: ['deudas'] })
      } else {
        showToast(t('ventas_toast_updated'))
      }

      // Refrescar ventas
      qc.invalidateQueries({ queryKey: ['ventas'] })

    } finally {
      setLoadingId(null)
    }
  }

  // ── KPIs ───────────────────────────────────────────────────────────────────
  const totalFacturado = ventas.reduce((s, v) => s + (v.total_ars || 0), 0)
  const cobrado        = ventas.filter(v => v.estado === 'pagada').reduce((s, v) => s + (v.total_ars || 0), 0)
  const enDeuda        = ventas.filter(v => v.estado === 'deuda').reduce((s, v) => s + (v.total_ars || 0), 0)
  const pendiente      = totalFacturado - cobrado - enDeuda

  // ── Por canal ──────────────────────────────────────────────────────────────
  const porCanal = {}
  for (const v of ventas) {
    const c = v.channel || 'fuera_de_evento'
    porCanal[c] = (porCanal[c] || 0) + (v.total_ars || 0)
  }
  const canalData = Object.entries(porCanal).map(([key, monto]) => ({
    key, name: canalLabel(key), monto,
  }))

  const gananciaNeta = Math.round(totalFacturado * 0.3)

  return (
    <div className="space-y-5">

      {/* Toast */}
      {toast && (
        <div className={`fixed top-5 right-5 z-[100] px-4 py-3 rounded-xl shadow-lg text-sm font-medium
          transition-all ${toast.tipo === 'error'
            ? 'bg-red-600 text-white'
            : 'bg-gray-900 text-white'}`}>
          {toast.msg}
        </div>
      )}

      {/* Selector mes/año */}
      <div className="flex items-center gap-3 flex-wrap">
        <h2 className="font-extrabold text-gray-900 text-xl flex-1">{t('ventas_title')}</h2>
        <select value={month} onChange={e => setMonth(+e.target.value)}
          className="border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white">
          {MESES.map((m, i) => <option key={i} value={i+1}>{m}</option>)}
        </select>
        <input type="number" value={year} onChange={e => setYear(+e.target.value)}
          className="border border-gray-200 rounded-xl px-3 py-2 text-sm w-24 focus:outline-none focus:ring-2 focus:ring-blue-200" />
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: t('ventas_sold_this_month'), value: ventas.length,      sub: t('ventas_cards'),   color: 'text-blue-600'    },
          { label: t('ventas_total_billed'),    value: fmtARS(totalFacturado), sub: 'ARS',           color: 'text-gray-800'    },
          { label: t('ventas_collected'),       value: fmtARS(cobrado),    sub: 'ARS',               color: 'text-emerald-600' },
          { label: t('ventas_pending_debt'),    value: fmtARS(pendiente + enDeuda), sub: `${fmtARS(enDeuda)} ${t('ventas_in_debt')}`, color: 'text-amber-500' },
        ].map(k => (
          <div key={k.label} className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm">
            <p className="text-xs text-gray-400 mb-1">{k.label}</p>
            <p className={`text-2xl font-extrabold ${k.color}`}>{k.value}</p>
            <p className="text-xs text-gray-400 mt-0.5">{k.sub}</p>
          </div>
        ))}
      </div>

      {isLoading && (
        <div className="flex justify-center py-12">
          <Spinner size={32} className="text-blue-400" />
        </div>
      )}

      {!isLoading && ventas.length === 0 && (
        <EmptyState emoji="📊" title={t('ventas_no_sales')} sub="" />
      )}

      {!isLoading && ventas.length > 0 && (
        <div className="grid lg:grid-cols-2 gap-5">
          {/* Gráfico por canal */}
          <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
            <div className="mb-4">
              <h3 className="font-semibold text-gray-800">{t('ventas_by_channel')}</h3>
              <p className="text-xs text-gray-400">{MESES[month-1]} {year}</p>
            </div>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={canalData} barSize={40}>
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
                <Tooltip formatter={v => fmtARS(v)} />
                <Bar dataKey="monto" radius={[6,6,0,0]}>
                  {canalData.map((entry, i) => (
                    <Cell key={i} fill={CANALES_COLOR[entry.key] ?? '#6B7280'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <div className="mt-3 pt-3 border-t border-gray-100 flex justify-between items-center">
              <span className="text-sm text-gray-500">{t('ventas_net_profit')}</span>
              <span className="text-emerald-600 font-bold">+{fmtARS(gananciaNeta)}</span>
            </div>
          </div>

          {/* Detalle por canal */}
          <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
            <h3 className="font-semibold text-gray-800 mb-4">{t('ventas_channel_detail')}</h3>
            <div className="space-y-3">
              {canalData.map(c => {
                const pct = totalFacturado > 0 ? (c.monto / totalFacturado) * 100 : 0
                return (
                  <div key={c.key}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="font-medium text-gray-700">{c.name}</span>
                      <span className="text-gray-500">{fmtARS(c.monto)} · {pct.toFixed(0)}%</span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all"
                        style={{ width: `${pct}%`, background: CANALES_COLOR[c.key] ?? '#6B7280' }} />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* Tabla detalle */}
      {!isLoading && ventas.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <h3 className="font-semibold text-gray-800">
              {t('ventas_detail')} — {MESES[month-1]} {year}
            </h3>
            {/* Leyenda de estados */}
            <div className="hidden sm:flex items-center gap-3 text-xs text-gray-400">
              {[
                { key: 'pendiente', dot: 'bg-amber-400',   label: t('ventas_legend_pending') },
                { key: 'pagada',    dot: 'bg-emerald-500', label: t('ventas_legend_paid')    },
                { key: 'deuda',     dot: 'bg-red-500',     label: t('ventas_legend_debt')    },
                { key: 'cancelada', dot: 'bg-gray-400',    label: t('ventas_legend_stock')   },
              ].map(cfg => (
                <span key={cfg.key} className="flex items-center gap-1">
                  <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                  {cfg.label}
                </span>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                <tr>
                  {[t('ventas_col_date'),t('ventas_col_card'),t('ventas_col_channel'),t('ventas_col_buyer'),t('ventas_col_ars'),t('ventas_col_status')].map(h => (
                    <th key={h} className="px-4 py-3 text-left font-semibold whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {ventas.map(v => (
                  <tr key={v.id} className={`transition ${
                    v.estado === 'pagada'    ? 'bg-emerald-50/30' :
                    v.estado === 'deuda'     ? 'bg-red-50/30' :
                    v.estado === 'cancelada' ? 'bg-gray-50' :
                    'hover:bg-gray-50'
                  }`}>
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                      {v.fecha_venta
                        ? new Date(v.fecha_venta).toLocaleDateString('es-AR')
                        : '—'}
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-800">
                      <div className="flex flex-col gap-0.5">
                        <span>{v.card_name || '—'}</span>
                        <FinishBadge finish={v.finish} size="xs" />
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {canalLabel(v.channel)}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {v.buyer_name || '—'}
                    </td>
                    <td className={`px-4 py-3 font-semibold whitespace-nowrap ${
                      v.estado === 'cancelada' ? 'line-through text-gray-400' : 'text-blue-600'
                    }`}>
                      {fmtARS(v.total_ars)}
                    </td>
                    <td className="px-4 py-3">
                      <EstadoDropdown
                        venta={v}
                        onEstadoChange={handleEstadoChange}
                        loading={loadingId === v.id}
                        labels={estadoLabels}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>

              {/* Totales por estado */}
              <tfoot className="bg-gray-50 border-t-2 border-gray-200 text-xs font-semibold text-gray-600">
                <tr>
                  <td colSpan={4} className="px-4 py-3">
                    {t('ventas_total')} ({ventas.length} {t('ventas_total_sales')})
                  </td>
                  <td className="px-4 py-3 text-blue-600 whitespace-nowrap">
                    {fmtARS(totalFacturado)}
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-emerald-600">{fmtARS(cobrado)} {t('ventas_collected_label')}</span>
                    {enDeuda > 0 && <span className="text-red-500 ml-2">{fmtARS(enDeuda)} deuda</span>}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
