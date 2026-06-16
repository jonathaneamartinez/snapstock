import { FINISH_MAP } from '../../constants'

const COLOR_CLASSES = {
  gray:   'bg-gray-100 text-gray-600',
  yellow: 'bg-yellow-100 text-yellow-700',
  blue:   'bg-blue-100 text-blue-700',
  red:    'bg-red-100 text-red-700',
  purple: 'bg-purple-100 text-purple-700',
  amber:  'bg-amber-100 text-amber-700',
  green:  'bg-green-100 text-green-700',
  teal:   'bg-teal-100 text-teal-700',
  orange: 'bg-orange-100 text-orange-700',
  indigo: 'bg-indigo-100 text-indigo-700',
}

/**
 * Badge que muestra la variante de una carta (1st Edition, Shadowless, etc.)
 * No renderiza nada si finish es 'normal' o vacío.
 *
 * Props:
 *   finish  {string}  — valor del campo finish/variant
 *   size    {'xs'|'sm'} — tamaño del badge (default: 'xs')
 */
export default function FinishBadge({ finish, size = 'xs' }) {
  if (!finish || finish === 'normal') return null

  const def = FINISH_MAP[finish]
  if (!def) return null

  const colorCls = COLOR_CLASSES[def.color] ?? COLOR_CLASSES.gray
  const sizeCls  = size === 'sm'
    ? 'px-1.5 py-0.5 text-[11px]'
    : 'px-1 py-px text-[10px]'

  return (
    <span className={`inline-flex items-center gap-0.5 rounded font-semibold leading-none ${sizeCls} ${colorCls}`}>
      {def.icon && <span className="leading-none">{def.icon}</span>}
      {def.label}
    </span>
  )
}
