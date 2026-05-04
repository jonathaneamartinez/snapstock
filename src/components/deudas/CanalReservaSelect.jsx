import { useState } from 'react'
import { supabase } from '../../lib/supabase'

const OPTIONS = [
  { value: 'claims',          label: 'Claims'          },
  { value: 'charly',          label: 'Charly'          },
  { value: 'fuera_de_evento', label: 'Fuera de evento' },
]

const LABEL_MAP = Object.fromEntries(OPTIONS.map(o => [o.value, o.label]))

export default function CanalReservaSelect({ inventoryId, value, onSaved }) {
  const [saving, setSaving] = useState(false)

  const handleChange = async (e) => {
    const canal = e.target.value || null
    setSaving(true)
    await supabase
      .from('inventory')
      .update({ canal_reserva: canal })
      .eq('id', inventoryId)
    setSaving(false)
    onSaved?.(canal)
  }

  return (
    <select
      value={value ?? ''}
      onChange={handleChange}
      disabled={saving}
      className="border border-gray-200 rounded-lg px-2 py-1 text-xs bg-white
                 focus:outline-none focus:ring-2 focus:ring-blue-200
                 disabled:opacity-50 cursor-pointer"
    >
      <option value="">— Canal —</option>
      {OPTIONS.map(o => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  )
}
