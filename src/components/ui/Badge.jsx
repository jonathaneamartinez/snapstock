const VARIANTS = {
  disponible: 'bg-emerald-100 text-emerald-700',
  reservada:  'bg-amber-100 text-amber-700',
  vendida:    'bg-slate-100 text-slate-500',
  NM:  'bg-emerald-100 text-emerald-700',
  LP:  'bg-blue-100 text-blue-700',
  MP:  'bg-yellow-100 text-yellow-700',
  HP:  'bg-orange-100 text-orange-700',
  DMG: 'bg-red-100 text-red-700',
}

export default function Badge({ label, className = '' }) {
  const cls = VARIANTS[label] ?? 'bg-gray-100 text-gray-600'
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cls} ${className}`}>
      {label}
    </span>
  )
}
