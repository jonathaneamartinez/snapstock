import { useRef, useEffect, useState, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useScanner } from '../hooks/useScanner'
import CardResult from '../components/scanner/CardResult'
import Toast from '../components/ui/Toast'
import { IDIOMAS } from '../constants'
import { scannerApi } from '../lib/scanner'
import { getDolar } from '../lib/dolar'

// ── Mismas constantes que el scanner HTML de Railway ─────────────────────────
const AS_INTERVAL  = 180   // ms entre frames
const AS_MOTION    = 14    // umbral de movimiento (promedio de diff de grises)
const AS_MOT_LOCK  = 12    // frames quietos consecutivos para disparar
const AS_SIZE      = 64    // resolución del frame de muestra
const AS_VAR_MIN   = 180   // varianza mínima (descartar fondo plano/vacío)

// ── Helpers idénticos al scanner HTML ────────────────────────────────────────

/** Calcula varianza de grises del frame — descarta si la imagen es demasiado uniforme */
function hasContent(pixels) {
  let sum = 0, sumSq = 0
  const n = pixels.length / 4
  for (let i = 0; i < pixels.length; i += 4) {
    const g = 0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2]
    sum += g; sumSq += g * g
  }
  const mean = sum / n
  return (sumSq / n - mean * mean) > AS_VAR_MIN
}

/** Diferencia promedio de brillo entre dos frames — score bajo = carta quieta */
function motionScore(prev, curr) {
  let d = 0
  for (let i = 0; i < prev.length; i += 4) {
    const a = 0.299 * prev[i] + 0.587 * prev[i + 1] + 0.114 * prev[i + 2]
    const b = 0.299 * curr[i] + 0.587 * curr[i + 1] + 0.114 * curr[i + 2]
    d += Math.abs(a - b)
  }
  return d / (prev.length / 4)
}

/**
 * Coordenadas del guide box (área de la carta) en píxeles del video.
 * Idéntico a _getCardCropRegion() del HTML: 56% del área visible, ratio 2.5/3.5,
 * centrado, con 8% de padding.
 */
function getCardCropRegion(video, zoom = 1) {
  const vw = video.videoWidth, vh = video.videoHeight
  if (!vw || !vh) return null

  const sw = vw / zoom, sh = vh / zoom
  const ox = (vw - sw) / 2, oy = (vh - sh) / 2

  const CARD_W_FRAC = 0.56
  const CARD_RATIO  = 2.5 / 3.5
  const cw_vis = sw * CARD_W_FRAC
  const ch_vis = cw_vis / CARD_RATIO
  const cx_vis = (sw - cw_vis) / 2
  const cy_vis = (sh - ch_vis) / 2

  const PAD = 0.08
  const padX = cw_vis * PAD, padY = ch_vis * PAD

  return {
    x: Math.max(0, ox + cx_vis - padX),
    y: Math.max(0, oy + cy_vis - padY),
    w: Math.min(vw, cw_vis + padX * 2),
    h: Math.min(vh, ch_vis + padY * 2),
  }
}

/**
 * Captura solo el área de la carta (guide box) a máx 720px.
 * Moonprice / MyDexTCG envían solo la carta → OCR mucho más preciso.
 */
function captureCardCrop(video, zoom = 1) {
  const MAX_W = 720
  const crop  = getCardCropRegion(video, zoom)
  const c     = document.createElement('canvas')

  if (crop) {
    const scale = Math.min(1, MAX_W / crop.w)
    c.width  = Math.round(crop.w * scale)
    c.height = Math.round(crop.h * scale)
    c.getContext('2d').drawImage(video, crop.x, crop.y, crop.w, crop.h, 0, 0, c.width, c.height)
  } else {
    const scale = Math.min(1, MAX_W / video.videoWidth)
    c.width  = Math.round(video.videoWidth  * scale)
    c.height = Math.round(video.videoHeight * scale)
    c.getContext('2d').drawImage(video, 0, 0, c.width, c.height)
  }
  return c.toDataURL('image/jpeg', 0.82).split(',')[1]
}

