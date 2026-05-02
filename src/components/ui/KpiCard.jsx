import Spinner from './Spinner'

export default function KpiCard({ label, value, sub, icon, color = 'text-blue-600', loading }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-5 flex flex-col gap-2 shadow-sm">
      <div className="flex items-center justify-between">
        <span className="text-sm text-gray-500">{label}</span>
        {icon && <span className="text-xl">{icon}</span>}
      </div>
      {loading
        ? <Spinner size={28} className="text-blue-400 mt-1" />
        : <span className={`text-2xl font-bold tracking-tight ${color}`}>{value ?? '—'}</span>
      }
      {sub && <span className="text-xs text-gray-400">{sub}</span>}
    </div>
  )
}
