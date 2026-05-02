import { useRef, useEffect, useState, useCallback } from 'react'
import { AnimatePresence } from 'framer-motion'
import { useScanner } from '../hooks/useScanner'
import CardResult from '../components/scanner/CardResult'
import Toast from '../components/ui/Toast'
import { IDIOMAS, STORE_ID } from '../constants'
import { scannerApi } from '../lib/scanner'

// ── pHash helpers ─────────────────────────────────────────────────────────
function computePhash(imageData) {
  const { data } = imageData
  const N = 64, n = N * N
  const gray = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const px = i * 4
    gray[i] = 0.299 * data[px] + 0.587 * data[px+1] + 0.114 * data[px+2]
  }
  const mean = gray.reduce((a, b) => a + b, 0) / n
  let bits = ''
  for (let i = 0; i < n; i++) bits += gray[i] >= mean ? '1' : '0'
  let hex = ''
  for (let i = 0; i < bits.length; i += 4)
    hex += parseInt(bits.slice(i, i+4), 2).toString(16)
  return hex
}

function hammingDistance(a, b) {
  let d = 0
  for (let i = 0; i < a.length; i++) {
    const xor = parseInt(a[i], 16) ^ parseInt(b[i], 16)
    d += xor.toString(2).split('').filter(c => c === '1').length
  }
  return d
}

const LOCK_N   = 4
const INTERVAL = 180
const ZOOM_LEVELS = [1, 2, 3]

// ── Viewfinder inline con colores por estado ──────────────────────────────
const VF_COLORS = {
  idle:       '#ef4444',
  detecting:  '#f59e0b',
  identified: '#10b981',
  confirming: '#3b82f6',
  success:    '#10b981',
  error:      '#ef4444',
}

