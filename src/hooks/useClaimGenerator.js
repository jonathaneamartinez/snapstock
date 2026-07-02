import { useState, useCallback } from 'react'
import { fetchCardImages }              from '../lib/pokemonTcg'
import { getCardImageUrl, loadBlobUrl } from '../lib/imageCache'

/* ─── Configuración de estilos ──────────────────────────────────────────
   A: 6 cols × 5 rows = 30 cartas · canvas 1080 × 1350 (4:5 Instagram)
   B: 5 cols × 5 rows = 25 cartas · canvas 1080 × 1440 (3:4)
──────────────────────────────────────────────────────────────────────── */
const STYLE_A = {
  canvasW: 1080, canvasH: 1350,
  cols: 6, rows: 5,
  padX: 28, padY: 18,
  gap: 8,
  headerH: 72, footerH: 48,
}

const STYLE_B = {
  canvasW: 1080, canvasH: 1440,
  cols: 5, rows: 5,
  padX: 28, padY: 18,
  gap: 10,
  headerH: 72, footerH: 48,
}

/* ─── Cargar una URL como Image desde un blobUrl (CORS-safe) ────────── */
function blobUrlToImg(blobUrl) {
  return new Promise(resolve => {
    const img = new Image()
    img.onload  = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = blobUrl
  })
}

/* ─── Dibujar imagen con cover-crop (no estira) ─────────────────────── */
function drawImageCover(ctx, img, dx, dy, dw, dh) {
  const sw = img.naturalWidth  || img.width
  const sh = img.naturalHeight || img.height
  if (!sw || !sh) return

  const srcRatio = sw / sh
  const dstRatio = dw / dh

  let sx, sy, cropW, cropH
  if (srcRatio > dstRatio) {
    // Imagen más ancha: recortamos los costados
    cropH = sh
    cropW = sh * dstRatio
    sx    = (sw - cropW) / 2
    sy    = 0
  } else {
    // Imagen más alta: recortamos arriba/abajo
    cropW = sw
    cropH = sw / dstRatio
    sx    = 0
    sy    = (sh - cropH) / 2
  }
  ctx.drawImage(img, sx, sy, cropW, cropH, dx, dy, dw, dh)
}

/* ─── Borde redondeado en canvas ────────────────────────────────────── */
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
}

const fmtARS = (n) =>
  n != null ? `$${Number(n).toLocaleString('es-AR', { maximumFractionDigits: 0 })}` : null

/* ─── Dibujar una carta ─────────────────────────────────────────────── */
function drawCard(ctx, { img, card, x, y, w, h, dark, showPrice }) {
  const r = 10

  // Sombra suave
  ctx.save()
  ctx.shadowColor   = dark ? 'rgba(0,0,0,0.65)' : 'rgba(0,0,0,0.20)'
  ctx.shadowBlur    = 12
  ctx.shadowOffsetY = 4
  roundRect(ctx, x, y, w, h, r)
  ctx.fillStyle = dark ? '#1e1e2e' : '#e5e7eb'
  ctx.fill()
  ctx.restore()

  // Clip + imagen
  ctx.save()
  roundRect(ctx, x, y, w, h, r)
  ctx.clip()

  if (img) {
    drawImageCover(ctx, img, x, y, w, h)
  } else {
    // Placeholder
    ctx.fillStyle = dark ? '#2a2a3e' : '#d1d5db'
    ctx.fillRect(x, y, w, h)
    ctx.fillStyle = dark ? '#4a4a6e' : '#9ca3af'
    ctx.font = `bold ${Math.round(w * 0.28)}px system-ui`
    ctx.textAlign    = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('🃏', x + w / 2, y + h / 2)
  }

  // Overlay de precio
  if (showPrice) {
    const price = fmtARS(card.sale_price_ars ?? card.price_ars_blue ?? card._ars_blue)
    const cond  = card.condicion || card.condition
    if (price || cond) {
      const overlayH = Math.max(Math.round(h * 0.22), 28)
      const grad = ctx.createLinearGradient(x, y + h - overlayH, x, y + h)
      grad.addColorStop(0, 'rgba(0,0,0,0)')
      grad.addColorStop(1, 'rgba(0,0,0,0.88)')
      ctx.fillStyle = grad
      ctx.fillRect(x, y + h - overlayH, w, overlayH)

      const fontSize = Math.max(Math.round(w * 0.12), 11)
      if (price) {
        ctx.fillStyle    = '#ffffff'
        ctx.font         = `bold ${fontSize}px system-ui`
        ctx.textAlign    = 'left'
        ctx.textBaseline = 'bottom'
        ctx.fillText(price, x + 6, y + h - 5)
      }
      if (cond) {
        ctx.fillStyle    = 'rgba(255,255,255,0.72)'
        ctx.font         = `${Math.max(fontSize - 2, 9)}px system-ui`
        ctx.textAlign    = 'right'
        ctx.textBaseline = 'bottom'
        ctx.fillText(cond, x + w - 6, y + h - 5)
      }
    }
  }
  ctx.restore()
}

