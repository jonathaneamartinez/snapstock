import { useState, useRef } from 'react'
import { supabase }   from '../../lib/supabase'
import { scannerApi } from '../../lib/scanner'
import { STORE_ID, CONDICIONES } from '../../constants'
import Spinner from '../ui/Spinner'

/* ─── Formato esperado de columnas (case-insensitive, flexible) ─────── */
const COLUMN_ALIASES = {
  nombre:     ['nombre', 'name', 'carta', 'card', 'card name'],
  set:        ['set', 'edicion', 'edición', 'expansion', 'expansión', 'set_name', 'edition'],
  numero:     ['numero', 'número', 'number', 'card_number', 'nro', '#'],
  condicion:  ['condicion', 'condición', 'condition', 'cond'],
  idioma:     ['idioma', 'language', 'lang'],
  cantidad:   ['cantidad', 'qty', 'quantity', 'stock', 'unidades', 'units', 'qty.', 'cantidad total'],
  precio_usd: ['precio_usd', 'price_usd', 'usd', 'precio usd', 'price',
               'pricecharting', 'costo x unidad', 'precio usd mercado', 'market price',
               'precio', 'costo'],
  precio_ars: ['precio_ars', 'price_ars', 'ars', 'sale_price', 'final',
               'precio de venta', 'precio venta', 'sale price',
               'costo x unidad ars', 'precio ars', 'precio_ars_blue'],
}

// Errores típicos de fórmulas rotas en Excel
const EXCEL_ERRORS = new Set(['#REF!','#VALUE!','#N/A','#DIV/0!','#NAME?','#NULL!','#NUM!'])

/** Decodifica entidades HTML: &#39; → ' , &amp; → & */
function decodeHtml(str) {
  return str
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<')
    .replace(/&gt;/g,  '>').replace(/&quot;/g,'"')
}

function matchHeader(header, colIndex = -1) {
  const h = header.toLowerCase().trim()
  // Primera columna sin nombre → asumir que es el nombre de la carta
  if (h === '' && colIndex === 0) return 'nombre'
  for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
    if (aliases.includes(h)) return field
  }
  return null
}

function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim())
  if (lines.length < 2) return []
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''))
  const fieldMap = headers.map((h, i) => matchHeader(h, i))

  return lines.slice(1).map(line => {
    const vals = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''))
    const row = {}
    fieldMap.forEach((field, i) => {
      if (field) row[field] = vals[i] || ''
    })
    return row
  }).filter(r => r.nombre)
}

/** Limpia número de carta: "1.0" → "1", "TG30" → "TG30" */
function cleanCardNumber(v) {
  if (!v) return ''
  const s = String(v).trim()
  // Si es un decimal entero (ej: "1.0", "25.0") → quitar decimales
  if (/^\d+\.0+$/.test(s)) return String(parseInt(s, 10))
  return s
}

/** Parsea TODAS las hojas del Excel y combina las que tengan datos de cartas */
async function parseXLSX(file) {
  // Fix: algunos bundlers no exponen .default en import dinámico de xlsx
  const xlsxMod = await import('xlsx')
  const XLSX    = xlsxMod.default ?? xlsxMod
  const buffer  = await file.arrayBuffer()
  const wb      = XLSX.read(buffer, { type: 'array' })

  const allRows = []

  for (const sheetName of wb.SheetNames) {
    const ws  = wb.Sheets[sheetName]
    const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
    if (raw.length < 2) continue

    const headers  = raw[0].map(h => String(h))
    const fieldMap = headers.map((h, i) => matchHeader(h, i))

    // Necesita al menos la columna de nombre para ser útil
    if (!fieldMap.includes('nombre')) continue

    const rows = raw.slice(1).map(row => {
      const obj = {}
      fieldMap.forEach((field, i) => {
        if (!field) return
        const v = String(row[i] ?? '').trim()
        // Ignorar errores de fórmulas de Excel
        if (EXCEL_ERRORS.has(v)) return
        obj[field] = v
      })
      // Limpiar nombre (HTML entities)
      if (obj.nombre) obj.nombre = decodeHtml(obj.nombre)
      // Limpiar número de carta (1.0 → 1)
      if (obj.numero) obj.numero = cleanCardNumber(obj.numero)
      // Cantidad: si viene como decimal entero limpiarla también
      if (obj.cantidad) obj.cantidad = cleanCardNumber(obj.cantidad)
      return obj
    }).filter(r => r.nombre && r.nombre.trim())

    if (rows.length > 0) allRows.push(...rows)
  }

  return allRows
}

/* ─── Normalizar condicion ──────────────────────────────────────────── */
const normCond = (v) => {
  const upper = (v || 'NM').toUpperCase().trim()
  return CONDICIONES.includes(upper) ? upper : 'NM'
}

