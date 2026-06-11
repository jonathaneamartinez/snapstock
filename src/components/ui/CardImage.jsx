import { useState, useEffect, useRef, useCallback } from 'react'
import { fetchCardImages } from '../../lib/pokemonTcg'
import { supabase } from '../../lib/supabase'
import { setCardImage, getCardImageUrl } from '../../lib/imageCache'
import { isBatchPending } from '../../hooks/usePrefetchPageImages'

const CARD_BACK = 'https://images.pokemontcg.io/back.png'
const SCANNER_URL = import.meta.env.VITE_SCANNER_URL

// Limpia nombre para scanner: quita [Reverse Holo], #25, etc.
function cleanNameForScanner(nombre) {
  return (nombre || '')
    .replace(/\s*\[[^\]]*\]/g, '')
    .replace(/\s*#[A-Za-z0-9]+\s*$/, '')
    .trim()
}

// Busca la URL de imagen en el scanner (EN via CDN pokemontcg.io, JP/CN via R2)
async function fetchScannerImageUrl(nombre, numero, idioma, setName) {
  if (!SCANNER_URL || !nombre) return null
  const clean = cleanNameForScanner(nombre)
  if (!clean) return null
  const lang = (idioma === 'ja' || idioma === 'jp') ? 'jp'
             : (idioma === 'zh' || idioma === 'cn') ? 'cn'
             : 'en'
  try {
    const params = new URLSearchParams({
      name:   clean.toLowerCase(),
      number: String(numero ?? ''),
      lang,
      ...(setName ? { set_id: setName.toLowerCase().replace(/\s+/g, '-') } : {}),
    })
    const res = await fetch(
      `${SCANNER_URL}/card-image-url?${params}`,
      { signal: AbortSignal.timeout(3000) }
    )
    if (!res.ok) return null
    const data = await res.json()
    return data.url || null
  } catch {
    return null
  }
}

