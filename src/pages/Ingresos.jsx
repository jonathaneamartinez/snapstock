import { useState } from 'react'
import { Link } from 'react-router-dom'
import { scannerApi } from '../lib/scanner'
import { CONDICIONES, IDIOMAS, STORE_ID } from '../constants'
import Toast from '../components/ui/Toast'
import Spinner from '../components/ui/Spinner'

export default function Ingresos() {
  const [form, setForm] = useState({
    nombre: '', set: '', numero: '', cantidad: 1,
    condicion: 'NM', idioma: 'en', precio: '',
  })
  const [loading, setLoading] = useState(false)
  const [toast,   setToast]   = useState({ visible: false, msg: '', tipo: 'success' })

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.nombre.trim()) return
    setLoading(true)
    try {
      const res = await scannerApi.confirmar({
        store_id: STORE_ID,
        carta: {
          nombre:    form.nombre,
          set:       form.set,
          numero:    form.numero,
          idioma:    form.idioma,
          precio_usd: parseFloat(form.precio) || 0,
        },
        cantidad:  parseInt(form.cantidad) || 1,
        condicion: form.condicion,
        accion:    'agregar',
      })
      if (res.guardado) {
        showToast('✅ Carta agregada al stock')
        setForm({ nombre: '', set: '', numero: '', cantidad: 1, condicion: 'NM', idioma: 'en', precio: '' })
      } else {
        showToast(res.mensaje || 'Error al guardar', 'error')
      }
    } catch (err) {
      showToast('Error al conectar con el servidor', 'error')
    } finally {
      setLoading(false)
    }
  }

  const showToast = (msg, tipo = 'success') => {
    setToast({ visible: true, msg, tipo })
    setTimeout(() => setToast(t => ({ ...t, visible: false })), 2500)
  }

  return (
    <div className="max-w-xl space-y-5">
      <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
        <h3 className="font-semibold text-gray-800 mb-5">Registrar nuevas cartas</h3>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Nombre + Set */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 font-medium mb-1 block">Nombre de la carta</label>
              <input
                value={form.nombre}
                onChange={e => set('nombre', e.target.value)}
                placeholder="Ej: Charizard ex"
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm
                           focus:outline-none focus:ring-2 focus:ring-blue-200"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 font-medium mb-1 block">Set / Edición</label>
              <input
                value={form.set}
                onChange={e => set('set', e.target.value)}
                placeholder="Ej: Obsidian Flames"
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm
                           focus:outline-none focus:ring-2 focus:ring-blue-200"
              />
            </div>
          </div>

          {/* Número + Cantidad */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 font-medium mb-1 block">Número de carta</label>
              <input
                value={form.numero}
                onChange={e => set('numero', e.target.value)}
                placeholder="Ej: 125"
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm
                           focus:outline-none focus:ring-2 focus:ring-blue-200"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 font-medium mb-1 block">Cantidad</label>
              <input
                type="number" min="1"
                value={form.cantidad}
                onChange={e => set('cantidad', e.target.value)}
                placeholder="Ej: 3"
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm
                           focus:outline-none focus:ring-2 focus:ring-blue-200"
              />
            </div>
          </div>

          {/* Condición + Idioma */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 font-medium mb-1 block">Condición</label>
              <select
                value={form.condicion}
                onChange={e => set('condicion', e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white"
              >
                {CONDICIONES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 font-medium mb-1 block">Idioma</label>
              <select
                value={form.idioma}
                onChange={e => set('idioma', e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white"
              >
                {IDIOMAS.map(i => (
                  <option key={i.code} value={i.code}>{i.flag} {i.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Precio de costo */}
          <div>
            <label className="text-xs text-gray-500 font-medium mb-1 block">Precio de costo (USD)</label>
            <input
              type="number" step="0.01" min="0"
              value={form.precio}
              onChange={e => set('precio', e.target.value)}
              placeholder="Ej: 25.00"
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm
                         focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
          </div>

          {/* Tip scanner */}
          <p className="text-xs text-gray-400 bg-blue-50 rounded-xl px-4 py-3">
            También podés usar el{' '}
            <Link to="/scanner" className="text-blue-600 font-semibold hover:underline">
              scanner por cámara
            </Link>
            {' '}desde el celular para identificar la carta automáticamente.
          </p>

          <button
            type="submit"
            disabled={loading || !form.nombre.trim()}
            className="w-full py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-50
                       text-white font-bold rounded-xl transition flex items-center justify-center gap-2"
          >
            {loading ? <Spinner size={18} /> : 'Agregar al stock'}
          </button>
        </form>
      </div>

      <Toast mensaje={toast.msg} tipo={toast.tipo} visible={toast.visible} />
    </div>
  )
}