/* ═══════════════════════════════════════════════════════════════════════
   Modal principal
════════════════════════════════════════════════════════════════════════ */
export default function ImportarCartasModal({ onClose, onDone }) {
  const [step,        setStep]       = useState('upload')  // upload | preview | importing | done
  const [rows,        setRows]       = useState([])
  const [progress,    setProgress]   = useState(0)
  const [currentIdx,  setCurrentIdx] = useState(0)        // carta actual procesando
  const [liveOk,      setLiveOk]     = useState(0)        // ok en tiempo real
  const [currentCard, setCurrentCard] = useState('')      // nombre de la carta actual
  const [results,     setResults]    = useState({ ok: 0, error: 0 })
  const [failedRows,  setFailedRows] = useState([])   // [{ row, motivo }]
  const [error,       setError]      = useState(null)
  const fileRef = useRef(null)

  /* ── Parsear archivo ─────────────────────────────────────────────── */
  const handleFile = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setError(null)
    try {
      let parsed = []
      if (file.name.endsWith('.csv') || file.type === 'text/csv') {
        const text = await file.text()
        parsed = parseCSV(text)
      } else {
        parsed = await parseXLSX(file)
      }
      if (parsed.length === 0) {
        setError('No se encontraron filas válidas. El archivo necesita al menos una columna llamada "nombre" o "name". El resto de los datos (set, precio, condición) son opcionales y se pueden completar después.')
        return
      }
      setRows(parsed)
      setStep('preview')
    } catch (err) {
      setError(err.message || 'Error al leer el archivo')
    }
  }

  /* ── Confirmar e importar ────────────────────────────────────────── */
  const handleImport = async (rowsToImport = rows) => {
    // Validar STORE_ID antes de empezar
    if (!STORE_ID) {
      setError('Error de configuración: STORE_ID no está definido. Contactá al administrador.')
      return
    }

    setStep('importing')
    setProgress(0)
    setCurrentIdx(0)
    setLiveOk(0)
    setCurrentCard('')
    setFailedRows([])
    let ok = 0
    const failed = []

    for (let i = 0; i < rowsToImport.length; i++) {
      const r = rowsToImport[i]
      setCurrentIdx(i + 1)
      setCurrentCard(r.nombre || '')
      setProgress(Math.round((i / rowsToImport.length) * 100))

      try {
        // 1. Buscar o crear carta en `cards`
        let cardId = null
        const { data: existing, error: searchErr } = await supabase
          .from('cards')
          .select('id')
          .ilike('name', r.nombre.trim())
          .maybeSingle()

        if (searchErr) throw new Error(`Búsqueda falló: ${searchErr.message}`)

        if (existing) {
          cardId = existing.id
        } else {
          // Intentar obtener imagen del scanner
          let imageUrl = null
          try {
            const apiRes = await scannerApi.buscar(r.nombre.trim(), r.idioma || 'en')
            const first  = (apiRes?.opciones ?? apiRes?.results ?? [])[0]
            if (first) imageUrl = first.imagen || first.image_url
          } catch {}

          const { data: newCard, error: insertCardErr } = await supabase
            .from('cards')
            .insert({
              name:        r.nombre.trim(),
              set_name:    r.set?.trim()    || null,
              card_number: r.numero?.trim() || null,
              language:    r.idioma?.trim() || 'en',
              image_url:   imageUrl         || null,
            })
            .select('id')
            .single()

          if (insertCardErr) throw new Error(`Crear carta falló: ${insertCardErr.message}`)
          if (newCard) cardId = newCard.id
        }

        if (!cardId) throw new Error('No se pudo obtener card_id')

        // 2. Upsert en inventory
        const cond     = normCond(r.condicion)
        const qty      = parseInt(r.cantidad) || 1
        const priceUsd = r.precio_usd ? parseFloat(r.precio_usd) : null
        const priceArs = r.precio_ars ? parseFloat(r.precio_ars) : null

        const { data: existingInv, error: invSearchErr } = await supabase
          .from('inventory')
          .select('id, quantity')
          .eq('store_id', STORE_ID)
          .eq('card_id',  cardId)
          .eq('condition', cond)
          .eq('status', 'disponible')
          .maybeSingle()

        if (invSearchErr) throw new Error(`Buscar inventario falló: ${invSearchErr.message}`)

        if (existingInv) {
          const { error: updateErr } = await supabase
            .from('inventory')
            .update({
              quantity:       (existingInv.quantity || 1) + qty,
              ...(priceUsd && { price_usd: priceUsd }),
              ...(priceArs && { sale_price_ars: priceArs }),
            })
            .eq('id', existingInv.id)
          if (updateErr) throw new Error(`Actualizar stock falló: ${updateErr.message}`)
        } else {
          const { error: insertInvErr } = await supabase
            .from('inventory')
            .insert({
              store_id:      STORE_ID,
              card_id:       cardId,
              quantity:      qty,
              condicion:     cond,
              condition:     cond,
              status:        'disponible',
              estado:        'disponible',
              price_usd:     priceUsd,
              sale_price_ars: priceArs,
              scan_date:     new Date().toISOString(),
            })
          if (insertInvErr) throw new Error(`Insertar en inventario falló: ${insertInvErr.message}`)
        }
        ok++
        setLiveOk(ok)
      } catch (err) {
        console.warn(`[Import] fila ${i} (${r.nombre}) error:`, err.message)
        failed.push({ row: r, motivo: err.message || 'Error desconocido' })
      }
    }

    setResults({ ok, error: failed.length })
    setFailedRows(failed)
    setProgress(100)
    setCurrentCard('')
    setStep('done')
  }

  /* ── Reintentar solo las fallidas ───────────────────────────────── */
  const handleRetry = () => {
    const toRetry = failedRows.map(f => f.row)
    setRows(toRetry)
    handleImport(toRetry)
  }

  /* ── Render ─────────────────────────────────────────────────────── */
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl flex flex-col max-h-[88vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <div>
            <h3 className="font-bold text-gray-800">📥 Importar cartas</h3>
            <p className="text-xs text-gray-400 mt-0.5">CSV, Excel (.xlsx) o Google Sheets exportado</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-2xl leading-none">×</button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">

          {/* ── STEP: upload ─────────────────────────────────────── */}
          {step === 'upload' && (
            <>
              {/* Zona de drop */}
              <button
                onClick={() => fileRef.current?.click()}
                className="w-full border-2 border-dashed border-gray-300 rounded-2xl p-8
                           flex flex-col items-center gap-3 hover:border-blue-400 hover:bg-blue-50
                           transition cursor-pointer text-center"
              >
                <span className="text-4xl">📂</span>
                <p className="text-sm font-semibold text-gray-700">
                  Arrastrá o hacé clic para seleccionar
                </p>
                <p className="text-xs text-gray-400">.csv · .xlsx · .xls</p>
              </button>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={handleFile}
                className="hidden"
              />

              {error && (
                <p className="text-red-500 text-sm bg-red-50 rounded-xl px-4 py-3">{error}</p>
              )}

              {/* Formato esperado */}
              <div className="bg-gray-50 rounded-xl p-4">
                <p className="text-xs font-semibold text-gray-500 mb-2">Columnas reconocidas:</p>
                <div className="grid grid-cols-2 gap-1 text-xs text-gray-500">
                  {[
                    ['nombre / name', 'Requerido'],
                    ['expansion / set', 'Opcional'],
                    ['numero / number', 'Opcional'],
                    ['condicion / condition', 'NM por defecto'],
                    ['unidades / qty / cantidad', '1 por defecto'],
                    ['pricecharting / precio_usd', 'Opcional'],
                    ['final / precio_ars', 'Opcional'],
                    ['idioma / language', 'en por defecto'],
                  ].map(([col, note]) => (
                    <div key={col} className="flex gap-1">
                      <code className="bg-gray-200 px-1 rounded text-gray-700">{col}</code>
                      <span className="text-gray-400">{note}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* ── STEP: preview ────────────────────────────────────── */}
          {step === 'preview' && (
            <>
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-gray-700">
                  {rows.length} cartas detectadas
                </p>
                <button
                  onClick={() => { setStep('upload'); setRows([]) }}
                  className="text-xs text-gray-400 hover:text-gray-600"
                >
                  ← Cambiar archivo
                </button>
              </div>

              <div className="border border-gray-200 rounded-xl overflow-hidden max-h-64 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 text-gray-400 uppercase sticky top-0">
                    <tr>
                      {['Nombre', 'Set', 'Cond.', 'Qty', 'USD', 'ARS'].map(h => (
                        <th key={h} className="px-3 py-2 text-left font-semibold">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {rows.map((r, i) => (
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="px-3 py-2 font-medium text-gray-800 max-w-[140px] truncate">{r.nombre}</td>
                        <td className="px-3 py-2 text-gray-500 max-w-[80px] truncate">{r.set || '—'}</td>
                        <td className="px-3 py-2">
                          <span className="bg-gray-100 px-1.5 py-0.5 rounded font-medium text-gray-600">
                            {normCond(r.condicion)}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-gray-700">{r.cantidad || 1}</td>
                        <td className="px-3 py-2 text-emerald-600">{r.precio_usd ? `$${r.precio_usd}` : '—'}</td>
                        <td className="px-3 py-2 text-blue-600">{r.precio_ars ? `$${r.precio_ars}` : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* ── STEP: importing ──────────────────────────────────── */}
          {step === 'importing' && (
            <div className="py-6 space-y-5">
              {/* Encabezado con spinner y contador principal */}
              <div className="flex items-center gap-3">
                <Spinner size={22} className="text-blue-500 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-800">
                    Importando cartas…
                  </p>
                  {currentCard && (
                    <p className="text-xs text-gray-400 truncate mt-0.5">
                      {currentCard}
                    </p>
                  )}
                </div>
                <span className="text-sm font-bold text-blue-600 shrink-0 tabular-nums">
                  {currentIdx}/{rows.length}
                </span>
              </div>

              {/* Barra de progreso */}
              <div className="space-y-1.5">
                <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden">
                  <div
                    className="bg-blue-500 h-3 rounded-full transition-all duration-200"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <div className="flex justify-between text-xs text-gray-400">
                  <span>{progress}%</span>
                  <span className="text-emerald-600 font-medium">
                    {liveOk > 0 && `✓ ${liveOk} importadas`}
                  </span>
                </div>
              </div>

              {/* Stats en tiempo real */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-gray-50 rounded-xl p-3 text-center">
                  <p className="text-xs text-gray-400 mb-1">Total</p>
                  <p className="text-lg font-bold text-gray-700 tabular-nums">{rows.length}</p>
                </div>
                <div className="bg-emerald-50 rounded-xl p-3 text-center">
                  <p className="text-xs text-emerald-500 mb-1">OK</p>
                  <p className="text-lg font-bold text-emerald-600 tabular-nums">{liveOk}</p>
                </div>
                <div className="bg-gray-50 rounded-xl p-3 text-center">
                  <p className="text-xs text-gray-400 mb-1">Pendientes</p>
                  <p className="text-lg font-bold text-gray-500 tabular-nums">
                    {rows.length - currentIdx}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* ── STEP: done ───────────────────────────────────────── */}
          {step === 'done' && (
            <div className="space-y-4">
              {/* Resumen */}
              <div className="text-center py-4 space-y-1">
                <div className="text-4xl">{results.error === 0 ? '✅' : '⚠️'}</div>
                <p className="text-lg font-bold text-gray-800 mt-2">
                  {results.ok} cartas importadas
                </p>
                {results.error > 0 && (
                  <p className="text-sm text-amber-600">
                    {results.error} {results.error === 1 ? 'fila no se pudo importar' : 'filas no se pudieron importar'}
                  </p>
                )}
              </div>

              {/* Detalle de fallidas */}
              {failedRows.length > 0 && (
                <div className="border border-red-100 rounded-xl overflow-hidden">
                  <div className="bg-red-50 px-4 py-2 flex items-center justify-between">
                    <p className="text-xs font-semibold text-red-700">
                      Cartas descartadas
                    </p>
                    <span className="text-xs text-red-400">{failedRows.length} fila{failedRows.length > 1 ? 's' : ''}</span>
                  </div>
                  <div className="max-h-52 overflow-y-auto divide-y divide-red-50">
                    {failedRows.map((f, i) => (
                      <div key={i} className="px-4 py-2.5 flex items-start gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-800 truncate">
                            {f.row.nombre || '(sin nombre)'}
                          </p>
                          {f.row.set && (
                            <p className="text-xs text-gray-400 truncate">{f.row.set}</p>
                          )}
                        </div>
                        <span className="text-xs text-red-500 shrink-0 max-w-[140px] text-right leading-tight">
                          {f.motivo}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-100 shrink-0 flex justify-between gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-100 text-gray-600 text-sm font-medium rounded-xl
                       hover:bg-gray-200 transition"
          >
            {step === 'done' ? 'Cerrar' : 'Cancelar'}
          </button>

          {step === 'preview' && (
            <button
              onClick={handleImport}
              className="px-5 py-2 bg-blue-600 text-white text-sm font-bold rounded-xl
                         hover:bg-blue-500 transition"
            >
              Importar {rows.length} cartas →
            </button>
          )}
          {step === 'done' && (
            <div className="flex gap-2">
              {failedRows.length > 0 && (
                <button
                  onClick={handleRetry}
                  className="px-4 py-2 bg-amber-500 text-white text-sm font-bold rounded-xl
                             hover:bg-amber-400 transition"
                >
                  🔄 Reintentar {failedRows.length} fallida{failedRows.length > 1 ? 's' : ''}
                </button>
              )}
              {results.ok > 0 && (
                <button
                  onClick={() => { onDone?.(); onClose() }}
                  className="px-5 py-2 bg-emerald-500 text-white text-sm font-bold rounded-xl
                             hover:bg-emerald-400 transition"
                >
                  ✓ Ver en stock
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
