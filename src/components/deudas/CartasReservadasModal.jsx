import { useState, useEffect } from 'react'
import { supabase }   from '../../lib/supabase'
import { STORE_ID }   from '../../constants'
import Spinner        from '../ui/Spinner'

const fmtARS = (n) =>
  n != null ? `$${Number(n).toLocaleString('es-AR', { maximumFractionDigits: 0 })}` : '—'

const fmtFechaHoy = () => {
  const d = new Date()
  return `${d.getDate()}/${d.getMonth() + 1}`
}

export default function CartasReservadasModal({ buyer, onClose, onDone }) {
  const [cartas,      setCartas]      = useState([])
  const [loading,     setLoading]     = useState(true)
  const [confirming,  setConfirming]  = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)

  // Generador de texto
  const [showTexto,   setShowTexto]   = useState(false)
  const [claimNombre, setClaimNombre] = useState('')
  const [retiro1,     setRetiro1]     = useState('')
  const [retiro2,     setRetiro2]     = useState('')
  const [alias,       setAlias]       = useState('')
  const [titular,     setTitular]     = useState('')
  const [copied,      setCopied]      = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data } = await supabase
        .from('inventory')
        .select(`id, sale_price_ars, price_ars_blue, condition, set_name, cards(name, image_url)`)
        .eq('store_id', STORE_ID)
        .eq('buyer_name', buyer)
        .or('status.eq.reservada,estado.eq.reservada')
      if (!cancelled) {
        setCartas(data ?? [])
        setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [buyer])

  const totalARS    = cartas.reduce((s, c) => s + (c.sale_price_ars ?? c.price_ars_blue ?? 0), 0)
  const totalCartas = cartas.length

  const markAllSold = async () => {
    setConfirming(true)
    try {
      const ids = cartas.map(c => c.id)
      await supabase
        .from('inventory')
        .update({ status: 'vendida', estado: 'vendida', sold_at_date: new Date().toISOString() })
        .in('id', ids)
      onDone?.()
      onClose()
    } finally {
      setConfirming(false)
      setShowConfirm(false)
    }
  }

  /* ── Generador de texto WhatsApp ───────────────────────────────── */
  const generarTexto = () => {
    const fecha = fmtFechaHoy()
    const grupo = claimNombre.trim() || 'Claims'

    const lineasCartas = cartas.map(c => {
      const nombre = c.cards?.name || '—'
      const precio = fmtARS(c.sale_price_ars ?? c.price_ars_blue)
      return `• ${nombre} - ${precio}`
    }).join('\n')

    const r1  = retiro1.trim()  || '[lugar retiro 1]'
    const r2  = retiro2.trim()  || '[lugar retiro 2]'
    const ali = alias.trim()    || '[alias]'
    const tit = titular.trim()  || '[titular]'

    return `Hola:) te comparto el resumen del CLAIM del dia ${fecha} del grupo ${grupo}.

${lineasCartas}

Total: ${fmtARS(totalARS)}
Fecha de pago
• Envio: a cargo del comprador
• Retiros:
• ${r1}
• ${r2}
• Alias: ${ali}
• Titular: ${tit}
Por favor, enviar comprobante una vez realizado el pago.

Cualquier duda, no dudes en consultarme. Muchas gracias`
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(generarTexto()).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <h3 className="font-bold text-gray-800">
            🃏 Cartas reservadas · <span className="text-blue-600">{buyer}</span>
          </h3>
          <div className="flex items-center gap-2">
            {/* Toggle generador de texto */}
            {!loading && cartas.length > 0 && (
              <button
                onClick={() => setShowTexto(v => !v)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition flex items-center gap-1.5
                  ${showTexto
                    ? 'bg-green-500 text-white'
                    : 'bg-green-50 text-green-700 hover:bg-green-100 border border-green-200'}`}
              >
                💬 {showTexto ? 'Ver cartas' : 'Generar texto'}
              </button>
            )}
            <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-2xl leading-none">×</button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {loading && (
            <div className="flex justify-center py-12">
              <Spinner size={32} className="text-blue-400" />
            </div>
          )}

          {/* Vista: cartas en grilla */}
          {!loading && !showTexto && (
            <>
              {cartas.length === 0 && (
                <p className="text-gray-400 text-sm text-center py-8">No hay cartas reservadas.</p>
              )}
              {cartas.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  {cartas.map(c => (
                    <div key={c.id} className="flex flex-col items-center text-center gap-1.5">
                      {c.cards?.image_url
                        ? (
                          <img
                            src={c.cards.image_url}
                            alt={c.cards?.name}
                            className="w-full aspect-[2.5/3.5] object-cover rounded-lg bg-gray-100 shadow-sm"
                          />
                        ) : (
                          <div className="w-full aspect-[2.5/3.5] bg-gray-100 rounded-lg
                                          flex items-center justify-center text-3xl">
                            🃏
                          </div>
                        )
                      }
                      <p className="text-xs font-semibold text-gray-800 leading-tight line-clamp-2">
                        {c.cards?.name || '—'}
                      </p>
                      <p className="text-xs text-blue-600 font-bold">
                        {fmtARS(c.sale_price_ars ?? c.price_ars_blue)}
                      </p>
                      {c.condition && (
                        <span className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded font-medium">
                          {c.condition}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* Vista: generador de texto */}
          {!loading && showTexto && (
            <div className="space-y-4">
              {/* Campo nombre del claim */}
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1.5">
                  Nombre del grupo / claim
                </label>
                <input
                  type="text"
                  placeholder='Ej: "SV Surging Sparks", "Octubre Claims"…'
                  value={claimNombre}
                  onChange={e => setClaimNombre(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm
                             focus:outline-none focus:ring-2 focus:ring-green-400 focus:border-transparent"
                />
              </div>

              {/* Campos de retiro / pago */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-600 block mb-1.5">
                    Retiro 1
                  </label>
                  <input
                    type="text"
                    placeholder="Ej: Sábados en Charly, mesa 11"
                    value={retiro1}
                    onChange={e => setRetiro1(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm
                               focus:outline-none focus:ring-2 focus:ring-green-400 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-600 block mb-1.5">
                    Retiro 2
                  </label>
                  <input
                    type="text"
                    placeholder="Ej: Lunes en Microcentro"
                    value={retiro2}
                    onChange={e => setRetiro2(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm
                               focus:outline-none focus:ring-2 focus:ring-green-400 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-600 block mb-1.5">
                    Alias
                  </label>
                  <input
                    type="text"
                    placeholder="Ej: ut.tcg"
                    value={alias}
                    onChange={e => setAlias(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm
                               focus:outline-none focus:ring-2 focus:ring-green-400 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-600 block mb-1.5">
                    Titular
                  </label>
                  <input
                    type="text"
                    placeholder="Ej: Melody Castillo"
                    value={titular}
                    onChange={e => setTitular(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm
                               focus:outline-none focus:ring-2 focus:ring-green-400 focus:border-transparent"
                  />
                </div>
              </div>

              {/* Preview del texto */}
              <div>
                <label className="text-xs font-semibold text-gray-600 block mb-1.5">
                  Vista previa
                </label>
                <textarea
                  readOnly
                  value={generarTexto()}
                  rows={16}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-xs
                             text-gray-700 bg-gray-50 resize-none focus:outline-none
                             font-mono leading-relaxed"
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-100 shrink-0">
          {/* Footer modo texto */}
          {showTexto && (
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-gray-500">
                {totalCartas} cartas · <span className="font-bold text-amber-600">{fmtARS(totalARS)}</span>
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowTexto(false)}
                  className="px-4 py-2 bg-gray-100 text-gray-600 text-sm font-medium rounded-xl hover:bg-gray-200 transition"
                >
                  ← Volver
                </button>
                <button
                  onClick={handleCopy}
                  className={`px-4 py-2 text-white text-sm font-bold rounded-xl transition
                    ${copied ? 'bg-emerald-500' : 'bg-green-500 hover:bg-green-400'}`}
                >
                  {copied ? '✓ Copiado!' : '📋 Copiar texto'}
                </button>
              </div>
            </div>
          )}

          {/* Footer modo cartas */}
          {!showTexto && (
            showConfirm ? (
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm text-gray-700 font-medium">
                  ¿Marcar las {totalCartas} cartas como vendidas?
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
                    ✓ Marcar todas como vendidas
                  </button>
                </div>
              </div>
            )
          )}
        </div>
      </div>
    </div>
  )
}
