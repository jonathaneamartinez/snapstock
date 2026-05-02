// Recuadro de la cámara con estado visual
// estado: 'idle' → rojo, 'detecting' → amarillo, 'identified' → verde

const COLORS = {
  idle:       { border: '#ef4444', glow: 'rgba(239,68,68,0.4)',  pulse: true  },
  detecting:  { border: '#f59e0b', glow: 'rgba(245,158,11,0.5)', pulse: false },
  identified: { border: '#10b981', glow: 'rgba(16,185,129,0.6)', pulse: false },
  confirming: { border: '#3b82f6', glow: 'rgba(59,130,246,0.5)', pulse: false },
  success:    { border: '#10b981', glow: 'rgba(16,185,129,0.8)', pulse: false },
  error:      { border: '#ef4444', glow: 'rgba(239,68,68,0.5)',  pulse: false },
}

export default function Viewfinder({ estado }) {
  const c = COLORS[estado] ?? COLORS.idle

  return (
    <div
      className="relative w-full rounded-2xl overflow-hidden"
      style={{
        aspectRatio: '3/4',
        boxShadow: `0 0 0 3px ${c.border}, 0 0 30px ${c.glow}`,
        transition: 'box-shadow 0.3s ease',
      }}
    >
      {/* Esquinas decorativas */}
      {[
        'top-2 left-2 border-t-2 border-l-2 rounded-tl-lg',
        'top-2 right-2 border-t-2 border-r-2 rounded-tr-lg',
        'bottom-2 left-2 border-b-2 border-l-2 rounded-bl-lg',
        'bottom-2 right-2 border-b-2 border-r-2 rounded-br-lg',
      ].map((cls, i) => (
        <div
          key={i}
          className={`absolute w-6 h-6 pointer-events-none z-10 ${cls}`}
          style={{ borderColor: c.border, transition: 'border-color 0.3s ease' }}
        />
      ))}

      {/* Línea de scan animada cuando está buscando */}
      {estado === 'idle' && (
        <div
          className="absolute left-0 right-0 h-0.5 z-10 pointer-events-none"
          style={{
            background: `linear-gradient(90deg, transparent, ${c.border}, transparent)`,
            animation: 'scanLine 2s ease-in-out infinite',
          }}
        />
      )}

      {/* Slot para el video — el componente padre pone el <video> dentro */}
    </div>
  )
}
