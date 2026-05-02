import Spinner from '../ui/Spinner'

export default function ActionBar({ cantidad, onChange, onConfirmar, onVolver, loading }) {
  return (
    <div className="flex items-center gap-3">
      {/* Cantidad */}
      <div className="flex items-center gap-2 bg-white/5 rounded-xl px-2">
        <button
          onClick={() => onChange(Math.max(1, cantidad - 1))}
          className="w-9 h-9 text-white/70 hover:text-white text-xl font-bold"
        >−</button>
        <span className="text-white font-bold w-5 text-center">{cantidad}</span>
        <button
          onClick={() => onChange(cantidad + 1)}
          className="w-9 h-9 text-white/70 hover:text-white text-xl font-bold"
        >+</button>
      </div>

      {/* Volver */}
      <button
        onClick={onVolver}
        className="px-4 py-3 rounded-xl bg-white/5 text-white/50 text-sm hover:bg-white/10 transition"
      >
        Volver
      </button>

      {/* Confirmar */}
      <button
        onClick={onConfirmar}
        disabled={loading}
        className="flex-1 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50
                   text-white font-bold text-sm transition flex items-center justify-center gap-2"
      >
        {loading ? <Spinner size={18} /> : '✓ Confirmar'}
      </button>
    </div>
  )
}
