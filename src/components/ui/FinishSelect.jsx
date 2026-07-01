import { FINISH_OPTIONS } from '../../constants'

/**
 * <select> de variante/finish reutilizable.
 * Usa appearance-none + chevron propio para que la flecha nunca se solape
 * con el texto (el arrow nativo no respeta el padding en columnas angostas).
 * Props:
 *   value     {string}
 *   onChange  {(value: string) => void}
 *   className {string}
 *   size      {'sm'|'md'}
 */
export default function FinishSelect({ value = 'normal', onChange, className = '', size = 'md', disabled = false }) {
  const sizeCls = size === 'sm'
    ? 'pl-2 pr-6 py-1 text-xs'
    : 'pl-3 pr-7 py-2 text-sm'

  return (
    <div className={`relative inline-block ${className}`}>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        disabled={disabled}
        className={`appearance-none w-full border border-gray-200 rounded-lg bg-white truncate
                    focus:outline-none focus:ring-2 focus:ring-blue-200 cursor-pointer ${sizeCls}
                    disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed disabled:opacity-60`}
      >
        {FINISH_OPTIONS.map(f => (
          <option key={f.value} value={f.value}>
            {f.icon ? `${f.icon} ${f.label}` : f.label}
          </option>
        ))}
      </select>
      <span className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-400 text-[10px]">
        ▾
      </span>
    </div>
  )
}
