import { useDolar } from '../hooks/useDolar'

const USUARIOS = [
  { nombre: 'Kardia',  tel: '5491122541350' },
  { nombre: 'Sebas',   tel: '5491125284...' },
  { nombre: 'Melody',  tel: '5491159730...' },
]

export default function Settings() {
  const { blue, oficial, isLoading } = useDolar()

  return (
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
  )
}