/* ─── Header ────────────────────────────────────────────────────────── */
function drawHeader(ctx, { canvasW, headerH, dark, pageNum, totalPages, title }) {
  const accent = dark ? '#818cf8' : '#3b6bf5'
  ctx.fillStyle    = accent
  ctx.font         = `bold ${Math.round(headerH * 0.42)}px system-ui`
  ctx.textAlign    = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillText('⚡ Snap Stock', 28, headerH / 2)

  if (title) {
    ctx.fillStyle = dark ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.38)'
    ctx.font      = `${Math.round(headerH * 0.30)}px system-ui`
    ctx.textAlign = 'right'
    ctx.fillText(
      totalPages > 1 ? `${title} · ${pageNum}/${totalPages}` : title,
      canvasW - 28,
      headerH / 2,
    )
  }
}

/* ─── Concurrencia limitada ─────────────────────────────────────────── */
/**
 * Ejecuta fn(item) para cada item, con como máximo `concurrency` en vuelo.
 * Igual que Promise.all pero sin reventar el proxy con 100+ requests.
 */
async function withConcurrency(items, concurrency, fn) {
  const results = new Array(items.length)
  let nextIdx = 0

  async function worker() {
    while (nextIdx < items.length) {
      const idx = nextIdx++
      results[idx] = await fn(items[idx], idx)
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, worker)
  )
  return results
}

