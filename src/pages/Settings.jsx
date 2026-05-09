import { useState } from 'react'
import { useDolar }          from '../hooks/useDolar'
import { useSettings }       from '../hooks/useSettings'
import { supabase }          from '../lib/supabase'
import { fetchCardMarketData } from '../lib/pokemonTcg'
import { STORE_ID }          from '../constants'
import Toast           from '../components/ui/Toast'
import Spinner         from '../components/ui/Spinner'

const USUARIOS = [
  { nombre: 'Kardia',  tel: '5491122541350' },
  { nombre: 'Sebas',   tel: '5491125284...' },
  { nombre: 'Melody',  tel: '5491159730...' },
]

export default function Settings() {
  const { blue, oficial, isLoading } = useDolar()
  const { margen, saveMargen, savingMargen } = useSettings()
  const [margenDraft, setMargenDraft] = useState(null)
  const [toast, setToast] = useState({ visible: false, mensaje: '' })

  // ── Revalidación de precios ────────────────────────────────────────────
  const [revalState, setRevalState] = useState('idle') // idle | running | done
  const [revalProgress, setRevalProgress] = useState({ current: 0, total: 0, updated: 0, noPrice: 0 })
  const [revalLog, setRevalLog] = useState([])  // últimas entradas para mostrar

  const showToast = (msg) => {
    setToast({ visible: true, mensaje: msg })
    setTimeout(() => setToast(t => ({ ...t, visible: false })), 2500)
  }

  const handleSaveMargen = async () => {
    const val = parseInt(margenDraft ?? margen)
    if (isNaN(val) || val < 0 || val > 200) return
    await saveMargen(val)
    setMargenDraft(null)
    showToast('Margen guardado')
  }

  const handleRevalidar = async () => {
    if (!blue) { showToast('Esperá a que cargue el dólar blue'); return }
    setRevalState('running')
    setRevalLog([])

    // 1. Traer todos los items de inventario con info de carta
    const { data: items, error } = await supabase
      .from('inventory')
      .select('id, price_usd, cards(name, set_name, card_number)')
      .eq('store_id', STORE_ID)
      .eq('status', 'disponible')

    if (error || !items) {
      showToast('Error al cargar inventario')
      setRevalState('idle')
      return
    }

    const total = items.length
    setRevalProgress({ current: 0, total, updated: 0, noPrice: 0 })

    let updated = 0, noPrice = 0
    const logLines = []

    for (let i = 0; i < items.length; i++) {
      const item  = items[i]
      const card  = item.cards
      if (!card) { noPrice++; continue }

      // Buscar precio en la API TCG
      const data = await fetchCardMarketData(card.name, card.card_number, card.set_name)
      const newUsd = data?.price_usd ?? null

      const cardLabel = `${card.name}${card.set_name ? ` · ${card.set_name}` : ''}`

      if (newUsd != null && newUsd > 0) {
        const newArsBlue  = Math.round(newUsd * blue)
        const newArsOfic  = oficial ? Math.round(newUsd * oficial) : null

        await supabase
          .from('inventory')
          .update({
            price_usd:         newUsd,
            price_ars_blue:    newArsBlue,
            price_ars_oficial: newArsOfic,
          })
          .eq('id', item.id)

        updated++
        const prev = item.price_usd
        const changed = prev != null && Math.abs(prev - newUsd) > 0.01
        if (changed || !prev) {
          logLines.unshift({
            label:  cardLabel,
            before: prev,
            after:  newUsd,
            ok:     true,
          })
        }
      } else {
        noPrice++
        logLines.unshift({ label: cardLabel, before: item.price_usd, after: null, ok: false })
      }

      setRevalProgress({ current: i + 1, total, updated, noPrice })
      // Mostrar solo las últimas 6 entradas en el log
      setRevalLog(logLines.slice(0, 6))
    }

    setRevalState('done')
    showToast(`✅ ${updated} cartas actualizadas · ${noPrice} sin precio`)
  }

  return (
    <>
    <div className="grid lg:grid-cols-2 gap-5 max-w-4xl">

      {/* Perfil de la tienda */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
        <h3 className="font-semibold text-gray-800 mb-4">Perfil de la tienda</h3>
        <div className="space-y-3">
          {[
            { label: 'Nombre',    value: 'Singles UT'          },
            { label: 'Dueños',    value: 'Sebas y Melo'        },
            { label: 'WhatsApp',  value: '+54 9 11 2528-4975'  },
            { label: 'Plan',      value: 'Membresía activa'    },
          ].map(r => (
            <div key={r.label}>
              <label className="text-xs text-gray-400 font-medium">{r.label}</label>
              <input
                defaultValue={r.value}
                className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm
                           focus:outline-none focus:ring-2 focus:ring-blue-200"
              />
            </div>
          ))}
          <button className="w-full py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm
                             font-semibold rounded-xl transition mt-2">
            Guardar cambios
          </button>
        </div>
      </div>

      {/* Usuarios autorizados */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-800">Usuarios autorizados</h3>
          <button className="px-3 py-1.5 bg-blue-600 text-white text-xs font-semibold
                             rounded-xl hover:bg-blue-500 transition">
            + Agregar
          </button>
        </div>
        <div className="space-y-2">
          {USUARIOS.map(u => (
            <div key={u.nombre}
              className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
              <div>
                <p className="font-medium text-gray-800 text-sm">{u.nombre}</p>
                <p className="text-xs text-gray-400">{u.tel}</p>
              </div>
              <span className="text-xs bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full font-medium">
                activo
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Tipo de cambio */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
        <h3 className="font-semibold text-gray-800 mb-4">Tipo de cambio actual</h3>
        {isLoading
          ? <p className="text-gray-400 text-sm">Cargando…</p>
          : (
            <div className="space-y-2">
              {[
                { label: 'Dólar Blue',    value: blue,    color: '#3B6BF5' },
                { label: 'Dólar Oficial', value: oficial, color: '#10B981' },
              ].map(r => (
                <div key={r.label}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                  <span className="text-sm text-gray-600">{r.label}</span>
                  <div className="text-right">
                    <span className="font-bold text-lg"
                      style={{ color: r.color }}>
                      ${Number(r.value || 0).toLocaleString('es-AR')}
                    </span>
                    <p className="text-xs text-gray-400">hoy</p>
                  </div>
                </div>
              ))}
            </div>
          )
        }
        <p className="text-xs text-gray-400 mt-3">Actualizado automáticamente · dolarapi.com</p>
      </div>

      {/* Margen de ganancia (Feature 3) */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
        <h3 className="font-semibold text-gray-800 mb-1">Margen de ganancia sugerido</h3>
        <p className="text-xs text-gray-400 mb-4">
          Se aplica al precio sugerido en ARS al registrar una carta nueva.
          <br />Fórmula: USD × dólar blue × (1 + margen%) → redondeado a $500 ARS.
        </p>
        <div className="flex items-center gap-3">
          <div className="relative flex items-center">
            <input
              type="number"
              min="0" max="200"
              value={margenDraft ?? margen}
              onChange={e => setMargenDraft(e.target.value)}
              className="w-24 border border-gray-200 rounded-xl px-3 py-2 text-sm text-center
                         focus:outline-none focus:ring-2 focus:ring-blue-200 font-bold text-gray-800"
            />
            <span className="absolute right-3 text-gray-400 text-sm font-semibold">%</span>
          </div>
          <button
            onClick={handleSaveMargen}
            disabled={savingMargen || margenDraft === null}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold
                       rounded-xl transition disabled:opacity-40"
          >
            {savingMargen ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
        <p className="text-xs text-gray-400 mt-3">
          Ejemplo con margen {margenDraft ?? margen}%:&nbsp;
          USD $45 × ${blue ? Math.round(blue) : '?'} blue = ${blue ? Math.round(45 * blue * (1 + (parseInt(margenDraft ?? margen) || 0) / 100) / 500) * 500 : '?'} ARS
        </p>
      </div>

      {/* Revalidar precios de mercado */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm lg:col-span-2">
        <div className="flex items-start justify-between gap-4 mb-1">
          <div>
            <h3 className="font-semibold text-gray-800">Revalidar precios de mercado</h3>
            <p className="text-xs text-gray-400 mt-0.5">
              Consulta la API de PokémonTCG para cada carta del inventario y actualiza
              el precio USD + ARS con los valores actuales del mercado.
            </p>
          </div>
          {revalState !== 'running' && (
            <button
              onClick={revalState === 'done' ? () => { setRevalState('idle'); setRevalLog([]) } : handleRevalidar}
              className={`shrink-0 px-4 py-2 text-sm font-semibold rounded-xl transition
                ${revalState === 'done'
                  ? 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  : 'bg-blue-600 text-white hover:bg-blue-500'}`}
            >
              {revalState === 'done' ? 'Reiniciar' : '🔄 Revalidar precios'}
            </button>
          )}
        </div>

        {/* Barra de progreso */}
        {(revalState === 'running' || revalState === 'done') && (
          <div className="mt-4 space-y-3">
            <div className="flex items-center justify-between text-xs text-gray-500">
              <span>
                {revalState === 'running'
                  ? `Procesando ${revalProgress.current} / ${revalProgress.total}…`
                  : `Finalizado — ${revalProgress.total} cartas procesadas`}
              </span>
              <div className="flex gap-3">
                <span className="text-emerald-600 font-semibold">✓ {revalProgress.updated} actualizadas</span>
                {revalProgress.noPrice > 0 && (
                  <span className="text-gray-400">{revalProgress.noPrice} sin precio</span>
                )}
              </div>
            </div>

            {/* Barra */}
            <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 rounded-full transition-all duration-300"
                style={{
                  width: revalProgress.total > 0
                    ? `${(revalProgress.current / revalProgress.total) * 100}%`
                    : '0%'
                }}
              />
            </div>

            {/* Log de cambios */}
            {revalLog.length > 0 && (
              <div className="border border-gray-100 rounded-xl overflow-hidden">
                <div className="bg-gray-50 px-3 py-1.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wide">
                  Últimos cambios detectados
                </div>
                {revalLog.map((entry, i) => (
                  <div key={i} className="flex items-center gap-2 px-3 py-1.5 border-t border-gray-50 text-xs">
                    <span className={`w-3 h-3 rounded-full shrink-0 ${entry.ok ? 'bg-emerald-400' : 'bg-gray-300'}`} />
                    <span className="flex-1 text-gray-700 truncate">{entry.label}</span>
                    {entry.ok ? (
                      <span className="shrink-0 font-mono text-gray-400">
                        {entry.before != null ? `$${Number(entry.before).toFixed(2)}` : '—'}
                        {' → '}
                        <span className="text-emerald-600 font-semibold">${Number(entry.after).toFixed(2)}</span>
                      </span>
                    ) : (
                      <span className="shrink-0 text-gray-400">sin precio</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Membresía */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
        <h3 className="font-semibold text-gray-800 mb-4">Membresía</h3>
        <div className="bg-blue-600 rounded-xl p-4 text-white mb-4">
          <p className="text-xs font-semibold opacity-70 uppercase tracking-wider mb-1">Plan activo</p>
          <p className="text-xl font-extrabold">Membresía mensual</p>
          <p className="text-sm opacity-80 mt-0.5">$50 USD/mes · Renovación automática</p>
        </div>
        <div className="space-y-2">
          {[
            'Scanner ilimitado en tiempo real',
            'Precios ARS incluidos',
            'Agente WhatsApp activo',
            'Dashboard completo',
          ].map(f => (
            <div key={f} className="flex items-center gap-2 text-sm text-gray-600">
              <span className="text-emerald-500 font-bold">✓</span>
              {f}
            </div>
          ))}
        </div>
      </div>

    </div>

    <Toast mensaje={toast.mensaje} tipo="success" visible={toast.visible} />
    </>
  )
}