export default function Scanner() {
  const videoRef    = useRef(null)
  const canvasRef   = useRef(null)
  const cooldownRef = useRef(false)
  const stableRef   = useRef(0)         // frames quietos consecutivos
  const prevPixRef  = useRef(null)      // pixels del frame anterior
  const timerRef    = useRef(null)

  const [idioma,       setIdioma]       = useState('en')
  const [camOk,        setCamOk]        = useState(false)
  const [camInfo,      setCamInfo]      = useState('')   // debug: qué cámara está activa
  const [camDevices,   setCamDevices]   = useState([])  // todas las cámaras disponibles
  const [camDeviceIdx, setCamDeviceIdx] = useState(0)   // índice activo
  const streamRef      = useRef(null)                   // stream activo (para poder pararlo)
  const [zoom,         setZoom]         = useState(1)
  const [lockProgress, setLockProgress] = useState(0)  // 0–AS_MOT_LOCK
  const [autoScan,     setAutoScan]     = useState(true)
  const [showResult,   setShowResult]   = useState(false)
  const [dolarRates,   setDolarRates]   = useState({ blue: null, oficial: null })
  const [focusPoint,   setFocusPoint]   = useState(null)
  const [toast,        setToast]        = useState({ visible: false, msg: '', tipo: 'success' })

  const [searchQ,       setSearchQ]       = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searchLoading, setSearchLoading] = useState(false)
  const searchTimer = useRef(null)

  const queryClient = useQueryClient()
  const { estado, opciones, carta, error, sesion, capturar, confirmar, reset, forceCard } = useScanner()

  // ── Cámara ────────────────────────────────────────────────────────────────
  // Enumera todos los dispositivos de video disponibles
  const enumerateCams = useCallback(async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices()
      const cams = devices.filter(d => d.kind === 'videoinput')
      setCamDevices(cams)
      console.log('[Camera] Cámaras encontradas:', cams.map((c, i) => `[${i}] ${c.label || c.deviceId}`))
      return cams
    } catch (_) { return [] }
  }, [])

  // Inicia la cámara por índice (o con facingMode si no hay deviceId aún)
  const startCamByIdx = useCallback(async (devices, idx) => {
    // Para el stream anterior si existe
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
    setCamOk(false)
    setCamInfo('')
    setZoom(1)
    stableRef.current  = 0
    prevPixRef.current = null

    let stream = null
    const dev = devices[idx]

    // Si tenemos deviceId lo usamos directo; si no, intentamos por facingMode
    const attempts = dev?.deviceId
      ? [
          { video: { deviceId: { exact: dev.deviceId }, width: { ideal: 1920 }, height: { ideal: 1080 } } },
          { video: { deviceId: { exact: dev.deviceId } } },
        ]
      : [
          { video: { facingMode: { exact: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } } },
          { video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 960 } } },
          { video: { facingMode: 'environment' } },
          { video: true },
        ]

    for (const constraint of attempts) {
      try {
        stream = await navigator.mediaDevices.getUserMedia(constraint)
        const track    = stream.getVideoTracks()[0]
        const settings = track.getSettings()
        const label    = track.label || dev?.label || 'sin label'
        const facing   = settings.facingMode || 'desconocido'
        const res      = `${settings.width ?? '?'}×${settings.height ?? '?'}`
        const camN     = `[${idx + 1}/${devices.length || '?'}]`
        console.log(`[Camera] ${camN} label="${label}" facing="${facing}" res=${res}`)
        setCamInfo(`${camN} ${facing} · ${res} · ${label.slice(0, 35)}`)
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play()
          setCamOk(true)
        }
        return true
      } catch (e) {
        console.warn('[Camera] Intento fallido:', e.message)
        stream?.getTracks().forEach(t => t.stop())
        stream = null
      }
    }
    setCamInfo('ERROR: no se pudo abrir la cámara')
    return false
  }, [])

  useEffect(() => {
    let cancelled = false
    const init = async () => {
      const cams = await enumerateCams()
      if (cancelled) return
      // Buscar la primera cámara trasera, si no usar la 0
      const backIdx = cams.findIndex(c =>
        c.label.toLowerCase().includes('back') ||
        c.label.toLowerCase().includes('rear') ||
        c.label.toLowerCase().includes('environment') ||
        c.label.toLowerCase().includes('trasera')
      )
      const startIdx = backIdx >= 0 ? backIdx : 0
      setCamDeviceIdx(startIdx)
      await startCamByIdx(cams, startIdx)
    }
    init()
    return () => {
      cancelled = true
      streamRef.current?.getTracks().forEach(t => t.stop())
    }
  }, [enumerateCams, startCamByIdx])

  // Ciclar cámara
  const handleSwitchCam = useCallback(async () => {
    if (camDevices.length < 2) return
    const nextIdx = (camDeviceIdx + 1) % camDevices.length
    setCamDeviceIdx(nextIdx)
    await startCamByIdx(camDevices, nextIdx)
  }, [camDevices, camDeviceIdx, startCamByIdx])

  // ── Dolar rates ───────────────────────────────────────────────────────────
  useEffect(() => {
    getDolar().then(setDolarRates).catch(() => {})
  }, [])

  // ── Mostrar pantalla resultado ────────────────────────────────────────────
  useEffect(() => {
    if (estado === 'identified' || estado === 'confirming') {
      setShowResult(true)
    }
  }, [estado])

  // ── Zoom ──────────────────────────────────────────────────────────────────
  const applyZoom = useCallback(async (raw) => {
    const z = parseFloat(raw)
    setZoom(z)
    // Reset motion detection al cambiar zoom
    stableRef.current  = 0
    prevPixRef.current = null
    setLockProgress(0)

    const track = videoRef.current?.srcObject?.getVideoTracks()[0]
    let usedNative = false
    if (track) {
      try {
        const caps = track.getCapabilities()
        if (caps.zoom) {
          const clamped = Math.min(Math.max(z, caps.zoom.min ?? 1), caps.zoom.max ?? z)
          await track.applyConstraints({ advanced: [{ zoom: clamped }] })
          usedNative = true
        }
      } catch (_) {}
    }
    if (!usedNative && videoRef.current) {
      videoRef.current.style.transform      = z === 1 ? '' : `scale(${z})`
      videoRef.current.style.transformOrigin = 'center center'
    }
  }, [])

  // ── Tap to focus ──────────────────────────────────────────────────────────
  const handleTapFocus = useCallback(async (e) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const relX  = (e.clientX - rect.left) / rect.width
    const relY  = (e.clientY - rect.top)  / rect.height
    setFocusPoint({ x: e.clientX - rect.left, y: e.clientY - rect.top })
    setTimeout(() => setFocusPoint(null), 900)
    const track = videoRef.current?.srcObject?.getVideoTracks()[0]
    if (!track) return
    try {
      const caps  = track.getCapabilities()
      const modes = caps.focusMode || []
      if (modes.includes('single-shot') || modes.includes('manual')) {
        await track.applyConstraints({
          advanced: [{ focusMode: modes.includes('single-shot') ? 'single-shot' : 'manual', pointOfInterest: { x: relX, y: relY } }]
        })
      }
    } catch (_) {}
  }, [])

  // ── Captura manual ────────────────────────────────────────────────────────
  const handleManualCapture = useCallback(() => {
    if (cooldownRef.current || !videoRef.current || estado === 'detecting') return
    cooldownRef.current    = true
    stableRef.current      = 0
    prevPixRef.current     = null
    capturar(captureCardCrop(videoRef.current, zoom), idioma)
    setTimeout(() => { cooldownRef.current = false; setLockProgress(0) }, 3500)
  }, [capturar, estado, zoom, idioma])

  // ── Loop detección por movimiento (idéntico a _asCheckMotion del HTML) ────
  const detectFrame = useCallback(() => {
    if (!autoScan || cooldownRef.current) return
    if (!videoRef.current || !canvasRef.current) return
    if (estado === 'identified' || estado === 'confirming') return

    const video = videoRef.current
    if (!video.videoWidth || !video.videoHeight) return

    // Dibujar el área de la carta (guide box) en el canvas de muestra
    const crop   = getCardCropRegion(video, zoom)
    const canvas = canvasRef.current
    const ctx    = canvas.getContext('2d', { willReadFrequently: true })
    canvas.width = AS_SIZE; canvas.height = AS_SIZE

    if (crop) {
      ctx.drawImage(video, crop.x, crop.y, crop.w, crop.h, 0, 0, AS_SIZE, AS_SIZE)
    } else {
      ctx.drawImage(video, 0, 0, AS_SIZE, AS_SIZE)
    }

    const curr = ctx.getImageData(0, 0, AS_SIZE, AS_SIZE).data

    // Sin contenido → resetear (fondo vacío / uniforme)
    if (!hasContent(curr)) {
      stableRef.current  = 0
      prevPixRef.current = null
      if (lockProgress !== 0) setLockProgress(0)
      return
    }

    const prev = prevPixRef.current
    if (prev) {
      const score = motionScore(prev, curr)
      if (score < AS_MOTION) {
        // Carta quieta — acumular frames estables
        stableRef.current = Math.min(stableRef.current + 1, AS_MOT_LOCK)
        setLockProgress(stableRef.current)

        if (stableRef.current >= AS_MOT_LOCK) {
          // ¡Lock! Capturar solo el área de la carta y enviar al backend
          stableRef.current  = 0
          prevPixRef.current = null
          cooldownRef.current = true
          if (navigator.vibrate) navigator.vibrate(30)
          capturar(captureCardCrop(video, zoom), idioma)
          setTimeout(() => { cooldownRef.current = false; setLockProgress(0) }, 3500)
        }
      } else {
        // Movimiento → decrementar contador
        stableRef.current = Math.max(0, stableRef.current - 2)
        setLockProgress(stableRef.current)
      }
    }

    prevPixRef.current = curr
  }, [estado, capturar, autoScan, zoom, lockProgress, idioma])

  useEffect(() => {
    if (!camOk) return
    timerRef.current = setInterval(detectFrame, AS_INTERVAL)
    return () => clearInterval(timerRef.current)
  }, [camOk, detectFrame])

  // ── Buscador ──────────────────────────────────────────────────────────────
  const handleSearch = (q) => {
    setSearchQ(q)
    clearTimeout(searchTimer.current)
    if (!q.trim()) { setSearchResults([]); return }
    searchTimer.current = setTimeout(async () => {
      setSearchLoading(true)
      try {
        const res = await scannerApi.buscar(q, idioma)
        setSearchResults(res.opciones ?? res.results ?? [])
      } catch (_) {}
      finally { setSearchLoading(false) }
    }, 380)
  }

  // ── Confirmar / volver ────────────────────────────────────────────────────
  const handleConfirmar = async (params) => {
    await confirmar(params)
    // Invalidar cache del dashboard para que se refleje inmediatamente
    queryClient.invalidateQueries({ queryKey: ['stock'] })
    queryClient.invalidateQueries({ queryKey: ['metricas'] })
    queryClient.invalidateQueries({ queryKey: ['ventas'] })
    showToast('✅ Carta guardada')
    setTimeout(() => {
      reset(); resetScanState(); setShowResult(false)
    }, 1200)
  }

  const handleVolver = () => {
    reset(); resetScanState()
    setSearchQ(''); setSearchResults([])
    setShowResult(false)
  }

  const resetScanState = () => {
    cooldownRef.current = false
    stableRef.current   = 0
    prevPixRef.current  = null
    setLockProgress(0)
  }

  const showToast = (msg, tipo = 'success') => {
    setToast({ visible: true, msg, tipo })
    setTimeout(() => setToast(prev => ({ ...prev, visible: false })), 2500)
  }

  // Color de las esquinas del guide box
  const guideColor = lockProgress >= AS_MOT_LOCK ? '#34d399'
                   : lockProgress > 0            ? '#34d399'
                   : estado === 'detecting'       ? '#818cf8'
                   : '#a78bfa'

  return (
    <div className="fixed inset-0 bg-black overflow-hidden select-none">

      {/* ── Pantalla 1: Cámara ─────────────────────────────────────────────── */}
      <div
        className="absolute inset-0 flex flex-col"
        style={{
          background:    '#0a0a0f',
          transform:     showResult ? 'translateX(-28%)' : 'translateX(0)',
          transition:    'transform 0.38s cubic-bezier(0.4,0,0.2,1)',
          pointerEvents: showResult ? 'none' : 'auto',
          willChange:    'transform',
        }}
      >
        {/* Barra sesión */}
        <div className="flex flex-col px-4 pt-safe bg-black/60 shrink-0 z-10">
          <div className="flex items-center justify-between py-2 text-white/60 text-xs">
            <span className="font-bold text-white/80">⚡ Snap Stock</span>
            <span>
              {sesion.cartas} cartas ·{' '}
              <span className="text-purple-400 font-bold">U$D {sesion.totalUSD.toFixed(2)}</span>
            </span>
          </div>
          {/* Debug: cámara activa + botón para ciclar */}
          {camInfo && (
            <div className="pb-1 flex items-center gap-2">
              <div className="flex-1 text-[10px] leading-tight truncate"
                style={{ color: camInfo.includes('environment') ? '#34d399' : '#f87171' }}>
                📷 {camInfo}
              </div>
              {camDevices.length > 1 && (
                <button
                  onClick={handleSwitchCam}
                  className="shrink-0 text-[10px] px-2 py-0.5 rounded bg-white/10 text-white/60
                             hover:bg-white/20 active:scale-95 transition"
                >
                  🔄 cam {((camDeviceIdx + 1) % camDevices.length) + 1}
                </button>
              )}
            </div>
          )}
        </div>

        {/* ── Video ────────────────────────────────────────────────────────── */}
        <div
          className="relative flex-1 overflow-hidden bg-black"
          style={{ cursor: 'crosshair' }}
          onClick={handleTapFocus}
        >
          <video
            ref={videoRef}
            playsInline muted
            className="absolute inset-0 w-full h-full object-cover"
          />
          <canvas ref={canvasRef} className="hidden" />

          {/* Guide box con máscara + esquinas */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div
              style={{
                width:        '58%',
                aspectRatio:  '2.5 / 3.5',
                position:     'relative',
                borderRadius: 6,
                boxShadow:    `0 0 0 2000px rgba(0,0,0,0.45), 0 0 0 1.5px ${guideColor}44`,
                transition:   'box-shadow 0.25s ease',
              }}
            >
              {[
                { pos: 'top-[-1px] left-[-1px]',    border: 'border-t-2 border-l-2', radius: 'rounded-tl' },
                { pos: 'top-[-1px] right-[-1px]',   border: 'border-t-2 border-r-2', radius: 'rounded-tr' },
                { pos: 'bottom-[-1px] left-[-1px]', border: 'border-b-2 border-l-2', radius: 'rounded-bl' },
                { pos: 'bottom-[-1px] right-[-1px]',border: 'border-b-2 border-r-2', radius: 'rounded-br' },
              ].map(({ pos, border, radius }, i) => (
                <div key={i} className={`absolute w-5 h-5 ${pos} ${border} ${radius}`}
                  style={{ borderColor: guideColor, transition: 'border-color 0.25s ease' }} />
              ))}

              {/* Barra de progreso de estabilidad */}
              <div className="absolute bottom-0 left-0 right-0 overflow-hidden"
                style={{ height: 3, borderRadius: '0 0 4px 4px' }}>
                <div style={{
                  height:     '100%',
                  width:      `${(lockProgress / AS_MOT_LOCK) * 100}%`,
                  background: 'linear-gradient(90deg, #34d399, #a78bfa)',
                  transition: 'width 0.15s ease',
                }} />
              </div>
            </div>
          </div>

          {/* Anillo de foco */}
          {focusPoint && (
            <div className="absolute pointer-events-none"
              style={{ left: focusPoint.x - 22, top: focusPoint.y - 22,
                       width: 44, height: 44, border: '1.5px solid rgba(255,255,255,0.85)',
                       borderRadius: '50%', boxShadow: '0 0 0 1px rgba(0,0,0,0.3)' }} />
          )}

          {/* Spinner detectando */}
          {estado === 'detecting' && (
            <div className="absolute inset-0 bg-black/30 flex items-center justify-center pointer-events-none z-10">
              <div className="w-12 h-12 rounded-full animate-spin"
                style={{ border: '3px solid rgba(167,139,250,0.25)', borderTopColor: '#a78bfa' }} />
            </div>
          )}

          {!camOk && (
            <div className="absolute inset-0 flex items-center justify-center text-white/40 text-sm">
              Iniciando cámara…
            </div>
          )}
        </div>

        {/* Estado */}
        <div className="shrink-0 text-center text-xs py-1.5"
          style={{ background: '#0a0a0f', minHeight: 28 }}>
          {estado === 'idle'      && <span className="text-white/25">Apuntá la carta · tocá para enfocar</span>}
          {estado === 'detecting' && <span className="text-yellow-400 animate-pulse">Identificando…</span>}
          {estado === 'error'     && (
            <span className="text-red-400">
              {error} — <button onClick={handleVolver} className="underline">Reintentar</button>
            </span>
          )}
        </div>

        {/* Chips de idioma */}
        <div className="shrink-0 flex gap-1.5 justify-center px-3 pb-2 flex-wrap"
          style={{ background: '#0a0a0f' }}>
          {IDIOMAS.map(({ code, flag }) => (
            <button key={code} onClick={() => setIdioma(code)}
              className={`text-xs px-2.5 py-1 rounded-full font-bold leading-snug transition
                ${idioma === code
                  ? 'bg-purple-500/20 border border-purple-400 text-purple-300'
                  : 'bg-white/4 border border-white/8 text-gray-500'}`}>
              {flag} {code.toUpperCase()}
            </button>
          ))}
        </div>

        {/* Buscador */}
        <div className="shrink-0 px-3.5 pb-2" style={{ background: '#0a0a0f' }}>
          <div className="flex items-center bg-[#111120] border border-[#1e1e35] focus-within:border-purple-700/60 rounded-xl px-3 gap-2 transition-colors">
            <span className="text-white/30 text-sm flex-shrink-0">🔍</span>
            <input type="text" value={searchQ}
              onChange={e => handleSearch(e.target.value)}
              placeholder="Buscar carta por nombre…"
              className="flex-1 bg-transparent text-[#e5e7eb] text-sm placeholder-[#374151] focus:outline-none py-2.5"
              autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck="false" />
            {searchQ && (
              <button onClick={() => { setSearchQ(''); setSearchResults([]) }}
                className="text-[#6b7280] hover:text-white text-lg leading-none">×</button>
            )}
          </div>
          {(searchResults.length > 0 || searchLoading) && (
            <div className="mt-1 bg-[#0d0d1a] border border-[#1e1e35] rounded-xl overflow-hidden max-h-52 overflow-y-auto">
              {searchLoading && <p className="text-[#4b5563] text-xs text-center py-3">Buscando…</p>}
              {searchResults.map((item, i) => (
                <button key={i} onClick={() => { setSearchQ(''); setSearchResults([]); forceCard(item) }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 active:bg-[#13132a] text-left border-b border-[#13131f] last:border-0 transition">
                  {item.imagen
                    ? <img src={item.imagen} alt="" className="w-[34px] h-[47px] object-cover rounded-[5px] bg-[#1a1a2e] shrink-0" />
                    : <div className="w-[34px] h-[47px] rounded-[5px] bg-[#1a1a2e] shrink-0" />
                  }
                  <div className="flex-1 min-w-0">
                    <p className="text-[#e5e7eb] text-[0.85rem] font-semibold truncate">{item.nombre}</p>
                    <p className="text-[#6b7280] text-[0.7rem] truncate mt-0.5">{item.set} · #{item.numero}</p>
                  </div>
                  {item.precio_usd && (
                    <span className="text-purple-400 text-xs font-bold shrink-0">${item.precio_usd}</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Controles: zoom + captura + auto */}
        <div className="shrink-0 flex items-center gap-4 px-5 pt-3"
          style={{ background: '#0a0a0f', paddingBottom: 'calc(env(safe-area-inset-bottom) + 20px)' }}>
          <div className="flex-1 flex items-center gap-2">
            <span className="text-purple-400 opacity-60 text-[0.9rem]">🔍</span>
            <input type="range" min="1" max="3" step="0.1" value={zoom}
              onChange={e => applyZoom(e.target.value)}
              className="flex-1 appearance-none h-1 rounded-full cursor-pointer"
              style={{ accentColor: '#a78bfa' }} />
            <span className="text-purple-400 text-[0.8rem] font-medium min-w-[34px] text-right">
              {zoom.toFixed(1)}x
            </span>
          </div>
          <button onClick={handleManualCapture} disabled={estado === 'detecting'}
            className="w-[66px] h-[66px] rounded-full bg-white border-[4px] border-purple-400
                       active:scale-90 disabled:opacity-45 transition-transform shrink-0 relative">
            <span className="absolute inset-[6px] rounded-full bg-white" />
          </button>
          <button onClick={() => { setAutoScan(v => !v); resetScanState() }}
            className={`w-[42px] h-[42px] rounded-full flex items-center justify-center text-[1.05rem]
                        shrink-0 transition border
              ${autoScan ? 'bg-green-500/15 border-green-400 text-green-400'
                         : 'bg-purple-500/8 border-white/10 text-[#4b5563]'}`}
            title={autoScan ? 'Auto ON' : 'Auto OFF'}>
            ⚡
          </button>
        </div>
      </div>

      {/* ── Pantalla 2: Resultado ──────────────────────────────────────────── */}
      <div className="absolute inset-0"
        style={{
          transform:     showResult ? 'translateX(0)' : 'translateX(100%)',
          transition:    'transform 0.38s cubic-bezier(0.4,0,0.2,1)',
          pointerEvents: showResult ? 'auto' : 'none',
          willChange:    'transform',
        }}>
        {carta && (
          <CardResult
            carta={carta} opciones={opciones} dolarRates={dolarRates}
            idioma={idioma}
            onConfirmar={handleConfirmar} onVolver={handleVolver}
            onSelectOpcion={forceCard} loading={estado === 'confirming'}
          />
        )}
      </div>

      <Toast mensaje={toast.msg} tipo={toast.tipo} visible={toast.visible} />
    </div>
  )
}
