import { useState, useEffect, useMemo } from 'react'
import HoloCard from './HoloCard'
import { useSettings } from '../../hooks/useSettings'
import { CONDICIONES, CONDICION_LABELS } from '../../constants'

// Calcula precio sugerido: USD × blue × (1 + margen/100), redondeado a $500
function calcPrecioSugerido(usd, blue, margen) {
  if (usd == null || !blue) return null
  const base = usd * blue * (1 + (margen || 0) / 100)
  return Math.ceil(base / 500) * 500
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmtUSD = (n) =>
  n != null ? `$${Number(n).toFixed(2)}` : '—'

const fmtARS = (usd, rate) => {
  if (usd == null || !rate) return '—'
  return `$${Math.round(Number(usd) * rate).toLocaleString('es-AR')}`
}

const FUENTES_ORDEN = [
  { key: 'ppt',       label: 'Price Tracker' },
  { key: 'pokemontcg',label: 'Pokémon TCG'   },
  { key: 'tcgdex',    label: 'TCG Dex'       },
  { key: 'jpncards',  label: 'JPN Cards'     },
  { key: 'justtcg',   label: 'JustTCG'       },
]

const LANG_FLAG = { en: '🇬🇧', es: '🇪🇸', ja: '🇯🇵', fr: '🇫🇷', de: '🇩🇪', pt: '🇧🇷' }

function rarityStyle(holoLevel, rarity = '') {
  const hl = holoLevel || 'normal'
  const r  = rarity.toLowerCase()
  if (hl === 'secret'  || r.includes('rainbow') || r.includes('secret'))
    return { label: '◈ Secret',  bg: 'bg-gradient-to-r from-pink-500 to-purple-500 text-white' }
  if (hl === 'ultra'   || r.includes('vmax') || r.includes('vstar') || r.includes('full art'))
    return { label: '✦ Ultra',   bg: 'bg-gradient-to-r from-yellow-400 to-orange-400 text-black' }
  if (hl === 'holo'    || r.includes('holo'))
    return { label: '✦ Holo',    bg: 'bg-gradient-to-r from-blue-400 to-cyan-400 text-black' }
  if (r.includes('reverse'))
    return { label: '⟁ Reverse', bg: 'bg-white/20 text-white/80' }
  return null
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function CardResult({
  carta,
  opciones = [],
  dolarRates = { blue: null, oficial: null },
  onConfirmar,
  onVolver,
  onSelectOpcion,
  loading,
}) {
  const [condicion,   setCondicion]   = useState('NM')
  const [cantidad,    setCantidad]    = useState(1)
  const [accion,      setAccion]      = useState('agregar')
  const [precioVenta, setPrecioVenta] = useState('')
  const [buyerName,   setBuyerName]   = useState('')
  const [fuenteKey,   setFuenteKey]   = useState(null)

  const { margen } = useSettings()

  // Pre-rellenar precio de venta si el backend lo devuelve; si no, usar precio sugerido
  useEffect(() => {
    if (carta?.precio_venta != null) {
      setPrecioVenta(String(carta.precio_venta))
    } else {
      // sugerido se calculará después de que activeUSD y dolarRates estén disponibles
      setPrecioVenta('')
    }
    setFuenteKey(null)
    setAccion('agregar')
    setCantidad(1)
    setBuyerName('')
  }, [carta])

  if (!carta) return null

  // ── Fuentes de precio ────────────────────────────────────────────────────
  // Normalizar: si el backend devuelve precios_fuentes los usamos,
  // si no, construimos una fuente sintética con el precio principal
  const rawFuentes = carta.precios_fuentes || {}
  const fuentes = Object.keys(rawFuentes).length > 0
    ? rawFuentes
    : carta.precio_usd != null
      ? { ppt: { usd: carta.precio_usd, label: 'Price Tracker' } }
      : {}

  const fuentesDisp   = FUENTES_ORDEN.filter(f => fuentes[f.key]?.usd != null)
  const activeKey     = fuenteKey || fuentesDisp[0]?.key || null
  const activeFuente  = activeKey ? fuentes[activeKey] : null

  // USD activo (fuente seleccionada o campo principal)
  const activeUSD = activeFuente?.usd != null
    ? parseFloat(activeFuente.usd)
    : carta.precio_usd != null ? parseFloat(carta.precio_usd) : null

  // Precios por condición
  const condPrices = activeFuente?.condicion
    || carta.precios_condicion
    || {}
  const hasCondPrices = Object.keys(condPrices).length > 0

  // Precio sugerido (Feature 3): USD × blue × (1+margen%) redondeado a $500
  const precioSugerido = useMemo(
    () => calcPrecioSugerido(activeUSD, dolarRates.blue, margen),
    [activeUSD, dolarRates.blue, margen]
  )

  // Rarity badge
  const rStyle = rarityStyle(carta.holo_level, carta.rarity || '')

  // Otros candidatos (excluir la carta actual por número)
  const otrosCandidatos = opciones.filter(
    op => op.numero !== carta.numero || op.set !== carta.set
  )

  return (
    <div className="absolute inset-0 bg-[#060612] flex flex-col overflow-hidden">

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 pt-safe py-3 shrink-0 bg-black/40 border-b border-white/5">
        <button
          onClick={onVolver}
          className="flex items-center gap-1.5 text-white/60 hover:text-white transition text-sm"
        >
          ← Cámara
        </button>
        <div className="flex items-center gap-2">
          {carta.en_stock != null && (
            <span className="text-white/40 text-xs">
              Stock: <span className="text-white/70 font-semibold">{carta.en_stock}</span>
            </span>
          )}
          {rStyle && (
            <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${rStyle.bg}`}>
              {rStyle.label}
            </span>
          )}
          <span className="text-base" title={carta.idioma || 'en'}>
            {LANG_FLAG[carta.idioma || 'en'] || '🌐'}
          </span>
        </div>
      </div>

      {/* ── Contenido scrollable ──────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto overscroll-contain">

        {/* Imagen + nombre */}
        <div className="flex flex-col items-center pt-5 pb-3 px-4">
          <HoloCard
            imagen={carta.imagen}
            holoLevel={carta.holo_level || 'normal'}
            alt={carta.nombre}
          />

          <h2 className="text-white font-bold text-xl mt-4 text-center leading-tight">
            {carta.nombre}
          </h2>

          {/* Set name + número */}
          <div className="flex items-center justify-center gap-2 mt-1.5 flex-wrap">
            {(carta.set || carta.set_id) && (
              <span className="text-white/50 text-sm">
                {carta.set || carta.set_id}
              </span>
            )}
            {carta.numero && (
              <span className="text-white/35 text-sm">· #{carta.numero}</span>
            )}
          </div>

          {/* Set logo */}
          {carta.set_logo_url && (
            <img
              src={carta.set_logo_url}
              alt=""
              className="mt-2 max-h-6 max-w-[120px] object-contain opacity-55"
              onError={e => { e.target.style.display = 'none' }}
            />
          )}
        </div>

        {/* ── Precios ────────────────────────────────────────────────────── */}
        <div className="mx-4 rounded-2xl bg-white/5 border border-white/8 p-4 space-y-3">

          {/* USD + ARS */}
          <div className="grid grid-cols-3 gap-3">
            <PriceCell label="USD"        value={fmtUSD(activeUSD)} />
            <PriceCell label="ARS Blue"   value={fmtARS(activeUSD, dolarRates.blue)}    accent />
            <PriceCell label="ARS Oficial" value={fmtARS(activeUSD, dolarRates.oficial)} />
          </div>

          {/* Selector de fuentes — siempre visible si hay al menos una */}
          {fuentesDisp.length >= 1 && (
            <div className="flex gap-1.5 flex-wrap pt-2 border-t border-white/8">
              {fuentesDisp.map(f => (
                <button
                  key={f.key}
                  onClick={() => setFuenteKey(f.key)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition
                    ${activeKey === f.key
                      ? 'bg-blue-600 text-white'
                      : 'bg-white/8 text-white/50 hover:bg-white/12'}`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          )}
          {/* Si no hay fuentes del backend, indicar origen del precio */}
          {fuentesDisp.length === 0 && activeUSD != null && (
            <div className="pt-2 border-t border-white/8">
              <span className="text-xs text-white/30 bg-white/5 px-2.5 py-1 rounded-lg">
                Precio de mercado
              </span>
            </div>
          )}

          {/* Precios por condición */}
          {hasCondPrices && (
            <div className="grid grid-cols-4 gap-1 pt-1 border-t border-white/8">
              {[
                { k: 'Near Mint',          l: 'NM' },
                { k: 'Lightly Played',     l: 'LP' },
                { k: 'Moderately Played',  l: 'MP' },
                { k: 'Heavily Played',     l: 'HP' },
              ].map(({ k, l }) => (
                <div key={k} className="text-center">
                  <div className="text-white/30 text-xs">{l}</div>
                  <div className="text-white/70 text-xs font-medium">
                    {condPrices[k] != null ? `$${parseFloat(condPrices[k]).toFixed(2)}` : '—'}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Precio de venta ────────────────────────────────────────────── */}
        <div className="mx-4 mt-3">
          <div className="flex items-center justify-between mb-1">
            <label className="text-white/35 text-xs">Precio de venta (ARS)</label>
            {precioSugerido != null && (
              <button
                onClick={() => setPrecioVenta(String(precioSugerido))}
                className="text-blue-400/80 hover:text-blue-300 text-xs transition"
              >
                Sugerido: ${precioSugerido.toLocaleString('es-AR')} ({margen}% margen) →
              </button>
            )}
          </div>
          <input
            type="number"
            inputMode="numeric"
            value={precioVenta}
            onChange={e => setPrecioVenta(e.target.value)}
            placeholder={precioSugerido != null ? `Sugerido: $${precioSugerido.toLocaleString('es-AR')}` : 'Sin precio fijado'}
            className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2
                       text-white text-sm focus:outline-none focus:border-blue-500/60
                       placeholder-white/25 transition"
          />
        </div>

        {/* ── Acciones rápidas ───────────────────────────────────────────── */}
        <div className="mx-4 mt-3 flex gap-2">
          {[
            { key: 'agregar',  label: '+ Stock'     },
            { key: 'vender',   label: '$ Vender'    },
            { key: 'reservar', label: '🔒 Reservar' },
          ].map(a => (
            <button
              key={a.key}
              onClick={() => setAccion(a.key)}
              className={`flex-1 py-2 rounded-xl text-sm font-semibold transition
                ${accion === a.key
                  ? 'bg-blue-600 text-white'
                  : 'bg-white/5 text-white/50 hover:bg-white/10'}`}
            >
              {a.label}
            </button>
          ))}
        </div>

        {/* Nombre comprador (solo si reservar) */}
        {accion === 'reservar' && (
          <div className="mx-4 mt-2">
            <input
              type="text"
              value={buyerName}
              onChange={e => setBuyerName(e.target.value)}
              placeholder="Nombre del cliente (opcional)"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2
                         text-white text-sm focus:outline-none focus:border-blue-500/60
                         placeholder-white/25 transition"
            />
          </div>
        )}

        {/* ── Condición ─────────────────────────────────────────────────── */}
        <div className="mx-4 mt-3 flex gap-1.5 flex-wrap">
          {CONDICIONES.map(c => (
            <button
              key={c}
              onClick={() => setCondicion(c)}
              title={CONDICION_LABELS[c]}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition
                ${condicion === c
                  ? 'bg-blue-600 text-white'
                  : 'bg-white/5 text-white/50 hover:bg-white/10'}`}
            >
              {c}
            </button>
          ))}
        </div>

        {/* ── Cantidad + Confirmar ───────────────────────────────────────── */}
        <div className="mx-4 mt-4 flex items-center gap-3">
          <div className="flex items-center gap-1 bg-white/5 rounded-xl px-1">
            <button
              onClick={() => setCantidad(v => Math.max(1, v - 1))}
              className="w-9 h-9 text-white/70 hover:text-white text-xl font-bold flex items-center justify-center"
            >−</button>
            <span className="text-white font-bold w-6 text-center text-sm">{cantidad}</span>
            <button
              onClick={() => setCantidad(v => v + 1)}
              className="w-9 h-9 text-white/70 hover:text-white text-xl font-bold flex items-center justify-center"
            >+</button>
          </div>

          <button
            onClick={() => onConfirmar({
              carta,
              cantidad,
              condicion,
              accion,
              sale_price_ars: precioVenta ? parseFloat(precioVenta) : null,
              buyer_name:     buyerName || null,
            })}
            disabled={loading}
            className="flex-1 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50
                       text-white font-bold text-sm transition"
          >
            {loading ? '…' : '✓ Confirmar'}
          </button>
        </div>

        {/* ── Otros candidatos ──────────────────────────────────────────── */}
        {otrosCandidatos.length > 0 && (
          <div className="mt-5">
            <p className="text-white/30 text-xs px-4 mb-2 uppercase tracking-wider">Otras versiones</p>
            <div className="flex gap-3 overflow-x-auto px-4 pb-4 scrollbar-none">
              {otrosCandidatos.map((op, i) => (
                <button
                  key={i}
                  onClick={() => onSelectOpcion(op)}
                  className="shrink-0 flex flex-col items-center gap-1.5 p-2.5 rounded-xl
                             bg-white/5 border border-white/8 hover:bg-white/10 transition"
                >
                  {op.imagen
                    ? <img
                        src={op.imagen}
                        alt=""
                        className="w-12 h-16 object-cover rounded-md"
                        onError={e => {
                          e.target.style.display = 'none'
                          e.target.nextSibling.style.display = 'flex'
                        }}
                      />
                    : null
                  }
                  <div
                    className="w-12 h-16 rounded-md bg-white/10 items-center justify-center text-white/20 text-xl"
                    style={{ display: op.imagen ? 'none' : 'flex' }}
                  >🃏</div>
                  <span className="text-white/50 text-xs w-16 text-center truncate leading-tight">
                    {op.set || op.set_id}
                  </span>
                  {op.precio_usd && (
                    <span className="text-blue-400 text-xs font-semibold">
                      ${parseFloat(op.precio_usd).toFixed(2)}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="h-8" />
      </div>
    </div>
  )
}

function PriceCell({ label, value, accent }) {
  return (
    <div className="text-center">
      <div className="text-white/35 text-xs mb-0.5">{label}</div>
      <div className={`text-sm font-bold ${accent ? 'text-blue-400' : 'text-white/85'}`}>
        {value}
      </div>
    </div>
  )
}
