import { FINISH_OPTIONS } from '../../constants'

/**
 * <select> de variante/finish reutilizable.
 * Props:
 *   value     {string}
 *   onChange  {(value: string) => void}
 *   className {string}
 *   size      {'sm'|'md'}
 */
export default function FinishSelect({ value = 'normal', onChange, className = '', size = 'md' }) {
  const sizeCls = size === 'sm'
    ? 'px-2 py-1 text-xs'
    : 'px-3 py-2 text-sm'

  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className={`border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-200 ${sizeCls} ${className}`}
    >
      {FINISH_OPTIONS.map(f => (
        <option key={f.value} value={f.value}>
          {f.icon ? `${f.icon} ${f.label}` : f.label}
        </option>
      ))}
    </select>
  )
}
