import { useState } from 'react'
import { motion } from 'framer-motion'
import HoloCard from './HoloCard'
import ActionBar from './ActionBar'
import { CONDICIONES, CONDICION_LABELS } from '../../constants'

const fmt = (n) => n != null ? `$${Number(n).toLocaleString('es-AR', { minimumFractionDigits: 0 })}` : '—'
const fmtUSD = (n) => n != null ? `U$D ${Number(n).toFixed(2)}` : '—'

export default function CardResult({ carta, onConfirmar, onVolver, loading }) {
  const [condicion, setCondicion] = useState('NM')
  const [cantidad,  setCantidad]  = useState(1)
  const [accion,    setAccion]    = useState('agregar')

  if (!carta) return null

  return (
    <motion.div
      initial={{ y: '100%', opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{    y: '100%', opacity: 0 }}
      transition={{ type: 'spring', damping: 22, stiffness: 280 }}
      className="fixed inset-x-0 bottom-0 z-40 bg-[#0d0d1e] rounded-t-3xl shadow-2xl
                 border-t border-white/10 pb-safe"
      style={{ maxHeight: '80vh', overflowY: 'auto' }}
    >
      {/* Handle */}
      <div className="flex justify-center pt-3 pb-1">
        <div className="w-10 h-1 rounded-full bg-white/20" />
      </div>

      <div className="px-5 pb-6 space-y-4">
        {/* Carta + datos */}
        <div className="flex gap-4 items-start">
          <HoloCard
            imagen={carta.imagen}
            holoLevel={carta.holo_level || 'normal'}
            alt={carta.nombre}
          />
          <div className="flex-1 space-y-1.5">
            <p className="text-white font-bold text-lg leading-tight">{carta.nombre}</p>
            <p className="text-white/50 text-sm">{carta.set} · #{carta.numero}</p>
            {carta.rareza && <p className="text-white/40 text-xs">{carta.rareza}</p>}
            <div className="mt-3 space-y-1">
              <PrecioRow label="USD"      value={fmtUSD(carta.precio_usd)}        />
              <PrecioRow label="ARS Blue" value={fmt(carta.precio_ars_blue)}      accent />
              <PrecioRow label="ARS Ofic" value={fmt(carta.precio_ars_oficial)}   />
            </div>
          </div>
        </div>

        {/* Acción */}
        <div className="flex gap-2">
          {[
            { key: 'agregar',   label: '+ Stock'  },
            { key: 'vender',    label: '$ Vender' },
            { key: 'reservar',  label: '🔒 Reservar' },
          ].map(a => (
            <button
              key={a.key}
              onClick={() => setAccion(a.key)}
              className={`flex-1 py-2 rounded-xl text-sm font-semibold transition
                ${accion === a.key
                  ? 'bg-blue-600 text-white'
                  : 'bg-white/5 text-white/50 hover:bg-white/10'}`}
            >
              {a.label}
            </button>
          ))}
        </div>

        {/* Condición */}
        <div className="flex gap-2 flex-wrap">
          {CONDICIONES.map(c => (
            <button
              key={c}
              onClick={() => setCondicion(c)}
              title={CONDICION_LABELS[c]}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition
                ${condicion === c
                  ? 'bg-blue-600 text-white'
                  : 'bg-white/5 text-white/50 hover:bg-white/10'}`}
            >
              {c}
            </button>
          ))}
        </div>

        {/* ActionBar: cantidad + confirmar */}
        <ActionBar
          cantidad={cantidad}
          onChange={setCantidad}
          onConfirmar={() => onConfirmar({ carta, cantidad, condicion, accion })}
          onVolver={onVolver}
          loading={loading}
        />
      </div>
    </motion.div>
  )
}

function PrecioRow({ label, value, accent }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-white/40 text-xs">{label}</span>
      <span className={`text-sm font-semibold ${accent ? 'text-blue-400' : 'text-white/80'}`}>{value}</span>
    </div>
  )
}
