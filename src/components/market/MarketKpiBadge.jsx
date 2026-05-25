/**
 * MarketKpiBadge
 * ─────────────────────────────────────────────────────────────
 * Badge compacto que muestra el KPI VOID (0-100) y el estado de mercado
 * de una carta. Pensado para usar inline en tablas, listas y cards.
 *
 * Props:
 *   kpiScore  — número 0-100 o null
 *   kpiState  — string: 'subida_sana'|'explotada'|'mercado_frio'|
 *                       'saturada'|'normal'|'sin_datos'
 *   size      — 'sm' (default) | 'md' | 'lg'
 *   showLabel — mostrar label textual además del score (default false)
 *   loading   — mostrar skeleton (default false)
 */
export default function MarketKpiBadge({
  kpiScore,
  kpiState = 'sin_datos',
  size = 'sm',
  showLabel = false,
  loading = false,
}) {
  if (loading) {
    return (
      <span className="inline-block h-5 w-12 rounded-full bg-gray-200 animate-pulse" />
    )
  }

  if (kpiScore == null || kpiState === 'sin_datos') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full
                       bg-gray-100 text-gray-400 text-xs font-medium">
        <span>—</span>
      </span>
    )
  }

  const config = KPI_STATE_CONFIG[kpiState] ?? KPI_STATE_CONFIG.normal
  const sizeClass = SIZE_CLASSES[size] ?? SIZE_CLASSES.sm

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-semibold
                  ${config.bg} ${config.text} ${sizeClass}`}
      title={`KPI ${kpiScore.toFixed(1)} — ${config.label}`}
    >
      <span>{config.icon}</span>
      <span>{Math.round(kpiScore)}</span>
      {showLabel && (
        <span className="hidden sm:inline opacity-80">{config.label}</span>
      )}
    </span>
  )
}

// ── Configuración visual por estado ─────────────────────────────────────────

export const KPI_STATE_CONFIG = {
  subida_sana: {
    icon:  '🚀',
    label: 'Subida sana',
    bg:    'bg-emerald-100',
    text:  'text-emerald-700',
    dot:   'bg-emerald-500',
    description: 'Precio subiendo con liquidez saludable — buen momento para vender a precio alto.',
  },
  explotada: {
    icon:  '🔥',
    label: 'Explotada',
    bg:    'bg-orange-100',
    text:  'text-orange-700',
    dot:   'bg-orange-500',
    description: 'Precio en pico máximo — puede corregir pronto. Vender ya si tenés stock.',
  },
  mercado_frio: {
    icon:  '❄️',
    label: 'Mercado frío',
    bg:    'bg-blue-100',
    text:  'text-blue-600',
    dot:   'bg-blue-400',
    description: 'Demanda baja y precio cayendo — no es buen momento para reponer.',
  },
  saturada: {
    icon:  '📉',
    label: 'Saturada',
    bg:    'bg-red-100',
    text:  'text-red-600',
    dot:   'bg-red-500',
    description: 'Demasiada oferta en el mercado — precio bajo presión, difícil de vender.',
  },
  normal: {
    icon:  '📊',
    label: 'Normal',
    bg:    'bg-gray-100',
    text:  'text-gray-600',
    dot:   'bg-gray-400',
    description: 'Mercado estable sin señales claras de movimiento.',
  },
  sin_datos: {
    icon:  '—',
    label: 'Sin datos',
    bg:    'bg-gray-50',
    text:  'text-gray-400',
    dot:   'bg-gray-300',
    description: 'No hay datos de mercado disponibles todavía.',
  },
}

const SIZE_CLASSES = {
  sm: 'px-2 py-0.5 text-xs',
  md: 'px-2.5 py-1 text-sm',
  lg: 'px-3 py-1.5 text-base',
}
