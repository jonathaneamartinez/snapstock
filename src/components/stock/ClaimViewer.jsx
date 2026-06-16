import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { STORE_ID } from '../../constants'
import FinishBadge  from '../ui/FinishBadge'

/* ─── Descarga ──────────────────────────────────────────────────────── */
function downloadDataUrl(dataUrl, filename) {
  const a = document.createElement('a')
  a.href = dataUrl; a.download = filename; a.click()
}

async function downloadAllAsZip(images, title) {
  try {
    const JSZip = (await import('jszip')).default
    const zip   = new JSZip()
    images.forEach((img, i) => {
      zip.file(`claim_${String(i + 1).padStart(2, '0')}.png`, img.dataUrl.split(',')[1], { base64: true })
    })
    const blob = await zip.generateAsync({ type: 'blob' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url; a.download = `claim_${(title || 'snapstock').replace(/\s+/g, '_')}.zip`; a.click()
    URL.revokeObjectURL(url)
  } catch {
    // Fallback individual
    images.forEach((img, i) => setTimeout(() => downloadDataUrl(img.dataUrl, `claim_${i + 1}.png`), i * 400))
  }
}

/* ═══════════════════════════════════════════════════════════════════════
   ClaimViewer
════════════════════════════════════════════════════════════════════════ */
export default function ClaimViewer({ images, cards, style, dark, cardCount, title, onBack, onClose, onConfirmed }) {
  const queryClient = useQueryClient()
  const [current,    setCurrent]    = useState(0)
  const [dir,        setDir]        = useState(1)
  const [confirming,    setConfirming]    = useState(false)
  const [confirmed,     setConfirmed]     = useState(false)
  const [confirmError,  setConfirmError]  = useState(null)

  const go = (delta) => {
    const next = current + delta
    if (next < 0 || next >= images.length) return
    setDir(delta)
    setCurrent(next)
  }

  const img = images[current]

  /* ── dataUrl → Blob ─────────────────────────────────────────────── */
  function dataUrlToBlob(dataUrl) {
    const [, base64] = dataUrl.split(',')
    const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0))
    return new Blob([bytes], { type: 'image/png' })
  }

  /* ── Confirmar y guardar claim ─────────────────────────────────── */
  const handleConfirm = async () => {
    setConfirming(true)
    setConfirmError(null)
    try {
      // 1. Insertar en claims (con cards_data para historial)
      const cardsData = cards?.map(c => ({
        id:           c.card_id      || null,
        inventory_id: c.inventory_id || null,   // ← necesario para workflow post-claim
        name:         c.nombre       || '',
        set:          c.set_name     || '',
        num:          c.numero       || '',
        cond:         c.condicion    || '',
        holo:         c.holo         || false,
        finish:       c.finish       || 'normal',
        usd:          c.price_usd    ?? null,
        ars:          c.price_ars_blue ?? c._ars_blue ?? null,
        sale:         c.sale_price_ars ?? null,
        img:          c.image_url    || '',
      })) ?? []

      const { data: claim, error: errC } = await supabase
        .from('claims')
        .insert({
          store_id:     STORE_ID,
          title:        title || 'Disponibles',
          style,
          dark,
          card_count:   cardCount,
          images_count: images.length,
          cards_data:   cardsData,
        })
        .select('id')
        .single()

      if (errC) throw new Error(`Error guardando claim: ${errC.message}`)

      // 2. Intentar subir imágenes a Storage (no crítico — puede fallar)
      const imageUrls = []
      for (let i = 0; i < images.length; i++) {
        try {
          const blob = dataUrlToBlob(images[i].dataUrl)
          const path = `${STORE_ID}/${claim.id}/img_${String(i + 1).padStart(2, '0')}.png`
          const { error: errU } = await supabase.storage
            .from('claims')
            .upload(path, blob, { contentType: 'image/png', upsert: true })
          if (!errU) {
            const { data: { publicUrl } } = supabase.storage
              .from('claims').getPublicUrl(path)
            imageUrls.push(publicUrl)
          } else {
            console.warn('[ClaimViewer] storage upload failed:', errU.message)
          }
        } catch (storageErr) {
          console.warn('[ClaimViewer] storage error:', storageErr?.message)
        }
      }

      // 3. Guardar URLs si se subieron (opcional)
      if (imageUrls.length > 0) {
        await supabase.from('claims')
          .update({ image_urls: imageUrls })
          .eq('id', claim.id)
      }

      // 4. Actualizar cache → sección Claims se refresca
      await queryClient.invalidateQueries({ queryKey: ['claims'] })
      setConfirmed(true)
      setTimeout(() => { onConfirmed?.(); onClose() }, 1200)

    } catch (err) {
      console.error('[ClaimViewer] confirm error', err)
      setConfirmError(err.message || 'Error al guardar el claim')
      setConfirming(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[60] bg-black flex flex-col">

      {/* ── Top bar ──────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-3 shrink-0">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-white/70 hover:text-white text-sm transition"
        >
          ← Opciones
        </button>
        <span className="text-white/50 text-xs">
          {images.length > 1 ? `${current + 1} / ${images.length}` : img.label}
        </span>
        <button onClick={onClose} className="text-white/60 hover:text-white text-2xl leading-none">×</button>
      </div>

      {/* ── Imagen ───────────────────────────────────────────────── */}
      <div className="flex-1 flex items-center justify-center relative overflow-hidden px-2">
        {current > 0 && (
          <button onClick={() => go(-1)}
            className="absolute left-3 z-10 w-9 h-9 bg-white/10 hover:bg-white/20
                       rounded-full flex items-center justify-center text-white text-lg transition">
            ‹
          </button>
        )}

        <AnimatePresence mode="wait" initial={false}>
          <motion.img
            key={current}
            src={img.dataUrl}
            alt={img.label}
            initial={{ opacity: 0, x: dir * 50 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{    opacity: 0, x: dir * -50 }}
            transition={{ duration: 0.18 }}
            className="max-h-full max-w-full object-contain rounded-xl shadow-2xl"
            draggable={false}
          />
        </AnimatePresence>

        {current < images.length - 1 && (
          <button onClick={() => go(1)}
            className="absolute right-3 z-10 w-9 h-9 bg-white/10 hover:bg-white/20
                       rounded-full flex items-center justify-center text-white text-lg transition">
            ›
          </button>
        )}
      </div>

      {/* ── Thumbnails ───────────────────────────────────────────── */}
      {images.length > 1 && (
        <div className="flex gap-2 justify-center px-4 py-2 shrink-0">
          {images.map((im, i) => (
            <button key={i}
              onClick={() => { setDir(i > current ? 1 : -1); setCurrent(i) }}
              className={`w-9 h-9 rounded-lg overflow-hidden border-2 transition
                ${i === current ? 'border-blue-400' : 'border-transparent opacity-50 hover:opacity-80'}`}>
              <img src={im.dataUrl} alt="" className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      )}

      {/* ── Error de confirmación ────────────────────────────────── */}
      {confirmError && (
        <div className="mx-4 mb-2 px-3 py-2 bg-red-500/20 border border-red-500/40 rounded-xl text-red-300 text-xs text-center">
          {confirmError}
        </div>
      )}

      {/* ── Botones ──────────────────────────────────────────────── */}
      <div className="flex gap-2 px-4 pb-5 pt-2 shrink-0">

        {/* Descargar esta / todas */}
        {images.length > 1 ? (
          <>
            <button
              onClick={() => downloadDataUrl(img.dataUrl, `claim_${current + 1}.png`)}
              className="flex-1 py-2.5 bg-white/10 hover:bg-white/20 text-white text-xs
                         font-semibold rounded-xl transition"
            >
              ⬇ Esta imagen
            </button>
            <button
              onClick={() => downloadAllAsZip(images, title)}
              className="flex-1 py-2.5 bg-white/15 hover:bg-white/25 text-white text-xs
                         font-semibold rounded-xl transition"
            >
              📦 Descargar ZIP ({images.length})
            </button>
          </>
        ) : (
          <button
            onClick={() => downloadDataUrl(img.dataUrl, `claim_snapstock.png`)}
            className="flex-1 py-2.5 bg-white/12 hover:bg-white/20 text-white text-xs
                       font-semibold rounded-xl transition"
          >
            ⬇ Descargar PNG
          </button>
        )}

        {/* Confirmar claim */}
        <button
          onClick={handleConfirm}
          disabled={confirming || confirmed}
          className={`flex-1 py-2.5 text-sm font-bold rounded-xl transition
            flex items-center justify-center gap-1.5
            ${confirmed
              ? 'bg-emerald-500 text-white'
              : 'bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-60'}`}
        >
          {confirmed
            ? '✓ Guardado'
            : confirming
              ? '…'
              : '✓ Confirmar claim'}
        </button>
      </div>
    </div>
  )
}