export default function CardImage({ imageUrl, cardId, nombre, numero, idioma, setName, onOpen }) {
  const ref      = useRef(null)
  // Estado inicial desde prop > sessionStorage cache > null
  const _initial = imageUrl || getCardImageUrl(cardId) || null
  const [src,      setSrc]      = useState(_initial)
  const [largeSrc, setLarge]    = useState(_initial)
  const [loaded,   setLoaded]   = useState(!!_initial)
  const [fetching, setFetching] = useState(false)
  const [failed,   setFailed]   = useState(false)
  const fetchCount     = useRef(0)
  const retryTimer     = useRef(null)
  const batchWaitTimer = useRef(null)   // timer que espera a que el batch resuelva
  const srcRef         = useRef(_initial) // ref espejo de src — accesible desde closures de timers
  const [triedApiFallback, setTriedApiFallback] = useState(false)

  const doFetch = useCallback(async () => {
    // srcRef.current es siempre fresco; evita fetch doble si el batch ya resolvió
    if (fetching || srcRef.current || !nombre) return
    fetchCount.current++
    setFetching(true)
    setFailed(false)

    // 1. Scanner (EN via CDN pokemontcg.io, JP/CN via R2)
    const r2Url = await fetchScannerImageUrl(nombre, numero, idioma, setName)
    if (r2Url) {
      srcRef.current = r2Url  // sincronizar ref antes del setState
      setSrc(r2Url); setLarge(r2Url); setLoaded(true)
      setFetching(false); setFailed(false)
      if (cardId) setCardImage(cardId, r2Url)
      return
    }

    // 2. pokemontcg.io
    const imgs = await fetchCardImages(nombre, numero, setName)
    if (!imgs?.small) {
      setFetching(false)
      setFailed(true)
      if (fetchCount.current <= 2) {
        retryTimer.current = setTimeout(() => {
          setFailed(false)
          doFetch()
        }, 8000 * fetchCount.current)
      }
      return
    }

    const bestUrl = imgs.large || imgs.small
    srcRef.current = bestUrl  // sincronizar ref antes del setState
    setSrc(imgs.small)
    setLarge(imgs.large || imgs.small)
    setLoaded(true)
    setFetching(false)
    setFailed(false)

    if (cardId) setCardImage(cardId, bestUrl)

    // Persistir en Supabase para que la próxima sesión cargue directo desde DB
    if (cardId && imgs.large) {
      supabase
        .from('cards')
        .update({ image_url: imgs.large })
        .eq('id', cardId)
        .then(({ error }) => {
          if (error) console.warn('[CardImage] Supabase update error:', error.message)
        })
    }
  }, [nombre, numero, idioma, cardId, fetching, setName])

  useEffect(() => {
    // Prop disponible → usar directamente (el batch resolvió y pasó imageUrl)
    if (imageUrl) {
      srcRef.current = imageUrl  // ← batch resolvió: cancela cualquier doFetch pendiente
      setSrc(imageUrl); setLarge(imageUrl); setLoaded(true)
      if (cardId) setCardImage(cardId, imageUrl)
      return
    }

    // Cache de sesión → usar sin fetch
    const cached = getCardImageUrl(cardId)
    if (cached) {
      srcRef.current = cached
      setSrc(cached); setLarge(cached); setLoaded(true)
      return
    }

    if (!nombre) return

    // Lazy load: fetch solo cuando entra en pantalla
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return
        observer.disconnect()

        // Si el batch de la página está procesando esta carta, esperamos a que
        // resuelva en lugar de disparar 50 requests individuales al scanner.
        // Timeout de 4.5 s (< 8 s del batch timeout) como fallback si el batch
        // tardó demasiado o no encontró la carta.
        if (cardId && isBatchPending(cardId)) {
          batchWaitTimer.current = setTimeout(() => {
            if (!srcRef.current) doFetch()
          }, 4500)
        } else {
          doFetch()
        }
      },
      { rootMargin: '200px' }
    )
    if (ref.current) observer.observe(ref.current)
    return () => {
      observer.disconnect()
      if (retryTimer.current) clearTimeout(retryTimer.current)
      if (batchWaitTimer.current) clearTimeout(batchWaitTimer.current)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageUrl, nombre, numero, idioma, cardId])

  const handleClick = () => {
    if (src && onOpen) onOpen({ src: largeSrc || src, nombre, numero })
  }

  const handleRetry = () => {
    setFailed(false)
    srcRef.current = null
    setSrc(null)
    doFetch()
  }

  return (
    <div ref={ref} className="flex flex-col items-center gap-0.5">
      <div className="relative group">
        <div
          onClick={src && !failed ? handleClick : (failed ? handleRetry : undefined)}
          className={`w-7 h-10 rounded overflow-hidden flex items-center justify-center
            ${(src || failed) ? 'cursor-pointer' : 'bg-gray-100'}`}
          title={src && !failed ? `Ver ${nombre}` : failed ? 'Reintentar' : ''}
        >
          {src && !failed ? (
            <img
              src={src}
              alt={nombre}
              className={`w-full h-full object-cover transition-opacity duration-300
                ${loaded ? 'opacity-100' : 'opacity-0'}`}
              onLoad={() => setLoaded(true)}
              onError={() => {
                srcRef.current = null
                setSrc(null)
                setLoaded(false)
                if (!triedApiFallback && nombre) {
                  setTriedApiFallback(true)
                  doFetch()
                } else {
                  setFailed(true)
                }
              }}
            />
          ) : fetching ? (
            <div className="w-3 h-3 border-2 border-blue-300 border-t-transparent rounded-full animate-spin" />
          ) : failed ? (
            <img
              src={CARD_BACK}
              alt="Reintentar"
              className="w-full h-full object-cover opacity-40"
              onError={(e) => { e.target.style.display = 'none' }}
            />
          ) : (
            <div className="w-full h-full bg-gray-100 rounded" />
          )}
        </div>

        {/* Botón 🔄 — solo cuando no hay imagen o cuando falló */}
        {nombre && (!src || failed) && (
          <button
            onClick={e => { e.stopPropagation(); handleRetry() }}
            title="Buscar imagen"
            className={`absolute inset-0 flex items-center justify-center rounded
                        bg-black/50 text-white text-[9px] transition
                        ${failed
                          ? 'opacity-100'
                          : 'opacity-0 group-hover:opacity-100'}`}
          >
            {fetching
              ? <div className="w-2.5 h-2.5 border border-white border-t-transparent rounded-full animate-spin" />
              : '🔄'}
          </button>
        )}
      </div>
    </div>
  )
}