/* ═══════════════════════════════════════════════════════════════════════
   Hook principal
════════════════════════════════════════════════════════════════════════ */
export function useClaimGenerator() {
  const [generating, setGenerating] = useState(false)
  const [progress,   setProgress]   = useState(0)
  const [images,     setImages]     = useState([])
  const [error,      setError]      = useState(null)

  const generate = useCallback(async ({ cards, style, dark, showPrice, title }) => {
    setGenerating(true)
    setProgress(0)
    setError(null)
    setImages([])

    const cfg = style === 'B' ? STYLE_B : STYLE_A

    try {
      setProgress(5)

      let imgOk = 0, imgFail = 0
      let done  = 0

      // 1. Pre-cargar imágenes con concurrencia limitada (máx 6 a la vez)
      //    Así no reventamos el proxy Vercel con 100+ requests simultáneos.
      //    Prioridad: blob ya cacheado → URL del carrito → API PokémonTCG
      const loaded = await withConcurrency(cards, 6, async (card) => {
        try {
          // ── A. URL: blob cacheado (ya precalentado) > image_url del carrito > API ──
          let imageUrl = getCardImageUrl(card.card_id)
                      || card.image_url
                      || null

          if (!imageUrl && card.nombre) {
            // No hay URL → buscar en PokémonTCG API (también con timeout)
            const imgs = await Promise.race([
              fetchCardImages(card.nombre, card.numero, card.set_name),
              new Promise(res => setTimeout(() => res(null), 8000)),
            ])
            imageUrl = imgs?.large || imgs?.small || null
          }

          if (!imageUrl) {
            imgFail++
            done++
            setProgress(5 + Math.round((done / cards.length) * 40))
            return { img: null, blobUrl: null, card }
          }

          // ── B. Blob CORS-safe vía proxy (retorna instantáneo si ya fue precalentado) ──
          const blobUrl = await Promise.race([
            loadBlobUrl(imageUrl),
            new Promise(res => setTimeout(() => res(null), 12000)),
          ])

          done++
          setProgress(5 + Math.round((done / cards.length) * 40))

          if (!blobUrl) {
            console.warn('[claim] sin blobUrl para', card.nombre, imageUrl)
            imgFail++
            return { img: null, blobUrl: null, card }
          }

          // ── C. HTMLImageElement desde el blobUrl ──────────────────────────
          const img = await blobUrlToImg(blobUrl)
          if (!img) {
            imgFail++
            return { img: null, blobUrl: null, card }
          }

          imgOk++
          return { img, blobUrl, card }
        } catch (err) {
          console.warn('[claim] error cargando', card.nombre, err?.message)
          imgFail++
          done++
          return { img: null, blobUrl: null, card }
        }
      })

      console.info(`[claim] imágenes: ${imgOk} ok / ${imgFail} fallidas de ${cards.length}`)
      setProgress(50)

      // 2. Paginar
      const perPage = cfg.cols * cfg.rows
      const pages   = []
      for (let i = 0; i < loaded.length; i += perPage) {
        pages.push(loaded.slice(i, i + perPage))
      }

      const result = []

      for (let pi = 0; pi < pages.length; pi++) {
        const page = pages[pi]
        setProgress(50 + Math.round((pi / pages.length) * 45))

        const canvas  = document.createElement('canvas')
        canvas.width  = cfg.canvasW
        canvas.height = cfg.canvasH
        const ctx = canvas.getContext('2d')

        // Fondo
        ctx.fillStyle = dark ? '#0f0f1a' : '#f3f4f6'
        ctx.fillRect(0, 0, cfg.canvasW, cfg.canvasH)

        // Gradiente radial sutil
        if (dark) {
          const rg = ctx.createRadialGradient(
            cfg.canvasW * 0.15, cfg.canvasH * 0.1, 0,
            cfg.canvasW * 0.15, cfg.canvasH * 0.1, cfg.canvasW * 0.65,
          )
          rg.addColorStop(0, 'rgba(55,70,200,0.10)')
          rg.addColorStop(1, 'rgba(0,0,0,0)')
          ctx.fillStyle = rg
          ctx.fillRect(0, 0, cfg.canvasW, cfg.canvasH)
        }

        // Header
        drawHeader(ctx, {
          canvasW: cfg.canvasW, headerH: cfg.headerH,
          dark, pageNum: pi + 1, totalPages: pages.length,
          title: title || 'Disponibles',
        })

        // Calcular dimensiones de cartas
        const areaW = cfg.canvasW - cfg.padX * 2
        const areaH = cfg.canvasH - cfg.headerH - cfg.padY * 2 - cfg.footerH
        const cardW = (areaW - cfg.gap * (cfg.cols - 1)) / cfg.cols
        const cardH = (areaH - cfg.gap * (cfg.rows - 1)) / cfg.rows

        // Dibujar cartas en grilla
        for (let ci = 0; ci < page.length; ci++) {
          const col = ci % cfg.cols
          const row = Math.floor(ci / cfg.cols)
          const cx  = cfg.padX + col * (cardW + cfg.gap)
          const cy  = cfg.headerH + cfg.padY + row * (cardH + cfg.gap)
          drawCard(ctx, {
            img: page[ci].img, card: page[ci].card,
            x: cx, y: cy, w: cardW, h: cardH,
            dark, showPrice,
          })
        }

        // Footer
        const footerY = cfg.canvasH - cfg.footerH / 2
        ctx.fillStyle    = dark ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.28)'
        ctx.font         = `${Math.round(cfg.footerH * 0.30)}px system-ui`
        ctx.textAlign    = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText('Consultá disponibilidad · Buenos Aires', cfg.canvasW / 2, footerY)

        let dataUrl
        try {
          dataUrl = canvas.toDataURL('image/png')
        } catch (canvasErr) {
          console.error('[claim] canvas.toDataURL falló (canvas tainted?):', canvasErr?.message)
          // Reintentar sin imágenes (solo texto/placeholders)
          const fallbackCanvas  = document.createElement('canvas')
          fallbackCanvas.width  = cfg.canvasW
          fallbackCanvas.height = cfg.canvasH
          const fCtx = fallbackCanvas.getContext('2d')
          fCtx.fillStyle = dark ? '#0f0f1a' : '#f3f4f6'
          fCtx.fillRect(0, 0, cfg.canvasW, cfg.canvasH)
          drawHeader(fCtx, {
            canvasW: cfg.canvasW, headerH: cfg.headerH,
            dark, pageNum: pi + 1, totalPages: pages.length,
            title: title || 'Disponibles',
          })
          for (let ci = 0; ci < page.length; ci++) {
            const col = ci % cfg.cols
            const row = Math.floor(ci / cfg.cols)
            const cx  = cfg.padX + col * (cardW + cfg.gap)
            const cy  = cfg.headerH + cfg.padY + row * (cardH + cfg.gap)
            // Dibujar sin imagen para evitar taint
            drawCard(fCtx, {
              img: null, card: page[ci].card,
              x: cx, y: cy, w: cardW, h: cardH,
              dark, showPrice,
            })
          }
          dataUrl = fallbackCanvas.toDataURL('image/png')
        }

        result.push({
          dataUrl,
          label: pages.length > 1 ? `Imagen ${pi + 1} de ${pages.length}` : 'Imagen del claim',
        })
      }

      // NOTA: los blobUrls están en imageCache y no se revocan aquí
      // (se reutilizan en claims futuros)
      setImages(result)
      setProgress(100)
      return result
    } catch (err) {
      setError(err.message || 'Error generando imágenes')
      console.error('[useClaimGenerator]', err)
      return []
    } finally {
      setGenerating(false)
    }
  }, [])

  const reset = useCallback(() => {
    setImages([])
    setProgress(0)
    setError(null)
  }, [])

  return { generating, progress, images, error, generate, reset }
}
