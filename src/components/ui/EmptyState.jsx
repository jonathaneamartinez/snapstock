export default function EmptyState({ emoji = '📭', img, title, sub }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
      {img
        ? <img src={img} alt="" className="w-16 h-auto object-contain opacity-60 mb-1 drop-shadow-md" />
        : <span className="text-5xl">{emoji}</span>
      }
      <p className="font-semibold text-gray-700">{title}</p>
      {sub && <p className="text-sm text-gray-400 max-w-xs">{sub}</p>}
    </div>
  )
}
