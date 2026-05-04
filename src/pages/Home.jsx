import { useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMetricas }       from '../hooks/useMetricas'
import { useVentas }         from '../hooks/useVentas'
import { useDolar }          from '../hooks/useDolar'
import { useDeudas }         from '../hooks/useDeudas'
import { useLastClaim }      from '../hooks/useLastClaim'
import { useTop5Cards }      from '../hooks/useTop5Cards'
import { usePurchasesMonth } from '../hooks/usePurchasesMonth'
import {
  LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid,
} from 'recharts'

// ── Design tokens exactos del Figma ──────────────────────────────────────────
const C = {
  pageBg:    '#F8F9FA',
  card:      '#FFFFFF',
  inner:     '#F8F9FA',
  border:    '#DBE0E5',
  text:      '#1D2630',
  sub:       '#5B6B79',
  // Blue
  blue:      '#4680FF',
  blue10:    '#E9F0FF',
  blue20:    '#C8D9FF',
  blueBg:    '#EDF3FF',
  // Green
  green:     '#2CA87F',
  green80:   '#4CB592',
  greenBg:   '#EBFAF5',
  // Orange
  orange:    '#E68A00',
  orangeBg:  '#FFF5E5',
  // Red
  red:       '#DC2626',
  red80:     '#E14747',
  redBg:     '#FFFAFA',
}

// ── Formatters ────────────────────────────────────────────────────────────────
const fmtARS = (n) =>
  n != null ? `$${Number(n).toLocaleString('es-AR', { maximumFractionDigits: 0 })}` : '—'
const fmtUSD = (n) =>
  n != null ? `usd ${Number(n).toLocaleString('en', { maximumFractionDigits: 0 })}` : '—'
