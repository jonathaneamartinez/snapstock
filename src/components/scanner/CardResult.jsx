import { useState, useEffect, useMemo } from 'react'
import HoloCard from './HoloCard'
import { useSettings } from '../../hooks/useSettings'
import { CONDICIONES, CONDICION_LABELS, IDIOMAS, CANALES_VENTA, FIRST_ED_SETS } from '../../constants'

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

/** Detecta si el set de la carta puede tener 1ª edición */
function canHaveFirstEd(setName) {
  if (!setName) return false
  return FIRST_ED_SETS.some(s => setName.includes(s))
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function CardResult({
  carta,
  opciones = [],
  dolarRates = { blue: null, oficial: null },
  idioma: idiomaInicial = 'en',
  onConfirmar,
  onVolver,
  onSelectOpcion,
  loading,
}) {
  const [condicion,     setCondicion]     = useState('NM')
  const [cantidad,      setCantidad]      = useState(1)
  const [accion,        setAccion]        = useState('agregar')
  const [precioVenta,   setPrecioVenta]   = useState('')
  const [buyerName,     setBuyerName]     = useState('')
  const [canal,         setCanal]         = useState('fuera_de_evento')
  const [idiomaLocal,   setIdiomaLocal]   = useState(idiomaInicial)
  const [isFirstEd,     setIsFirstEd]     = useState(false)
  const [fuenteKey,     setFuenteKey]     = useState(null)

  const { margen } = useSettings()

  // Al cambiar de carta: reiniciar estado local
  useEffect(() => {
    if (carta?.precio_venta != null) {
      setPrecioVenta(String(carta.precio_venta))
    } else {
      setPrecioVenta('')
    }
    setFuenteKey(null)
    setAccion('agregar')
    setCantidad(1)
    setBuyerName('')
    setCanal('fuera_de_evento')
    setIsFirstEd(false)
    setIdiomaLocal(idiomaInicial)
  }, [carta])                     // eslint-disable-line react-hooks/exhaustive-deps

  if (!carta) return null

  // ── Fuentes de precio ────────────────────────────────────────────────────
  const rawFuentes = carta.precios_fuentes || {}
  const fuentes = Object.keys(rawFuentes).length > 0
    ? rawFuentes
    : carta.precio_usd != null
      ? { ppt: { usd: carta.precio_usd, label: 'Price Tracker' } }
      : {}

  const fuentesDisp   = FUENTES_ORDEN.filter(f => fuentes[f.key]?.usd != null)
  const activeKey     = fuenteKey || fuentesDisp[0]?.key || null
  const activeFuente  = activeKey ? fuentes[activeKey] : null

  const activeUSD = activeFuente?.usd != null
    ? parseFloat(activeFuente.usd)
    : carta.precio_usd != null ? parseFloat(carta.precio_usd) : null

  const condPrices    = activeFuente?.condicion || carta.precios_condicion || {}
  const hasCondPrices = Object.keys(condPrices).length > 0

  const precioSugerido = useMemo(
    () => calcPrecioSugerido(activeUSD, dolarRates.blue, margen),
    [activeUSD, dolarRates.blue, margen]
  )

  const rStyle           = rarityStyle(carta.holo_level, carta.rarity || '')
  const otrosCandidatos  = opciones.filter(op => op.numero !== carta.numero || op.set !== carta.set)
  const firstEdPosible   = canHaveFirstEd(carta.set || carta.set_id || '')

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
              <span className="text-white/50 text-sm">{carta.set || carta.set_id}</span>
            )}
            {carta.numero && (
              <span className="text-white/35 text-sm">· #{carta.numero}</span>
            )}
          </div>

          {/* Set logo */}
          {carta.set_logo_url && (
            <img
              src={carta.set_logo_url} alt=""
              className="mt-2 max-h-6 max-w-[120px] object-contain opacity-55"
              onError={e => { e.target.style.display = 'none' }}
            />
          )}
        </div>

        {/* ── Precios ────────────────────────────────────────────────────── */}
        <div className="mx-4 rounded-2xl bg-white/5 border border-white/8 p-4 space-y-3">

          <div className="grid grid-cols-3 gap-3">
            <PriceCell label="USD"         value={fmtUSD(activeUSD)} />
            <PriceCell label="ARS Blue"    value={fmtARS(activeUSD, dolarRates.blue)}    accent />
            <PriceCell label="ARS Oficial" value={fmtARS(activeUSD, dolarRates.oficial)} />
          </div>

          {fuentesDisp.length >= 1 && (
            <div className="flex gap-1.5 flex-wrap pt-2 border-t border-white/8">
              {fuentesDisp.map(f => (
                <button key={f.key} onClick={() => setFuenteKey(f.key)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition
                    ${activeKey === f.key
                      ? 'bg-blue-600 text-white'
                      : 'bg-white/8 text-white/50 hover:bg-white/12'}`}>
                  {f.label}
                </button>
              ))}
            </div>
          )}
          {fuentesDisp.length === 0 && activeUSD != null && (
            <div className="pt-2 border-t border-white/8">
              <span className="text-xs text-white/30 bg-white/5 px-2.5 py-1 rounded-lg">
                Precio de mercado
              </span>
            </div>
          )}

          {hasCondPrices && (
            <div className="grid grid-cols-4 gap-1 pt-1 border-t border-white/8">
              {[
                { k: 'Near Mint', l: 'NM' }, { k: 'Lightly Played', l: 'LP' },
                { k: 'Moderately Played', l: 'MP' }, { k: 'Heavily Played', l: 'HP' },
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

        {/* ── Idioma ─────────────────────────────────────────────────────── */}
        <div className="mx-4 mt-3">
          <p className="text-white/35 text-xs mb-1.5">Idioma de la carta</p>
          <div className="flex gap-1.5 flex-wrap">
            {IDIOMAS.map(({ code, flag }) => (
              <button key={code} onClick={() => setIdiomaLocal(code)}
                className={`px-2.5 py-1 rounded-full text-xs font-bold transition
                  ${idiomaLocal === code
                    ? 'bg-purple-500/25 border border-purple-400 text-purple-300'
                    : 'bg-white/5 border border-white/10 text-white/40 hover:bg-white/10'}`}>
                {flag} {code.toUpperCase()}
              </button>
            ))}
          </div>
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
                Sugerido: ${precioSugerido.toLocaleString('es-AR')} ({margen}%) →
              </button>
            )}
          </div>
          <input
            type="number" inputMode="numeric"
            value={precioVenta}
            onChange={e => setPrecioVenta(e.target.value)}
            placeholder={precioSugerido != null ? `Sugerido: $${precioSugerido.toLocaleString('es-AR')}` : 'Sin precio fijado'}
            className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2
                       text-white text-sm focus:outline-none focus:border-blue-500/60
                       placeholder-white/25 transition"
          />
        </div>

        {/* ── Acciones ───────────────────────────────────────────────────── */}
        <div className="mx-4 mt-3 flex gap-2">
          {[
            { key: 'agregar',  label: '+ Stock'     },
            { key: 'vender',   label: '$ Vender'    },
            { key: 'reservar', label: '🔒 Reservar' },
          ].map(a => (
            <button key={a.key} onClick={() => setAccion(a.key)}
              className={`flex-1 py-2 rounded-xl text-sm font-semibold transition
                ${accion === a.key
                  ? 'bg-blue-600 text-white'
                  : 'bg-white/5 text-white/50 hover:bg-white/10'}`}>
              {a.label}
            </button>
          ))}
        </div>

        {/* Canal de venta (solo si vender) */}
        {accion === 'vender' && (
          <div className="mx-4 mt-2">
            <p className="text-white/35 text-xs mb-1.5">Canal de venta</p>
            <div className="flex gap-1.5 flex-wrap">
              {CANALES_VENTA.map(c => (
                <button key={c.value} onClick={() => setCanal(c.value)}
                  className={`px-2.5 py-1 rounded-full text-xs font-semibold transition
                    ${canal === c.value
                      ? 'bg-emerald-500/25 border border-emerald-400 text-emerald-300'
                      : 'bg-white/5 border border-white/10 text-white/40 hover:bg-white/10'}`}>
                  {c.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Nombre comprador (vender o reservar) */}
        {(accion === 'vender' || accion === 'reservar') && (
          <div className="mx-4 mt-2">
            <input type="text" value={buyerName}
              onChange={e => setBuyerName(e.target.value)}
              placeholder={accion === 'reservar' ? 'Nombre del cliente (opcional)' : 'Comprador (opcional)'}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2
                         text-white text-sm focus:outline-none focus:border-blue-500/60
                         placeholder-white/25 transition"
            />
          </div>
        )}

        {/* ── 1ª Edición (solo sets WotC) ────────────────────────────────── */}
        {firstEdPosible && (
          <div className="mx-4 mt-2">
            <button
              type="button"
              onClick={() => setIsFirstEd(v => !v)}
              className={`w-full py-2 rounded-xl text-sm font-semibold border transition flex items-center justify-center gap-2
                ${isFirstEd
                  ? 'bg-yellow-400/20 border-yellow-400 text-yellow-300'
                  : 'bg-white/5 border-white/10 text-white/40 hover:bg-white/10'}`}>
              ★ 1ª Edición
              <span className="text-xs opacity-70">
                {isFirstEd ? '(activado)' : '(set WotC — tocá para marcar)'}
              </span>
            </button>
          </div>
        )}

        {/* ── Condición ─────────────────────────────────────────────────── */}
        <div className="mx-4 mt-3 flex gap-1.5 flex-wrap">
          {CONDICIONES.map(c => (
            <button key={c} onClick={() => setCondicion(c)} title={CONDICION_LABELS[c]}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition
                ${condicion === c
                  ? 'bg-blue-600 text-white'
                  : 'bg-white/5 text-white/50 hover:bg-white/10'}`}>
              {c}
            </button>
          ))}
        </div>

        {/* ── Cantidad + Confirmar ───────────────────────────────────────── */}
        <div className="mx-4 mt-4 flex items-center gap-3">
          <div className="flex items-center gap-1 bg-white/5 rounded-xl px-1">
            <button onClick={() => setCantidad(v => Math.max(1, v - 1))}
              className="w-9 h-9 text-white/70 hover:text-white text-xl font-bold flex items-center justify-center">
              −
            </button>
            <span className="text-white font-bold w-6 text-center text-sm">{cantidad}</span>
            <button onClick={() => setCantidad(v => v + 1)}
              className="w-9 h-9 text-white/70 hover:text-white text-xl font-bold flex items-center justify-center">
              +
            </button>
          </div>

          <button
            onClick={() => onConfirmar({
              carta,
              cantidad,
              condicion,
              accion,
              idioma:          idiomaLocal,
              canal:           accion === 'vender' ? canal : null,
              is_first_edition: isFirstEd,
              sale_price_ars:  precioVenta ? parseFloat(precioVenta) : null,
              buyer_name:      buyerName || null,
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
                <button key={i} onClick={() => onSelectOpcion(op)}
                  className="shrink-0 flex flex-col items-center gap-1.5 p-2.5 rounded-xl
                             bg-white/5 border border-white/8 hover:bg-white/10 transition">
                  {op.imagen
                    ? <img src={op.imagen} alt=""
                        className="w-12 h-16 object-cover rounded-md"
                        onError={e => { e.target.style.display='none'; e.target.nextSibling.style.display='flex' }} />
                    : null}
                  <div className="w-12 h-16 rounded-md bg-white/10 items-center justify-center text-white/20 text-xl"
                    style={{ display: op.imagen ? 'none' : 'flex' }}>🃏</div>
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
