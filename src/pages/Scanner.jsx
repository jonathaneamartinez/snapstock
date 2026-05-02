import { useRef, useEffect, useState, useCallback } from 'react'
import { AnimatePresence } from 'framer-motion'
import { useScanner } from '../hooks/useScanner'
import Viewfinder from '../components/scanner/Viewfinder'
import CardResult from '../components/scanner/CardResult'
import Toast from '../components/ui/Toast'
import { IDIOMAS } from '../constants'

// ── pHash helpers (migrado de index_holo.html) ────────────────────────────
function rgbToGray(r, g, b) { return 0.299 * r + 0.587 * g + 0.114 * b }

function computePhash(imageData) {
  const { data, width, height } = imageData
  const N = 64, n = N * N
  const gray = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const px = i * 4
    gray[i] = rgbToGray(data[px], data[px + 1], data[px + 2])
  }
  const mean = gray.reduce((a, b) => a + b, 0) / n
  let bits = ''
  for (let i = 0; i < n; i++) bits += gray[i] >= mean ? '1' : '0'
  // Convertir bits a hex
  let hex = ''
  for (let i = 0; i < bits.length; i += 4)
    hex += parseInt(bits.slice(i, i + 4), 2).toString(16)
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

// ── Componente principal ────────────────────────────────────────────────────
const LOCK_N   = 4    // frames consecutivos para disparar
const INTERVAL = 180  // ms entre frames

export default function Scanner() {
  const videoRef  = useRef(null)
  const canvasRef = useRef(null)
  const lockRef   = useRef({ key: null, n: 0 })
  const cooldownRef = useRef(false)
  const timerRef  = useRef(null)

  const [idioma,  setIdioma]  = useState('en')
  const [modo,    setModo]    = useState('carta') // carta | sellado
  const [camOk,   setCamOk]   = useState(false)
  const [toast,   setToast]   = useState({ visible: false, msg: '', tipo: 'success' })

  const { estado, carta, error, sesion, capturar, confirmar, reset } = useScanner()

  // ── Cámara ────────────────────────────────────────────────────────────────
  useEffect(() => {
    let stream = null
    const startCam = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 960 } },
        })
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          videoRef.current.play()
          setCamOk(true)
        }
      } catch (e) {
        console.error('Cámara:', e)
      }
    }
    startCam()
    return () => stream?.getTracks().forEach(t => t.stop())
  }, [])

  // ── Loop de detección por pHash ───────────────────────────────────────────
  const detectFrame = useCallback(() => {
    if (cooldownRef.current) return
    if (!videoRef.current || !canvasRef.current) return
    if (estado === 'identified' || estado === 'confirming') return

    const video  = videoRef.current
    const canvas = canvasRef.current
    const ctx    = canvas.getContext('2d', { willReadFrequently: true })
    canvas.width  = 64
    canvas.height = 64
    ctx.drawImage(video, 0, 0, 64, 64)
    const imageData = ctx.getImageData(0, 0, 64, 64)
    const hash = computePhash(imageData)

    const lock = lockRef.current
    if (lock.key && hammingDistance(hash, lock.key) <= 14) {
      lock.n++
      if (lock.n >= LOCK_N) {
        cooldownRef.current = true
        // Capturar frame completo para enviar al backend
        const full = document.createElement('canvas')
        full.width  = video.videoWidth
        full.height = video.videoHeight
        full.getContext('2d').drawImage(video, 0, 0)
        const base64 = full.toDataURL('image/jpeg', 0.85).split(',')[1]
        capturar(base64)
        setTimeout(() => { cooldownRef.current = false }, 3500)
      }
    } else {
      lock.key = hash
      lock.n   = 1
    }
  }, [estado, capturar])

  useEffect(() => {
    if (!camOk) return
    timerRef.current = setInterval(detectFrame, INTERVAL)
    return () => clearInterval(timerRef.current)
  }, [camOk, detectFrame])

  // ── Confirmar carta ────────────────────────────────────────────────────────
  const handleConfirmar = async (params) => {
    await confirmar(params)
    showToast('✅ Carta guardada correctamente', 'success')
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
    lockRef.current = { key: null, n: 0 }
    cooldownRef.current = false
  }

  return (
    <div className="fixed inset-0 bg-[#060612] flex flex-col overflow-hidden select-none">
      {/* ── Barra de sesión ──────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-2 bg-black/40 text-white/70 text-xs">
        <span>⚡ Snap Stock</span>
        <span>
          Sesión: <strong className="text-white">{sesion.cartas}</strong> cartas ·{' '}
          <strong className="text-blue-400">U$D {sesion.totalUSD.toFixed(2)}</strong>
        </span>
      </div>

      {/* ── Toggle carta / sellado ────────────────────────────────────────────── */}
      <div className="flex justify-center py-2 gap-2 px-4">
        {[{ k: 'carta', l: '🃏 Carta' }, { k: 'sellado', l: '📦 Sobre/Box' }].map(({ k, l }) => (
          <button
            key={k} onClick={() => setModo(k)}
            className={`flex-1 py-1.5 rounded-xl text-sm font-semibold transition
              ${modo === k ? 'bg-blue-600 text-white' : 'bg-white/5 text-white/50'}`}
          >
            {l}
          </button>
        ))}
      </div>

      {/* ── Selector idioma ──────────────────────────────────────────────────── */}
      <div className="flex justify-center gap-1.5 px-4">
        {IDIOMAS.map(({ code, flag }) => (
          <button
            key={code} onClick={() => setIdioma(code)}
            className={`w-9 h-7 rounded-lg text-base transition
              ${idioma === code ? 'bg-blue-600 ring-2 ring-blue-400' : 'bg-white/5'}`}
          >
            {flag}
          </button>
        ))}
      </div>

      {/* ── Viewfinder + video ───────────────────────────────────────────────── */}
      <div className="flex-1 relative mx-4 mt-3">
        <Viewfinder estado={estado} />
        <video
          ref={videoRef}
          playsInline muted
          className="absolute inset-0 w-full h-full object-cover rounded-2xl"
        />
        <canvas ref={canvasRef} className="hidden" />

        {/* Sin cámara */}
        {!camOk && (
          <div className="absolute inset-0 flex items-center justify-center text-white/50 text-sm">
            Esperando cámara…
          </div>
        )}
      </div>

      {/* ── Instrucción base ─────────────────────────────────────────────────── */}
      {estado === 'idle' && (
        <p className="text-center text-white/30 text-xs py-3 px-8">
          Enfocá la carta · Se detecta automáticamente
        </p>
      )}
      {estado === 'detecting' && (
        <p className="text-center text-yellow-400 text-xs py-3 animate-pulse">
          Identificando…
        </p>
      )}

      {/* ── Panel resultado ──────────────────────────────────────────────────── */}
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

      {/* ── Error ────────────────────────────────────────────────────────────── */}
      {estado === 'error' && (
        <div className="px-4 py-3 bg-red-900/40 text-red-300 text-sm text-center">
          {error} —{' '}
          <button onClick={handleVolver} className="underline">Reintentar</button>
        </div>
      )}

      <Toast mensaje={toast.msg} tipo={toast.tipo} visible={toast.visible} />
    </div>
  )
}