const fmtK = (n) => {
  if (n == null) return '—'
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(0)}k`
  return `$${Math.round(n)}`
}

const esClain = (ch) =>
  ch === 'Claims' || ch === 'claim' || ch === 'WhatsApp' ||
  (ch && ch.toLowerCase().includes('claim'))

const SEMANA_LABEL = { 1: 'Sem 1', 2: 'Sem 2', 3: 'Sem 3', 4: 'Sem 4', 5: 'Sem 5' }
const semanaIdx = (dateStr) => Math.min(5, Math.ceil(new Date(dateStr).getDate() / 7))

// ── SparkBars: mini barchart alineado al fondo (igual que Figma) ───────────
function SparkBars({ data = [], color, dimColor }) {
  const max = Math.max(...data, 1)
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-end', gap: 2, height: 48, flex: 1,
    }}>
      {data.map((v, i) => (
        <div
          key={i}
          style={{
            flex: 1,
            height: `${Math.max(6, Math.round((v / max) * 100))}%`,
            background: v > 0 ? color : (dimColor || color + '40'),
            borderRadius: 1,
            minHeight: 6,
          }}
        />
      ))}
    </div>
  )
}

// ── KpiCard ────────────────────────────────────────────────────────────────
function KpiCard({ iconBg, iconEl, label, value, trendPct, trendColor, sparkData, sparkColor, sparkDimColor, loading, to }) {
  const navigate = useNavigate()
  return (
    <div
      onClick={() => to && navigate(to)}
      style={{
        background: C.card, border: `1px solid ${C.border}`, borderRadius: 8,
        padding: 15, display: 'flex', flexDirection: 'column', gap: 20,
        cursor: to ? 'pointer' : 'default',
        transition: 'box-shadow 0.15s, border-color 0.15s',
      }}
      onMouseEnter={e => { if (to) { e.currentTarget.style.boxShadow = '0 4px 16px rgba(70,128,255,0.12)'; e.currentTarget.style.borderColor = C.blue20 } }}
      onMouseLeave={e => { if (to) { e.currentTarget.style.boxShadow = ''; e.currentTarget.style.borderColor = C.border } }}
    >
      {/* Icon + label */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{
          width: 40, height: 40, background: iconBg, borderRadius: 8,
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          {iconEl}
        </div>
        <span style={{ fontFamily: 'Inter, sans-serif', fontWeight: 500, fontSize: 14, color: C.text, lineHeight: '22px' }}>
          {label}
        </span>
      </div>

      {/* Inner card: sparkline + valor + trend */}
      <div style={{
        background: C.inner, borderRadius: 8, padding: 15,
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 20,
      }}>
        <SparkBars data={sparkData} color={sparkColor} dimColor={sparkDimColor} />

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
          {loading
            ? <div style={{ width: 64, height: 22, background: C.border, borderRadius: 4 }} />
            : <span style={{ fontFamily: 'Inter, sans-serif', fontWeight: 600, fontSize: 14, color: C.text, lineHeight: '22px', whiteSpace: 'nowrap' }}>
                {value}
              </span>
          }
          {trendPct != null && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {/* flecha send rotada → ↗ */}
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ transform: 'scaleX(-1)' }}>
                <path d="M2 14L14 2M14 2H8.5M14 2V7.5" stroke={trendColor} strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M2 14L14 2" stroke={trendColor} strokeWidth="1.2" strokeLinecap="round" opacity="0.4"/>
              </svg>
              <span style={{ fontFamily: 'Inter, sans-serif', fontWeight: 500, fontSize: 12, color: trendColor, lineHeight: '20px' }}>
                {trendPct}%
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── LegendDot ─────────────────────────────────────────────────────────────
function LegendDot({ color, label }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{ width: 9, height: 9, borderRadius: '50%', background: color, flexShrink: 0 }} />
      <span style={{ fontFamily: 'Inter, sans-serif', fontWeight: 400, fontSize: 12, color: C.text }}>
        {label}
      </span>
    </div>
  )
}

// ── Tooltip del gráfico ───────────────────────────────────────────────────
function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: C.card, border: `1px solid ${C.border}`, borderRadius: 8,
      padding: '8px 12px', fontSize: 12, fontFamily: 'Inter, sans-serif',
      boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
    }}>
      <p style={{ fontWeight: 600, color: C.sub, marginBottom: 4 }}>{label}</p>
      {payload.map(p => (
        <p key={p.name} style={{ color: p.color, fontWeight: 500, margin: '2px 0' }}>
          {p.name}: {fmtARS(p.value)}
        </p>
      ))}
    </div>
  )
}

// ── MiniLineChart SVG (para Ingresos/Egresos) ────────────────────────────
function MiniLineChart({ data = [], color, flip = false }) {
  const W = 102, H = 56
  const max = Math.max(...data, 1)
  const pts = data.map((v, i) => [
    (i / Math.max(data.length - 1, 1)) * W,
    H - (v / max) * (H * 0.8) - H * 0.1,
  ])
  const linePath  = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')
  const fillPath  = `${linePath} L${W},${H} L0,${H} Z`
  const gradId    = `mg${color.replace('#', '')}`
  return (
    <svg width={W} height={H} style={flip ? { transform: 'scaleX(-1)' } : {}}>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor={color} stopOpacity={0.4} />
          <stop offset="100%" stopColor={color} stopOpacity={0}   />
        </linearGradient>
      </defs>
      <path d={fillPath} fill={`url(#${gradId})`} />
      <path d={linePath} stroke={color} strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// ── WalletIcon ────────────────────────────────────────────────────────────
function WalletIcon({ color }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path d="M2 9h20M6 3h12C20.21 3 21 3.79 21 6v12c0 2.21-.79 3-3 3H6c-2.21 0-3-.79-3-3V6c0-2.21.79-3 3-3z"
        stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M7 15h2" stroke={color} strokeWidth="1.5" strokeLinecap="round" opacity="0.4"/>
      <path d="M11.5 15h4" stroke={color} strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  )
}

