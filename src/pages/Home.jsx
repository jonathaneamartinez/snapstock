import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useMetricas } from '../hooks/useMetricas'
import { useVentas }   from '../hooks/useVentas'
import { useDolar }    from '../hooks/useDolar'
import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, Tooltip, Legend,
  ResponsiveContainer, CartesianGrid
} from 'recharts'

// ── Formatters ──────────────────────────────────────────────────────────────
const fmtARS  = (n) => n != null ? `$${Number(n).toLocaleString('es-AR', { maximumFractionDigits: 0 })}` : '—'
const fmtUSD  = (n) => n != null ? `U$D ${Number(n).toLocaleString('en',    { maximumFractionDigits: 0 })}` : '—'
const fmtK    = (n) => {
  if (n == null) return '—'
  if (n >= 1_000_000) return `$${(n/1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `$${(n/1_000).toFixed(0)}k`
  return `$${Number(n).toFixed(0)}`
}

// Canal → tipo
const esPresencial = (ch) => ch && ch !== 'Claims' && ch !== 'claim' && ch !== 'WhatsApp'
const esClain      = (ch) => ch === 'Claims' || ch === 'claim' || ch === 'WhatsApp'

const SEMANA_LABEL = ['', '1ra', '2da', '3ra', '4ta', '5ta']
const semana = (dateStr) => Math.min(5, Math.ceil(new Date(dateStr).getDate() / 7))

// ── Mini Sparkline ───────────────────────────────────────────────────────────
function Sparkline({ weeks, color }) {
  const data = SEMANA_LABEL.slice(1).map((l, i) => ({ s: l, v: weeks[i+1] || 0 }))
  return (
    <ResponsiveContainer width={88} height={40}>
      <BarChart data={data} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
        <Bar dataKey="v" fill={color} radius={[3,3,0,0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}

// ── KPI Card ────────────────────────────────────────────────────────────────
function KpiCard({ icon, label, value, sub, color, bgColor, weeks, sparkColor, loading }) {
  return (
    <div className={`bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-col gap-2`}>
      <div className="flex items-start justify-between">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-lg ${bgColor}`}>
          {icon}
        </div>
        <Sparkline weeks={weeks} color={sparkColor} />
      </div>
      <div>
        <p className="text-xs text-gray-400">{label}</p>
        {loading
          ? <div className="h-7 w-24 bg-gray-100 rounded-lg animate-pulse mt-1" />
          : <p className={`text-2xl font-extrabold leading-tight ${color}`}>{value}</p>
        }
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}

// ── Badge canal ──────────────────────────────────────────────────────────────
function CanalBadge({ channel }) {
  if (esClain(channel)) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold
                       bg-green-100 text-green-700">
        💬 Claim
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold
                     bg-blue-100 text-blue-700">
      🏪 Presencial
    </span>
  )
}

// ── Tooltip personalizado chart ──────────────────────────────────────────────
function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-lg px-3 py-2 text-xs">
      <p className="font-semibold text-gray-600 mb-1">Semana {label}</p>
      {payload.map(p => (
        <p key={p.name} style={{ color: p.color }} className="font-medium">
          {p.name}: {fmtARS(p.value)}
        </p>
      ))}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
