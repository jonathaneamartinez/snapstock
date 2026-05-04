import { useState, useRef, useEffect } from 'react'
import Spinner from './Spinner'

const fmtARS = (n) =>
  n != null ? `$${Number(n).toLocaleString('es-AR', { maximumFractionDigits: 0 })}` : null

/**
 * Celda editable inline.
 * Props:
 *   value        – valor actual
 *   onSave       – async fn(nuevoValor) → llamado al guardar
 *   type         – 'text' | 'number'
 *   placeholder  – texto del input vacío
 *   formatDisplay– fn opcional para formatear el valor mostrado
 *   emptyLabel   – texto cuando no hay valor (default '—')
 *   showPencil   – mostrar lápiz solo al hacer hover (default true)
 */
export default function InlineEdit({
  value,
  onSave,
  type = 'text',
  placeholder = '',
  formatDisplay,
  emptyLabel = '—',
  showPencil = true,
}) {
  const [editing, setEditing] = useState(false)
  const [draft,   setDraft]   = useState('')
  const [saving,  setSaving]  = useState(false)
  const inputRef = useRef(null)

  const start = () => {
    setDraft(value != null ? String(value) : '')
    setEditing(true)
  }

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [editing])

  const save = async () => {
    if (!editing) return
    setEditing(false)
    setSaving(true)
    try {
      const parsed = draft === ''
        ? null
        : type === 'number' ? parseFloat(draft) : draft.trim()
      // Solo guardar si cambió
      if (parsed !== (value ?? null)) {
        await onSave(parsed)
      }
    } finally {
      setSaving(false)
    }
  }

  const cancel = () => {
    setEditing(false)
    setDraft('')
  }

  if (saving) {
    return (
      <span className="flex items-center gap-1 text-gray-400 text-xs whitespace-nowrap">
        <Spinner size={11} /> Guardando…
      </span>
    )
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        type={type}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={save}
        onKeyDown={e => {
          if (e.key === 'Enter')  { e.preventDefault(); save() }
          if (e.key === 'Escape') { e.preventDefault(); cancel() }
        }}
        placeholder={placeholder}
        className="w-full min-w-[72px] border border-blue-400 rounded-lg px-2 py-0.5 text-xs
                   bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-300"
      />
    )
  }

  const displayed = formatDisplay ? formatDisplay(value) : (value != null && value !== '' ? String(value) : null)

  return (
    <span
      className="group inline-flex items-center gap-1 cursor-pointer min-w-[40px]"
      onClick={start}
      title="Clic para editar"
    >
      <span className={displayed ? 'text-gray-700' : 'text-gray-300'}>
        {displayed ?? emptyLabel}
      </span>
      {showPencil && (
        <span className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-blue-500 transition-opacity text-[10px] leading-none">
          ✏
        </span>
      )}
    </span>
  )
}
