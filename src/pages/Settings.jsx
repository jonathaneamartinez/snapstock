import { useDolar } from '../hooks/useDolar'

export default function Settings() {
  const { blue, oficial, isLoading } = useDolar()

  return (
    <div className="space-y-6">
      <h2 className="font-extrabold text-gray-900 text-xl">Settings</h2>

      <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm space-y-4">
        <h3 className="font-semibold text-gray-800">Cotización dólar</h3>
        {isLoading
          ? <p className="text-gray-400 text-sm">Cargando…</p>
          : (
            <div className="flex gap-6">
              <div>
                <p className="text-xs text-gray-400">Blue</p>
                <p className="text-2xl font-bold text-blue-600">${blue?.toLocaleString('es-AR')}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400">Oficial</p>
                <p className="text-2xl font-bold text-gray-700">${oficial?.toLocaleString('es-AR')}</p>
              </div>
            </div>
          )
        }
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
        <h3 className="font-semibold text-gray-800 mb-2">Tienda</h3>
        <p className="text-sm text-gray-500">Singles UT · Buenos Aires</p>
      </div>
    </div>
  )
}