export default function Home() {
  const now = new Date()
  const { data: m, isLoading: mLoad } = useMetricas()
  const { data: ventas = [] }          = useVentas(now.getFullYear(), now.getMonth() + 1)
  const { blue, oficial }              = useDolar()

  // ── Ventas por semana y canal ─────────────────────────────────────────────
  const { chartData, semanaMap, totalPresencial, totalClaims } = useMemo(() => {
    const map = {}  // { semana: { Presencial, Claims, Charly, 'Fuera de eventos' } }
    let tp = 0, tc = 0

    for (const v of ventas) {
      const s  = semana(v.created_at)
      const ch = v.channel || 'Fuera de eventos'
      if (!map[s]) map[s] = { s: SEMANA_LABEL[s], Presencial: 0, Claims: 0, Charly: 0, 'Fuera de eventos': 0 }
      const monto = v.total_ars_blue || 0
      if (esClain(ch))      { map[s].Claims     += monto; tc += monto }
      else                  { map[s].Presencial  += monto; tp += monto
                              if (ch === 'Charly') map[s].Charly += monto
                              else                  map[s]['Fuera de eventos'] += monto
                            }
    }

    const chartData = Object.values(map).sort((a, b) => a.s.localeCompare(b.s))

    // semanaMap para sparklines: { [semNum]: total }
    const semanaMap = {}
    for (const v of ventas) {
      const s = semana(v.created_at)
      semanaMap[s] = (semanaMap[s] || 0) + (v.total_ars_blue || 0)
    }

    return { chartData, semanaMap, totalPresencial: tp, totalClaims: tc }
  }, [ventas])

  const totalVentas = totalPresencial + totalClaims
  const pctClaims   = totalVentas > 0 ? Math.round((totalClaims / totalVentas) * 100) : 0

  // Sparkline weeks vacías si no hay datos
  const flatWeeks = { 1:0,2:0,3:0,4:0,5:0 }

  return (
    <div className="space-y-5">

      {/* ── Top bar ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-4
                        flex items-center gap-3">
          <span className="text-xl">🃏</span>
          <div>
            <p className="text-xs text-gray-400">Cartas en stock</p>
            <p className="text-2xl font-extrabold text-gray-900">
              {mLoad ? '…' : (m?.totalCartas ?? 0).toLocaleString('es-AR')}
            </p>
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-4
                        flex items-center justify-between gap-3">
          <div>
            <p className="text-xs text-gray-400">Tipo de cambio</p>
            <p className="text-sm font-semibold text-gray-700">
              Blue: {blue ? fmtARS(blue) : '…'} · Oficial: {oficial ? fmtARS(oficial) : '…'}
            </p>
          </div>
          <Link to="/ingresos"
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm
                       font-semibold rounded-xl transition whitespace-nowrap shrink-0">
            + Agregar
          </Link>
        </div>
      </div>

      {/* ── KPI cards ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          icon="💵" label="Cartas en Dólares"
          value={fmtUSD(m?.valorUSD)}
          sub="valor de stock"
          color="text-emerald-600" bgColor="bg-emerald-50"
          sparkColor="#10B981" weeks={semanaMap}
          loading={mLoad}
        />
        <KpiCard
          icon="🏦" label="Cartas en Pesos"
          value={fmtK(m?.valorARSOficial ?? (m?.valorUSD != null && oficial ? m.valorUSD * oficial : null))}
          sub="ARS oficial"
          color="text-orange-600" bgColor="bg-orange-50"
          sparkColor="#F97316" weeks={semanaMap}
          loading={mLoad}
        />
        <KpiCard
          icon="📈" label="Cartas en Blue"
          value={fmtK(m?.valorARSBlue ?? (m?.valorUSD != null && blue ? m.valorUSD * blue : null))}
          sub="ARS blue"
          color="text-blue-600" bgColor="bg-blue-50"
          sparkColor="#3B6BF5" weeks={semanaMap}
          loading={mLoad}
        />
        <KpiCard
          icon="⏳" label="Deudas activas"
          value={fmtARS(m?.deudasActivas)}
          sub={`${m?.cantReservadas ?? 0} reservadas`}
          color="text-red-500" bgColor="bg-red-50"
          sparkColor="#EF4444" weeks={flatWeeks}
          loading={mLoad}
        />
      </div>

      {/* ── Ventas del mes ──────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">

        {/* Header */}
        <div className="flex items-start justify-between mb-4 flex-wrap gap-3">
          <div>
            <h3 className="font-bold text-gray-800 text-base">Ventas del mes</h3>
            <p className="text-xs text-gray-400 mt-0.5">
              {now.toLocaleString('es-AR', { month: 'long', year: 'numeric' })}
            </p>
          </div>
          {totalVentas > 0 && (
            <div className="flex items-center gap-3">
              <div className="text-right">
                <p className="text-xs text-gray-400">Total</p>
                <p className="font-bold text-gray-800">{fmtARS(totalVentas)}</p>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-[11px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-semibold">
                  🏪 {100 - pctClaims}% presencial
                </span>
                <span className="text-[11px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-semibold">
                  💬 {pctClaims}% claims
                </span>
              </div>
            </div>
          )}
        </div>

        {chartData.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-gray-300 gap-2">
            <span className="text-4xl">📊</span>
            <p className="text-sm">Sin ventas registradas este mes</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={chartData} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="s" tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false}
                tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
              <Tooltip content={<CustomTooltip />} />
              <Legend
                formatter={(v) => (
                  <span className="text-xs text-gray-600 font-medium">{v}</span>
                )}
              />
              <Line type="monotone" dataKey="Charly"
                stroke="#3B6BF5" strokeWidth={2.5} dot={false} />
              <Line type="monotone" dataKey="Claims"
                stroke="#10B981" strokeWidth={2.5} dot={false}
                strokeDasharray="6 3"   /* Claims = WhatsApp → línea punteada */
              />
              <Line type="monotone" dataKey="Fuera de eventos"
                stroke="#F59E0B" strokeWidth={2.5} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        )}

        {/* Leyenda extra: presencial vs claim */}
        {chartData.length > 0 && (
          <div className="mt-3 pt-3 border-t border-gray-100 grid grid-cols-2 gap-3 text-sm">
            <div className="flex items-center justify-between bg-blue-50 rounded-xl px-3 py-2">
              <span className="text-blue-600 font-medium flex items-center gap-1.5">
                <span className="w-3 h-0.5 bg-blue-500 inline-block rounded" />
                Presencial
              </span>
              <span className="font-bold text-blue-700">{fmtARS(totalPresencial)}</span>
            </div>
            <div className="flex items-center justify-between bg-green-50 rounded-xl px-3 py-2">
              <span className="text-green-600 font-medium flex items-center gap-1.5">
                <span className="w-3 border-t-2 border-dashed border-green-500 inline-block" />
                Claims (WhatsApp)
              </span>
              <span className="font-bold text-green-700">{fmtARS(totalClaims)}</span>
            </div>
          </div>
        )}
      </div>

      {/* ── Últimas ventas ───────────────────────────────────────────────── */}
      {ventas.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <h3 className="font-bold text-gray-800">Últimas ventas</h3>
            <Link to="/ventas" className="text-xs text-blue-600 hover:underline font-medium">
              Ver todas →
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 text-gray-400 uppercase">
                <tr>
                  {['Fecha','Carta','Canal','Comprador','Monto'].map(h => (
                    <th key={h} className="px-4 py-3 text-left font-semibold whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {ventas.slice(0, 8).map(v => (
                  <tr key={v.id} className="hover:bg-gray-50 transition">
                    <td className="px-4 py-2.5 text-gray-400 whitespace-nowrap">
                      {new Date(v.created_at).toLocaleDateString('es-AR')}
                    </td>
                    <td className="px-4 py-2.5 font-medium text-gray-800 max-w-[160px]">
                      <span className="truncate block">{v.card_name || '—'}</span>
                    </td>
                    <td className="px-4 py-2.5">
                      <CanalBadge channel={v.channel} />
                    </td>
                    <td className="px-4 py-2.5 text-gray-500">{v.buyer_name || '—'}</td>
                    <td className="px-4 py-2.5 font-bold text-blue-600 whitespace-nowrap">
                      {fmtARS(v.total_ars_blue)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

    </div>
  )
}