// ── ArrowDownCircleIcon ───────────────────────────────────────────────────
function ArrowDownCircleIcon({ color }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <rect x="2" y="2" width="20" height="20" rx="10"
        stroke={color} strokeWidth="1.5"/>
      <path d="M12 8v4" stroke={color} strokeWidth="1.5" strokeLinecap="round" opacity="0.4"/>
      <path d="M9 14l3 3 3-3"
        stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

// ── CanalBadge ────────────────────────────────────────────────────────────
function CanalBadge({ channel }) {
  if (esClain(channel)) {
    return (
      <span style={{
        background: '#DCFCE7', color: '#15803D',
        padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 500,
      }}>💬 Claim</span>
    )
  }
  return (
    <span style={{
      background: C.blueBg, color: C.blue,
      padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 500,
    }}>🏪 Presencial</span>
  )
}

// ════════════════════════════════════════════════════════════════════════════
export default function Home() {
  const now = new Date()
  const yr  = now.getFullYear()
  const mo  = now.getMonth() + 1

  const { data: m,       isLoading: mLoad } = useMetricas()
  const { data: ventas = [] }               = useVentas(yr, mo)
  const { blue, oficial }                   = useDolar()
  const { data: deudas = [] }               = useDeudas()
  const { data: lastClaim }                 = useLastClaim()
  const { data: top5 = [] }                 = useTop5Cards(yr, mo)
  const { data: compras }                   = usePurchasesMonth(yr, mo)

  // ── Aggregations ─────────────────────────────────────────────────────────
  const { chartData, semanaMap, totalPresencial, totalClaims } = useMemo(() => {
    const map = {}
    let tp = 0, tc = 0

    for (const v of ventas) {
      const s  = semanaIdx(v.fecha_venta || v.sold_at || v.created_at)
      const ch = v.channel || ''
      if (!map[s]) map[s] = { s: SEMANA_LABEL[s], Charly: 0, Claims: 0, 'Fuera de eventos': 0 }
      const monto = v.total_ars_blue || v.total_ars || 0
      if (esClain(ch))        { map[s].Claims += monto; tc += monto }
      else if (ch === 'Charly') { map[s].Charly += monto; tp += monto }
      else                      { map[s]['Fuera de eventos'] += monto; tp += monto }
    }

    const semanaMap = {}
    for (const v of ventas) {
      const s = semanaIdx(v.fecha_venta || v.sold_at || v.created_at)
      semanaMap[s] = (semanaMap[s] || 0) + (v.total_ars_blue || v.total_ars || 0)
    }

    return {
      chartData: [1,2,3,4,5]
        .filter(s => map[s])
        .map(s => map[s]),
      semanaMap,
      totalPresencial: tp,
      totalClaims:     tc,
    }
  }, [ventas])

  const totalVentas = totalPresencial + totalClaims
  const pctClaims   = totalVentas > 0 ? Math.round((totalClaims / totalVentas) * 100) : 0
  const weekArr     = [1,2,3,4,5].map(i => semanaMap[i] || 0)
  const zeroArr     = [0,0,0,0,0]

  // KPI values
  const kpiUSD     = m?.valorUSD
  const kpiARSOfic = m?.valorARSOficial ?? (kpiUSD != null && oficial ? kpiUSD * oficial : null)
  const kpiARSBlue = m?.valorARSBlue    ?? (kpiUSD != null && blue    ? kpiUSD * blue    : null)
  const kpiDeudas  = m?.deudasActivas

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, fontFamily: 'Inter, sans-serif' }}>

      {/* ── Top bar ──────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 16 }}>
        {/* Cartas en stock */}
        <div style={{
          flex: 1, background: C.card, border: `1px solid ${C.border}`, borderRadius: 8,
          padding: '15px', display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <span style={{ fontWeight: 500, fontSize: 14, color: C.text, lineHeight: '22px' }}>
            Cartas en stock:
          </span>
          <span style={{ fontWeight: 600, fontSize: 14, color: C.text, lineHeight: '22px' }}>
            {mLoad ? '…' : (m?.totalCartas ?? 0).toLocaleString('es-AR')}
          </span>
        </div>

        {/* Nuevos ingresos + Agregar */}
        <div style={{
          flex: 1, background: C.card, border: `1px solid ${C.border}`, borderRadius: 8,
          padding: '15px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <span style={{ fontWeight: 500, fontSize: 14, color: C.text, lineHeight: '22px' }}>
            Nuevos ingresos
          </span>
          <Link to="/ingresos" style={{
            background: C.blue, color: '#fff', borderRadius: 60,
            padding: '4px 18px', fontSize: 12, fontWeight: 500, textDecoration: 'none',
            boxShadow: '0px 2px 0px rgba(0,0,0,0.043)', lineHeight: '20px',
            whiteSpace: 'nowrap',
          }}>
            Agregar
          </Link>
        </div>
      </div>

      {/* ── 4 KPI Cards ──────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
        <KpiCard
          to="/stock"
          iconBg={C.greenBg}
          iconEl={<WalletIcon color={C.green} />}
          label="Cartas Dólares"
          value={fmtUSD(kpiUSD)}
          trendPct={null}
          trendColor={C.green80}
          sparkData={weekArr}
          sparkColor={C.green}
          sparkDimColor="#96D4BF"
          loading={mLoad}
        />
        <KpiCard
          to="/stock"
          iconBg={C.orangeBg}
          iconEl={<WalletIcon color={C.orange} />}
          label="Cartas en Pesos"
          value={fmtK(kpiARSOfic)}
          trendPct={null}
          trendColor={C.orange}
          sparkData={weekArr}
          sparkColor={C.orange}
          sparkDimColor="#F2C580"
          loading={mLoad}
        />
        <KpiCard
          to="/stock"
          iconBg={C.blueBg}
          iconEl={<WalletIcon color={C.blue} />}
          label="Cartas en Blue"
          value={fmtK(kpiARSBlue)}
          trendPct={null}
          trendColor={C.blue}
          sparkData={weekArr}
          sparkColor={C.blue}
          sparkDimColor="#A3C0FF"
          loading={mLoad}
        />
        <KpiCard
          to="/deudas"
          iconBg={C.redBg}
          iconEl={<ArrowDownCircleIcon color={C.red} />}
          label="Deudas activas"
          value={fmtARS(kpiDeudas)}
          trendPct={null}
          trendColor={C.red80}
          sparkData={zeroArr}
          sparkColor={C.red}
          sparkDimColor="#EE9393"
          loading={mLoad}
        />
      </div>

      {/* ── Ventas del mes ───────────────────────────────────────────────── */}
      <div style={{
        background: C.card, border: `1px solid ${C.border}`, borderRadius: 8,
        padding: 20, display: 'flex', flexDirection: 'column', gap: 22,
      }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontWeight: 600, fontSize: 16, color: C.text }}>Ventas del mes</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            {/* Leyenda */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <LegendDot color={C.blue}   label="Charly" />
              <LegendDot color={C.orange} label="Claims" />
              <LegendDot color={C.green}  label="Fuera de eventos" />
            </div>
            {/* Total + badge */}
            {totalVentas > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontWeight: 600, fontSize: 16, color: C.text }}>
                  {fmtK(totalVentas)}
                </span>
                <span style={{
                  background: C.green80, color: '#fff', borderRadius: 6,
                  padding: '1px 8px', fontSize: 12, fontWeight: 500,
                }}>
                  {pctClaims}% claims
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Gráfico */}
        {chartData.length === 0 ? (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', height: 280, color: C.sub, gap: 8,
          }}>
            <span style={{ fontSize: 40 }}>📊</span>
            <span style={{ fontSize: 13 }}>Sin ventas registradas este mes</span>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={chartData} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="4 4" stroke={C.border} vertical={false} />
              <XAxis
                dataKey="s"
                tick={{ fontSize: 12, fill: C.sub, fontFamily: 'Inter, sans-serif' }}
                axisLine={false} tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: C.sub, fontFamily: 'Inter, sans-serif' }}
                axisLine={false} tickLine={false} width={44}
                tickFormatter={v => `$${(v / 1000).toFixed(0)}k`}
              />
              <Tooltip content={<ChartTooltip />} />
              <Line type="monotone" dataKey="Charly"
                stroke={C.blue}   strokeWidth={3} dot={false} activeDot={{ r: 4 }} />
              <Line type="monotone" dataKey="Claims"
                stroke={C.orange} strokeWidth={3} dot={false} strokeDasharray="6 3"
                activeDot={{ r: 4 }} />
              <Line type="monotone" dataKey="Fuera de eventos"
                stroke={C.green}  strokeWidth={3} dot={false} activeDot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* ── Últimas ventas ────────────────────────────────────────────────── */}
      {ventas.length > 0 && (
        <div style={{
          background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, overflow: 'hidden',
        }}>
          <div style={{
            padding: '16px 20px', borderBottom: `1px solid ${C.border}`,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <span style={{ fontWeight: 600, fontSize: 16, color: C.text }}>Últimas ventas</span>
            <Link to="/ventas" style={{ fontSize: 12, color: C.blue, fontWeight: 500, textDecoration: 'none' }}>
              Ver todas →
            </Link>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: C.inner }}>
                  {['Fecha','Carta','Canal','Comprador','Monto'].map(h => (
                    <th key={h} style={{
                      padding: '10px 16px', textAlign: 'left',
                      fontWeight: 600, fontSize: 11, color: C.sub,
                      textTransform: 'uppercase', letterSpacing: '0.04em',
                      whiteSpace: 'nowrap',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ventas.slice(0, 8).map((v, i) => (
                  <tr key={v.id} style={{
                    borderTop: `1px solid ${C.border}`,
                    background: i % 2 === 0 ? C.card : C.inner,
                  }}>
                    <td style={{ padding: '10px 16px', color: C.sub, whiteSpace: 'nowrap' }}>
                      {(v.fecha_venta || v.sold_at || v.created_at)
                        ? new Date(v.fecha_venta || v.sold_at || v.created_at).toLocaleDateString('es-AR')
                        : '—'}
                    </td>
                    <td style={{ padding: '10px 16px', fontWeight: 500, color: C.text, maxWidth: 160 }}>
                      <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {v.card_name || v.notas?.split('|')[0]?.trim() || '—'}
                      </span>
                    </td>
                    <td style={{ padding: '10px 16px' }}>
                      <CanalBadge channel={v.channel} />
                    </td>
                    <td style={{ padding: '10px 16px', color: C.sub }}>{v.buyer_name || '—'}</td>
                    <td style={{ padding: '10px 16px', fontWeight: 600, color: C.blue, whiteSpace: 'nowrap' }}>
                      {fmtARS(v.total_ars_blue || v.total_ars)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Fila: CLAIM + Reservas + Top 5 ──────────────────────────────── */}
      <div style={{ display: 'flex', gap: 16 }}>

        {/* Resumen último CLAIM */}
        <div style={{
          flex: 1, background: C.card, border: `1px solid ${C.border}`, borderRadius: 8,
          padding: 20, display: 'flex', flexDirection: 'column', gap: 20,
        }}>
          {/* Título + meta */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontWeight: 600, fontSize: 16, color: C.text }}>
              Resumen de último CLAIM
            </span>
            {lastClaim && (
              <div style={{ display: 'flex', gap: 16 }}>
                <span style={{ fontSize: 12, color: C.sub }}>
                  Fecha del evento:{' '}
                  <strong style={{ fontWeight: 600 }}>
                    {new Date(lastClaim.fecha).toLocaleDateString('es-AR')}
                  </strong>
                </span>
                <span style={{ fontSize: 12, color: C.sub }}>
                  Total de cartas:{' '}
                  <strong style={{ fontWeight: 600 }}>{lastClaim.totalCartas}</strong>
                </span>
              </div>
            )}
          </div>

          {lastClaim ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}>
              {[
                { label: 'Cartas vendidas', val: lastClaim.totalCartas },
                { label: 'ARS Blue',         val: fmtARS(lastClaim.totalARS) },
                { label: 'Compradores',      val: lastClaim.compradores },
              ].map(row => (
                <div key={row.label} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  paddingRight: 10,
                }}>
                  <div style={{
                    padding: '6px 10px', background: C.blue10, flex: 1,
                  }}>
                    <span style={{ fontSize: 14, fontWeight: 500, color: C.text }}>
                      {row.label}
                    </span>
                  </div>
                  <span style={{ fontSize: 14, fontWeight: 500, color: C.text, marginLeft: 16, flexShrink: 0 }}>
                    {row.val}
                  </span>
                </div>
              ))}

              {/* Buyers */}
              {lastClaim.buyers.length > 0 && (
                <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {lastClaim.buyers.slice(0, 5).map(b => (
                    <div key={b.buyer} style={{
                      display: 'flex', justifyContent: 'space-between',
                      padding: '6px 10px', background: C.inner, borderRadius: 4,
                    }}>
                      <span style={{ fontSize: 12, color: C.sub, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {b.buyer}
                      </span>
                      <span style={{ fontSize: 12, fontWeight: 600, color: C.text, flexShrink: 0, marginLeft: 16 }}>
                        {fmtARS(b.total)} · {b.cartas} carta{b.cartas !== 1 ? 's' : ''}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.sub, fontSize: 13 }}>
              Sin claims registrados
            </div>
          )}
        </div>

        {/* Reservas */}
        <div style={{
          width: 270, flexShrink: 0,
          background: C.card, border: `1px solid ${C.border}`, borderRadius: 8,
          padding: 20, display: 'flex', flexDirection: 'column', gap: 20,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 600, fontSize: 16, color: C.text }}>Reservas</span>
          </div>

          {deudas.length > 0 ? (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 25, flex: 1 }}>
                {/* Progress */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 12, color: C.sub, fontWeight: 500 }}>Total pendiente</span>
                    <span style={{ fontSize: 14, color: C.sub, fontWeight: 500 }}>
                      {deudas.reduce((s, d) => s + d.items.length, 0)}
                    </span>
                  </div>
                  <div style={{ height: 8, background: C.border, borderRadius: 100 }}>
                    <div style={{ height: '100%', width: '70%', background: C.blue, borderRadius: 100 }} />
                  </div>
                </div>

                {/* Lista compradores */}
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {deudas.slice(0, 4).map((d, i) => (
                    <div key={d.buyer} style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: 10, gap: 10, borderRadius: i === 1 ? 6 : 4,
                      background: i === 1 ? C.blueBg : 'transparent',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
                        <div style={{
                          width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                          background: i === 1 ? C.blue : '#E99C26',
                        }} />
                        <span style={{
                          fontSize: 14, fontWeight: 500, color: C.sub,
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                          {d.buyer}
                        </span>
                      </div>
                      <div style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        padding: '2px 8px', borderRadius: 8, minWidth: 32, height: 24, flexShrink: 0,
                        background: i === 1 ? C.blue20 : C.card,
                        border: `1px solid ${i === 1 ? C.blue20 : C.border}`,
                      }}>
                        <span style={{ fontSize: 12, fontWeight: 500, color: i === 1 ? C.blue : C.sub }}>
                          {d.items.length}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <Link to="/deudas" style={{
                display: 'block', textAlign: 'center', padding: '9px 16px',
                background: C.blue, color: '#fff', borderRadius: 60,
                fontSize: 14, fontWeight: 500, textDecoration: 'none',
                border: `1px solid ${C.blue}`,
                boxShadow: '0px 2px 0px rgba(0,0,0,0.043)',
              }}>
                Ver todas las reservas
              </Link>
            </>
          ) : (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: C.sub, gap: 8, fontSize: 13 }}>
              <span style={{ fontSize: 32 }}>📋</span>
              Sin reservas activas
            </div>
          )}
        </div>

        {/* Top 5 cartas */}
        <div style={{
          flex: 1, background: C.card, border: `1px solid ${C.border}`, borderRadius: 8,
          padding: 20, display: 'flex', flexDirection: 'column', gap: 20,
        }}>
          <span style={{ fontWeight: 600, fontSize: 16, color: C.text }}>
            Top 5 cartas más vendidas del mes
          </span>

          {top5.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}>
              {top5.map((c) => (
                <div key={c.nombre} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  paddingRight: 10,
                }}>
                  <div style={{ padding: '6px 10px', background: C.blue10, flex: 1 }}>
                    <span style={{
                      fontSize: 14, fontWeight: 500, color: C.text,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      display: 'block',
                    }}>
                      {c.nombre}
                    </span>
                  </div>
                  <span style={{ fontSize: 14, fontWeight: 500, color: C.text, marginLeft: 16, flexShrink: 0 }}>
                    {c.qty}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.sub, fontSize: 13 }}>
              Sin datos este mes
            </div>
          )}
        </div>
      </div>

      {/* ── Ingresos y Egresos ────────────────────────────────────────────── */}
      <div style={{
        background: C.card, border: `1px solid ${C.border}`, borderRadius: 8,
        padding: 20, display: 'flex', flexDirection: 'column', gap: 20,
      }}>
        <span style={{ fontWeight: 600, fontSize: 16, color: C.text }}>Ingresos y Egresos</span>

        <div style={{ display: 'flex', alignItems: 'center', gap: 30 }}>
          {/* Ingresos */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 30, flex: 1 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontSize: 16, color: C.sub }}>Ingresos del mes</span>
              <span style={{ fontSize: 16, fontWeight: 600, color: C.text }}>
                {ventas.length}
              </span>
            </div>
            <MiniLineChart
              data={[1,2,3,4,5].map(s => semanaMap[s] || 0)}
              color={C.blue}
            />
          </div>

          {/* Separador vertical */}
          <div style={{
            width: 2, alignSelf: 'stretch', background: C.orange,
            borderRadius: 2, minHeight: 56, flexShrink: 0,
          }} />

          {/* Egresos */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 30, flex: 1 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontSize: 16, color: C.sub }}>Egresos del mes</span>
              <span style={{ fontSize: 16, fontWeight: 600, color: C.text }}>
                {compras?.rows?.length ?? 0}
              </span>
            </div>
            <MiniLineChart
              data={[1,2,3,4,5].map(s => compras?.weeks?.[s] || 0)}
              color={C.green}
              flip
            />
          </div>
        </div>
      </div>

    </div>
  )
}
