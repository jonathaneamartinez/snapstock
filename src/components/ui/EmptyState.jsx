export default function EmptyState({ emoji = '📭', title, sub }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
      <span className="text-5xl">{emoji}</span>
      <p className="font-semibold text-gray-700">{title}</p>
      {sub && <p className="text-sm text-gray-400 max-w-xs">{sub}</p>}
    </div>
  )
}
