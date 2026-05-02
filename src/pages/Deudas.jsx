import { useDeudas } from '../hooks/useDeudas'
import Spinner      from '../components/ui/Spinner'
import EmptyState   from '../components/ui/EmptyState'

const fmt = (n) => `$${Number(n).toLocaleString('es-AR', { maximumFractionDigits: 0 })}`

export default function Deudas() {
  const { data, isLoading, error } = useDeudas()

  return (
    <div className="space-y-4">
      <h2 className="font-extrabold text-gray-900 text-xl">Deudas activas</h2>

      {isLoading && <div className="flex justify-center py-16"><Spinner size={32} className="text-blue-400" /></div>}
      {error     && <p className="text-red-500 text-sm">{error.message}</p>}
      {!isLoading && data?.length === 0 && (
        <EmptyState emoji="🎉" title="Sin deudas activas" sub="Todo cobrado" />
      )}

      <div className="space-y-3">
        {data?.map(d => (
          <div key={d.buyer} className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="font-bold text-gray-900">{d.buyer}</p>
                {d.contact && <p className="text-xs text-gray-400">{d.contact}</p>}
              </div>
              <span className="text-amber-600 font-extrabold text-lg">{fmt(d.total)}</span>
            </div>
            <div className="space-y-1.5">
              {d.items.map(item => (
                <div key={item.inventory_id} className="flex items-center gap-2 text-sm">
                  {item.image_url && (
                    <img src={item.image_url} alt="" className="w-6 h-9 object-cover rounded" />
                  )}
                  <span className="flex-1 text-gray-700 truncate">{item.nombre_base}</span>
                  <span className="text-gray-400 text-xs">
                    {item.quantity}x · {fmt(item.price_ars_blue)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
