import { useDeudas } from '../hooks/useDeudas'
import Spinner      from '../components/ui/Spinner'
import EmptyState   from '../components/ui/EmptyState'

const fmtARS = (n) => `$${Number(n || 0).toLocaleString('es-AR', { maximumFractionDigits: 0 })}`

export default function Deudas() {
  const { data, isLoading, error, refetch } = useDeudas()

  const reservasActivas = data?.reduce((s, d) => s + d.items.length, 0) ?? 0
  const deudaTotal      = data?.reduce((s, d) => s + d.total, 0) ?? 0
  const ahora           = Date.now()
  const vencidos        = data?.filter(d => {
    const diasMax = Math.max(...(d.items.map(i => {
      const diff = ahora - new Date(i.created_at || Date.now()).getTime()
      return diff / 86400000
    })))
    return diasMax > 7
  }).length ?? 0

  return (
    <div className="space-y-5">
      {/* KPIs */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm">
          <p className="text-xs text-gray-400 mb-1">Reservas activas</p>
          <p className="text-2xl font-extrabold text-amber-500">{reservasActivas} cartas</p>
          <p className="text-xs text-gray-400 mt-0.5">en poder de clientes</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm">
          <p className="text-xs text-gray-400 mb-1">Deuda total</p>
          <p className="text-2xl font-extrabold text-gray-800">{fmtARS(deudaTotal)}</p>
          <p className="text-xs text-gray-400 mt-0.5">ARS pendiente</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm">
          <p className="text-xs text-gray-400 mb-1">Vencidas +7 días</p>
          <p className="text-2xl font-extrabold text-red-500">{vencidos} clientes</p>
          <p className="text-xs text-gray-400 mt-0.5">requieren seguimiento</p>
        </div>
      </div>

      {/* Tabla compradores */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-semibold text-gray-800">Compradores con reservas activas</h3>
          <button className="px-3 py-1.5 bg-blue-600 text-white text-xs font-semibold rounded-xl hover:bg-blue-500 transition">
            + Agregar reserva
          </button>
        </div>

        {isLoading && <div className="flex justify-center py-12"><Spinner size={32} className="text-blue-400" /></div>}
        {error     && <p className="text-red-500 text-sm p-6">{error.message}</p>}
        {!isLoading && data?.length === 0 && (
          <EmptyState emoji="🎉" title="Sin deudas activas" sub="Todo cobrado" />
        )}

        {!isLoading && data?.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                <tr>
                  {['Comprador','Contacto','Cartas','Monto ARS','Días','Estado','Acción'].map(h => (
                    <th key={h} className="px-4 py-3 text-left font-semibold whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.map(d => {
                  const dias = 0 // sin created_at en la view por ahora
                  const estado = d.total > 0 ? 'pendiente' : 'cobrado'
                  return (
                    <tr key={d.buyer} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-semibold text-gray-800">{d.buyer}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{d.contact || '—'}</td>
                      <td className="px-4 py-3 font-medium text-gray-700">{d.items.length}</td>
                      <td className="px-4 py-3 font-bold text-amber-600 whitespace-nowrap">{fmtARS(d.total)}</td>
                      <td className="px-4 py-3 text-gray-500">{dias}d</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium
                          ${estado === 'cobrado'   ? 'bg-emerald-100 text-emerald-700' :
                            estado === 'parcial'   ? 'bg-blue-100 text-blue-700' :
                            'bg-amber-100 text-amber-700'}`}>
                          {estado}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1">
                          <button className="px-2 py-1 bg-emerald-50 text-emerald-700 text-xs font-semibold rounded-lg hover:bg-emerald-100 transition">
                            Cobrar
                          </button>
                          <button className="px-2 py-1 bg-gray-50 text-gray-600 text-xs font-semibold rounded-lg hover:bg-gray-100 transition">
                            Liberar
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
