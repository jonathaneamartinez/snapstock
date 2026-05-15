import { useState } from 'react'
import { useTrendingCards } from '../../hooks/useTrendingCards'
import CardPriceModal from './CardPriceModal'

const C = {
  card:    '#FFFFFF',
  inner:   '#F8F9FA',
  border:  '#DBE0E5',
  text:    '#1D2630',
  sub:     '#5B6B79',
  blue:    '#4680FF',
  blueBg:  '#EDF3FF',
  green:   '#2CA87F',
  greenBg: '#EBFAF5',
  red:     '#DC2626',
  redBg:   '#FFFAFA',
}

const fmtUSD  = (n) => n != null ? `$${Number(n).toFixed(2)}` : '—'
const fmtDelta = (n) => {
  const abs = Math.abs(n).toFixed(1)
  return n >= 0 ? `+${abs}%` : `-${abs}%`
}

/**
 * Widget de cartas en tendencia — solo visible en plan Pro (Ayrton & Agustín).
 * Muestra las cartas del inventario propio con mayor variación de precio en N días.
 */
export default function TrendingCards() {
  const [days,      setDays]      = useState(7)
  const [priceCard, setPriceCard] = useState(null)

  const { data = [], isLoading } = useTrendingCards(days, 6)

  const hasData = data.length > 0

  return (
    <>
      <div style={{
        background: C.card,
        border:     `1px solid ${C.border}`,
        borderRadius: 8,
        padding: 20,
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 18 }}>📈</span>
            <span style={{ fontWeight: 600, fontSize: 15, color: C.text }}>
              Tendencias del stock
            </span>
            <span style={{
              background: '#f0fdf4', color: '#16a34a',
              fontSize: 10, fontWeight: 600, padding: '2px 8px',
              borderRadius: 20, letterSpacing: '0.04em',
            }}>
              PRO
            </span>
          </div>

          {/* Selector de ventana */}
          <div style={{ display: 'flex', gap: 4 }}>
            {[7, 14, 30].map(d => (
              <button
                key={d}
                onClick={() => setDays(d)}
                style={{
                  padding: '4px 10px',
                  borderRadius: 8,
                  border: 'none',
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: 'pointer',
                  background: days === d ? C.blue : C.inner,
                  color:      days === d ? '#fff' : C.sub,
                  transition: 'all 0.15s',
                }}
              >
                {d}d
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        {isLoading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[...Array(4)].map((_, i) => (
              <div key={i} style={{
                height: 44, borderRadius: 8,
                background: `linear-gradient(90deg, ${C.inner} 0%, #eee 50%, ${C.inner} 100%)`,
                backgroundSize: '200% 100%',
                animation: 'shimmer 1.4s infinite',
              }} />
            ))}
          </div>
        ) : !hasData ? (
          <div style={{
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            padding: '24px 0', gap: 8, color: C.sub,
          }}>
            <span style={{ fontSize: 32 }}>🌱</span>
            <span style={{ fontSize: 13, fontWeight: 500 }}>
              Acumulando datos de precios…
            </span>
            <span style={{ fontSize: 11, color: '#9ca3af', textAlign: 'center', maxWidth: 220 }}>
              El historial se guarda diariamente. En {days} días vas a ver las tendencias reales de tu stock.
            </span>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {data.map((card, i) => {
              const up = card.delta_pct >= 0
              return (
                <button
                  key={card.card_id}
                  onClick={() => setPriceCard(card)}
                  style={{
                    display: 'flex', alignItems: 'center',
                    gap: 10, padding: '8px 10px',
                    borderRadius: 8, border: 'none',
                    background: i % 2 === 0 ? C.inner : C.card,
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'background 0.12s',
                    width: '100%',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = C.blueBg}
                  onMouseLeave={e => e.currentTarget.style.background = i % 2 === 0 ? C.inner : C.card}
                >
                  {/* Rank */}
                  <span style={{
                    fontSize: 11, fontWeight: 700, color: C.sub,
                    minWidth: 16, textAlign: 'center',
                  }}>
                    {i + 1}
                  </span>

                  {/* Imagen miniatura */}
                  {card.image_url ? (
                    <img
                      src={card.image_url}
                      alt={card.nombre}
                      style={{ width: 24, height: 34, objectFit: 'contain', borderRadius: 3, flexShrink: 0 }}
                    />
                  ) : (
                    <div style={{ width: 24, height: 34, background: C.border, borderRadius: 3, flexShrink: 0 }} />
                  )}

                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: 13, fontWeight: 600, color: C.text,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {card.nombre || '—'}
                    </div>
                    <div style={{ fontSize: 11, color: C.sub }}>
                      {card.set_name} {card.numero ? `· #${card.numero}` : ''}
                    </div>
                  </div>

                  {/* Precios */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', flexShrink: 0 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>
                      {fmtUSD(card.price_last)}
                    </span>
                    <span style={{
                      fontSize: 11, fontWeight: 700,
                      color: up ? C.green : C.red,
                    }}>
                      {fmtDelta(card.delta_pct)}
                    </span>
                  </div>

                  {/* Flecha */}
                  <span style={{
                    fontSize: 14, color: up ? C.green : C.red, flexShrink: 0,
                  }}>
                    {up ? '▲' : '▼'}
                  </span>
                </button>
              )
            })}
          </div>
        )}

        {hasData && (
          <p style={{ fontSize: 10, color: '#9ca3af', margin: 0, textAlign: 'right' }}>
            Clickeá una carta para ver su historial completo
          </p>
        )}
      </div>

      {/* Modal de historial */}
      <CardPriceModal card={priceCard} onClose={() => setPriceCard(null)} />

      <style>{`
        @keyframes shimmer {
          0%   { background-position: -200% 0 }
          100% { background-position:  200% 0 }
        }
      `}</style>
    </>
  )
}
