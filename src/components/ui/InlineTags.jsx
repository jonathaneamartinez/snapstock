import { useState, useRef } from 'react'

/**
 * InlineTags — editor inline de etiquetas (array de strings)
 * Uso: <InlineTags tags={row.tags} onAdd={fn} onRemove={fn} />
 */
export default function InlineTags({ tags = [], onAdd, onRemove, placeholder = '+ etiqueta' }) {
  const [input, setInput] = useState('')
  const inputRef = useRef(null)

  const commit = () => {
    const val = input.trim()
    if (!val) return
    if (tags.some(t => t.toLowerCase() === val.toLowerCase())) {
      setInput('')
      return
    }
    onAdd?.(val)
    setInput('')
  }

  return (
    <div className="flex flex-wrap items-center gap-1 min-w-[80px]">
      {tags.map(tag => (
        <span
          key={tag}
          className="inline-flex items-center gap-0.5 px-1.5 py-0.5
                     bg-violet-100 text-violet-700 rounded-full text-[10px] font-medium
                     whitespace-nowrap"
        >
          {tag}
          <button
            onClick={() => onRemove?.(tag)}
            className="ml-0.5 text-violet-400 hover:text-violet-700 leading-none transition"
          >
            ×
          </button>
        </span>
      ))}
      <input
        ref={inputRef}
        value={input}
        onChange={e => setInput(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); commit() }
          if (e.key === 'Escape') { setInput(''); inputRef.current?.blur() }
        }}
        onBlur={commit}
        placeholder={tags.length ? '+ tag' : placeholder}
        className="text-[10px] text-gray-400 placeholder-gray-300 bg-transparent
                   border-none outline-none w-16 min-w-0"
      />
    </div>
  )
}
