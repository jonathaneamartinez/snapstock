import { useState } from 'react'
import { useQueryClient }   from '@tanstack/react-query'
import { useDolar }         from '../hooks/useDolar'
import { useSettings, PRICE_SOURCES } from '../hooks/useSettings'
import { revalidarPrecios } from '../lib/revalidarPrecios'
import Toast  from '../components/ui/Toast'
import Spinner from '../components/ui/Spinner'
import { CLIENT_ID } from '../constants'

// Usuarios autorizados por cliente (WhatsApp)
const USUARIOS_MAP = {
  'jonat': [
    { nombre: 'Jonat', tel: '5491122544135' },
  ],
  'singles-ut': [
    { nombre: 'Kardia',  tel: '5491122541350' },
    { nombre: 'Sebas',   tel: '5491125284...' },
    { nombre: 'Melody',  tel: '5491159730...' },
    { nombre: 'Mayra',   tel: '5491132583386' },
  ],
}

const USUARIOS = USUARIOS_MAP[CLIENT_ID] ?? []

const LS_KEY = 'ss_last_price_update'

export default function Settings() {
  const queryClient = useQueryClient()
  const { blue, oficial, isLoading } = useDolar()
  const { margen, saveMargen, savingMargen, precioFuente, savePrecioFuente, savingFuente, storeName, ownerName, whatsappNumber } = useSettings()
  const [margenDraft, setMargenDraft] = useState(null)
  const [toast, setToast] = useState({ visible: false, mensaje: '' })

  // ── Revalidación de precios ────────────────────────────────────────────
  const [revalState,    setRevalState]    = useState('idle') // idle | running | done
  const [revalProgress, setRevalProgress] = useState({ current: 0, total: 0, updated: 0, noPrice: 0 })
  const [revalLog,      setRevalLog]      = useState([])

  // Mostrar cuándo fue la última actualización automática
  const lastUpdate = (() => {
    const ts = localStorage.getItem(LS_KEY)
    if (!ts) return null
    return new Date(parseInt(ts, 10)).toLocaleString('es-AR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  })()

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
    setRevalProgress({ current: 0, total: 0, updated: 0, noPrice: 0 })

    const logLines = []

    const { updated, noPrice, total } = await revalidarPrecios({
      blue,
      oficial,
      onProgress: ({ current, total, updated, noPrice, entry }) => {
        setRevalProgress({ current, total, updated, noPrice })
        if (entry && (entry.ok || !entry.ok)) {
          // Mostrar solo entradas con cambio real o sin precio
          const prev = entry.before
          const changed = entry.ok && (prev == null || Math.abs(prev - entry.after) > 0.01)
          if (changed || (!entry.ok)) {
            logLines.unshift(entry)
            setRevalLog([...logLines.slice(0, 6)])
          }
        }
      },
    })

    setRevalState('done')
    // Guardar timestamp y refrescar queries
    localStorage.setItem(LS_KEY, String(Date.now()))
    queryClient.invalidateQueries({ queryKey: ['stock'] })
    queryClient.invalidateQueries({ queryKey: ['metricas'] })
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
            { label: 'Nombre',    value: storeName                    },
            { label: 'Dueño',     value: ownerName                    },
            { label: 'WhatsApp',  value: `+${whatsappNumber}`         },
            { label: 'Plan',      value: 'Membresía activa'           },
          ].map(r => (
            <div key={r.label}>
              <label className="text-xs text-gray-400 font-medium">{r.label}</label>
              <input
                readOnly
                value={r.value}
                className="mt-1 w-full border border-gray-100 rounded-xl px-3 py-2 text-sm
                           bg-gray-50 text-gray-600 cursor-default select-none outline-none"
              />
            </div>
          ))}
        </div>
      </div>

      {/* Usuarios autorizados */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-800">Usuarios autorizados</h3>
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

      {/* Proveedor de precio base */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
        <h3 className="font-semibold text-gray-800 mb-1">Proveedor de precio base</h3>
        <p className="text-xs text-gray-400 mb-4">
          Se usa en el dashboard y en el agente de WhatsApp para mostrar el precio de mercado.
          Podés overridear carta por carta desde el stock.
        </p>
        <div className="flex gap-3 flex-wrap">
          {PRICE_SOURCES.map(src => (
            <button
              key={src.id}
              onClick={() => savePrecioFuente(src.id)}
              disabled={savingFuente}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 text-sm font-semibold transition
                ${precioFuente === src.id
                  ? 'border-blue-600 bg-blue-50 text-blue-700'
                  : 'border-gray-200 bg-white text-gray-600 hover:border-blue-300'}`}
            >
              <span className="text-base">{src.flag}</span>
              <span>{src.label}</span>
              <span className="text-xs font-normal text-gray-400">{src.currency}</span>
              {precioFuente === src.id && <span className="text-blue-500 text-xs">✓ activo</span>}
            </button>
          ))}
        </div>
        <p className="text-xs text-gray-400 mt-3">
          TCGPlayer = mercado USA · CardMarket = mercado europeo (EUR → USD estimado)
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
              Se ejecuta automáticamente 1 vez por día al abrir la app.
            </p>
            {lastUpdate && (
              <p className="text-[11px] text-emerald-600 font-medium mt-1">
                ✓ Última actualización: {lastUpdate}
              </p>
            )}
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