export default function Scanner() {
  const videoRef    = useRef(null)
  const canvasRef   = useRef(null)
  const lockRef     = useRef({ key: null, n: 0 })
  const cooldownRef = useRef(false)
  const timerRef    = useRef(null)

  const [idioma,  setIdioma]  = useState('en')
  const [modo,    setModo]    = useState('carta')
  const [camOk,   setCamOk]   = useState(false)
  const [zoom,    setZoom]    = useState(1)
  const [toast,   setToast]   = useState({ visible: false, msg: '', tipo: 'success' })

  // Buscador
  const [searchQ,       setSearchQ]       = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searchLoading, setSearchLoading] = useState(false)
  const searchTimer = useRef(null)

  const { estado, carta, error, sesion, capturar, confirmar, reset, forceCard } = useScanner()

  // ── Cámara ────────────────────────────────────────────────────────────────
  useEffect(() => {
    let stream = null
    const startCam = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width:  { ideal: 1280 },
            height: { ideal: 960 },
          },
        })
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play()
          setCamOk(true)
        }
      } catch (e) { console.error('Cámara:', e) }
    }
    startCam()
    return () => stream?.getTracks().forEach(t => t.stop())
  }, [])

  // ── Zoom ──────────────────────────────────────────────────────────────────
  // Estrategia dual:
  //   1. applyConstraints nativo (Android Chrome) — zoom óptico real
  //   2. CSS transform scale — fallback universal (iOS Safari, desktop, etc.)
  const applyZoom = useCallback(async (z) => {
    setZoom(z)
    const track = videoRef.current?.srcObject?.getVideoTracks()[0]
    let usedNative = false
    if (track) {
      try {
        const caps = track.getCapabilities()
        if (caps.zoom) {
          const min = caps.zoom.min ?? 1
          const max = caps.zoom.max ?? z
          const clamped = Math.min(Math.max(z, min), max)
          await track.applyConstraints({ advanced: [{ zoom: clamped }] })
          usedNative = true
        }
      } catch (_) {}
    }
    // Fallback CSS zoom para iOS / desktop
    if (!usedNative && videoRef.current) {
      videoRef.current.style.transform = z === 1 ? '' : `scale(${z})`
      videoRef.current.style.transformOrigin = 'center center'
    }
  }, [])

  // ── Loop pHash ────────────────────────────────────────────────────────────
  const detectFrame = useCallback(() => {
    if (cooldownRef.current) return
    if (!videoRef.current || !canvasRef.current) return
    if (estado === 'identified' || estado === 'confirming') return

    const video = videoRef.current
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    canvas.width = 64; canvas.height = 64
    ctx.drawImage(video, 0, 0, 64, 64)
    const hash = computePhash(ctx.getImageData(0, 0, 64, 64))

    const lock = lockRef.current
    if (lock.key && hammingDistance(hash, lock.key) <= 14) {
      lock.n++
      if (lock.n >= LOCK_N) {
        cooldownRef.current = true
        const full = document.createElement('canvas')
        full.width = video.videoWidth; full.height = video.videoHeight
        full.getContext('2d').drawImage(video, 0, 0)
        capturar(full.toDataURL('image/jpeg', 0.85).split(',')[1])
        setTimeout(() => { cooldownRef.current = false }, 3500)
      }
    } else {
      lock.key = hash; lock.n = 1
    }
  }, [estado, capturar])

  useEffect(() => {
    if (!camOk) return
    timerRef.current = setInterval(detectFrame, INTERVAL)
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

  // ── Confirmar ─────────────────────────────────────────────────────────────
  const handleConfirmar = async (params) => {
    await confirmar(params)
    showToast('✅ Carta guardada')
    setTimeout(() => {
      reset()
      lockRef.current = { key: null, n: 0 }
      cooldownRef.current = false
    }, 1200)
  }

  const showToast = (msg, tipo = 'success') => {
    setToast({ visible: true, msg, tipo })
    setTimeout(() => setToast(t => ({ ...t, visible: false })), 2500)
  }

  const handleVolver = () => {
    reset()
    setSearchQ('')
    setSearchResults([])
    lockRef.current = { key: null, n: 0 }
    cooldownRef.current = false
  }

  const color = VF_COLORS[estado] ?? VF_COLORS.idle

  return (
    <div className="fixed inset-0 bg-[#060612] flex flex-col overflow-hidden select-none">

      {/* ── Barra sesión ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 pt-safe py-2 bg-black/50 text-white/60 text-xs shrink-0">
        <span className="font-bold text-white/80">⚡ Snap Stock</span>
        <span>
          {sesion.cartas} cartas ·{' '}
          <span className="text-blue-400 font-bold">U$D {sesion.totalUSD.toFixed(2)}</span>
        </span>
      </div>

      {/* ── Toggle carta / sellado ─────────────────────────────────────── */}
      <div className="flex gap-2 px-4 py-1.5 shrink-0">
        {[{ k:'carta', l:'🃏 Carta' }, { k:'sellado', l:'📦 Sobre/Box' }].map(({ k, l }) => (
          <button key={k} onClick={() => setModo(k)}
            className={`flex-1 py-1 rounded-xl text-xs font-semibold transition
              ${modo === k ? 'bg-blue-600 text-white' : 'bg-white/5 text-white/40'}`}>
            {l}
          </button>
        ))}
      </div>

      {/* ── Idioma ────────────────────────────────────────────────────────── */}
      <div className="flex justify-center gap-1.5 px-4 shrink-0">
        {IDIOMAS.map(({ code, flag }) => (
          <button key={code} onClick={() => setIdioma(code)}
            className={`w-8 h-6 rounded-lg text-sm transition
              ${idioma === code ? 'bg-blue-600 ring-2 ring-blue-400' : 'bg-white/5'}`}>
            {flag}
          </button>
        ))}
      </div>

      {/* ── Viewfinder ────────────────────────────────────────────────────── */}
      <div className="relative mx-3 mt-2 shrink-0 rounded-2xl overflow-hidden"
        style={{
          height: 'min(48vh, 380px)',
          boxShadow: `0 0 0 2.5px ${color}, 0 0 24px ${color}55`,
          transition: 'box-shadow 0.3s ease',
        }}>

        {/* Video */}
        <video ref={videoRef} playsInline muted
          className="absolute inset-0 w-full h-full object-cover" />
        <canvas ref={canvasRef} className="hidden" />

        {/* Esquinas */}
        {['top-2 left-2 border-t-2 border-l-2 rounded-tl-lg',
          'top-2 right-2 border-t-2 border-r-2 rounded-tr-lg',
          'bottom-2 left-2 border-b-2 border-l-2 rounded-bl-lg',
          'bottom-2 right-2 border-b-2 border-r-2 rounded-br-lg',
        ].map((cls, i) => (
          <div key={i} className={`absolute w-5 h-5 pointer-events-none z-10 ${cls}`}
            style={{ borderColor: color }} />
        ))}

        {/* Zoom overlay */}
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-10 flex gap-1">
          {ZOOM_LEVELS.map(z => (
            <button key={z} onClick={() => applyZoom(z)}
              className={`px-2.5 py-0.5 rounded-full text-xs font-bold transition
                ${zoom === z ? 'bg-white text-black' : 'bg-black/50 text-white/70'}`}>
              {z}x
            </button>
          ))}
        </div>

        {!camOk && (
          <div className="absolute inset-0 flex items-center justify-center text-white/40 text-sm">
            Iniciando cámara…
          </div>
        )}
      </div>

      {/* ── Estado / instrucción ──────────────────────────────────────────── */}
      <div className="text-center py-1.5 shrink-0">
        {estado === 'idle'      && <p className="text-white/25 text-xs">Enfocá la carta — se detecta automáticamente</p>}
        {estado === 'detecting' && <p className="text-yellow-400 text-xs animate-pulse">Identificando…</p>}
        {estado === 'error'     && (
          <p className="text-red-400 text-xs">
            {error} — <button onClick={handleVolver} className="underline">Reintentar</button>
          </p>
        )}
      </div>

      {/* ── Buscador ──────────────────────────────────────────────────────── */}
      <div className="mx-3 shrink-0">
        <div className="flex items-center bg-white/8 border border-white/10 rounded-2xl px-3 py-2 gap-2">
          <span className="text-white/40 text-sm">🔍</span>
          <input
            type="text"
            value={searchQ}
            onChange={e => handleSearch(e.target.value)}
            placeholder="Buscar carta por nombre…"
            className="flex-1 bg-transparent text-white text-sm placeholder-white/30
                       focus:outline-none"
            autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck="false"
          />
          {searchQ && (
            <button onClick={() => { setSearchQ(''); setSearchResults([]) }}
              className="text-white/40 hover:text-white text-lg leading-none">×</button>
          )}
        </div>

        {/* Resultados */}
        {(searchResults.length > 0 || searchLoading) && (
          <div className="mt-1 bg-[#0d0d1e] border border-white/10 rounded-2xl overflow-hidden max-h-52 overflow-y-auto">
            {searchLoading && (
              <p className="text-white/40 text-xs text-center py-3">Buscando…</p>
            )}
            {searchResults.map((item, i) => (
              <button key={i} onClick={() => {
                setSearchQ('')
                setSearchResults([])
                forceCard(item)
              }}
                className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-white/5
                           text-left border-b border-white/5 last:border-0 transition">
                {item.imagen && (
                  <img src={item.imagen} alt="" className="w-8 h-11 object-cover rounded-md shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-medium truncate">{item.nombre}</p>
                  <p className="text-white/40 text-xs truncate">{item.set} · #{item.numero}</p>
                </div>
                {item.precio_usd && (
                  <span className="text-blue-400 text-xs font-semibold shrink-0">
                    U$D {item.precio_usd}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Card Result ───────────────────────────────────────────────────── */}
      <AnimatePresence>
        {(estado === 'identified' || estado === 'confirming') && carta && (
          <CardResult
            carta={carta}
            onConfirmar={handleConfirmar}
            onVolver={handleVolver}
            loading={estado === 'confirming'}
          />
        )}
      </AnimatePresence>

      <Toast mensaje={toast.msg} tipo={toast.tipo} visible={toast.visible} />
    </div>
  )
}
