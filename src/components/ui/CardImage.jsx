import { useState, useEffect, useRef, useCallback } from 'react'
import { fetchCardImages } from '../../lib/pokemonTcg'
import { supabase } from '../../lib/supabase'
import { setCardImage, getCardImageUrl } from '../../lib/imageCache'

const CARD_BACK = 'https://images.pokemontcg.io/back.png'
const SCANNER_URL = import.meta.env.VITE_SCANNER_URL

// R2 solo para JP/CN — pokemontcg.io no las tiene
async function fetchR2ImageUrl(nombre, numero, idioma, setName) {
  if (!SCANNER_URL || !nombre) return null
  const lang = (idioma === 'ja' || idioma === 'jp') ? 'jp'
             : (idioma === 'zh' || idioma === 'cn') ? 'cn'
             : null
  if (!lang) return null   // EN/otros → skip R2, va directo a pokemontcg.io
  try {
    const params = new URLSearchParams({
      name:   nombre.toLowerCase(),
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
  const fetchCount = useRef(0)
  const retryTimer = useRef(null)
  const [triedApiFallback, setTriedApiFallback] = useState(false)

  const doFetch = useCallback(async () => {
    if (fetching || !nombre) return
    fetchCount.current++
    setFetching(true)
    setFailed(false)

    // 1. R2 solo para JP/CN
    const r2Url = await fetchR2ImageUrl(nombre, numero, idioma, setName)
    if (r2Url) {
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

    setSrc(imgs.small)
    setLarge(imgs.large || imgs.small)
    setLoaded(true)
    setFetching(false)
    setFailed(false)

    const bestUrl = imgs.large || imgs.small
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
    // Prop disponible → usar directamente
    if (imageUrl) {
      setSrc(imageUrl); setLarge(imageUrl); setLoaded(true)
      if (cardId) setCardImage(cardId, imageUrl)
      return
    }

    // Cache de sesión → usar sin fetch
    const cached = getCardImageUrl(cardId)
    if (cached) {
      setSrc(cached); setLarge(cached); setLoaded(true)
      return
    }

    if (!nombre) return

    // Lazy load: fetch solo cuando entra en pantalla
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return
        observer.disconnect()
        doFetch()
      },
      { rootMargin: '200px' }
    )
    if (ref.current) observer.observe(ref.current)
    return () => {
      observer.disconnect()
      if (retryTimer.current) clearTimeout(retryTimer.current)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageUrl, nombre, numero, idioma, cardId])

  const handleClick = () => {
    if (src && onOpen) onOpen({ src: largeSrc || src, nombre, numero })
  }

  const handleRetry = () => {
    setFailed(false)
    setSrc(null)
    doFetch()
  }

  return (
    <div ref={ref} className="flex flex-col items-center gap-0.5">
      <div
        onClick={src && !failed ? handleClick : (failed ? handleRetry : undefined)}
        className={`w-7 h-10 rounded overflow-hidden flex items-center justify-center
          ${(src || failed) ? 'cursor-pointer hover:scale-110 transition-transform duration-150' : 'bg-gray-100'}`}
        title={
          src && !failed ? `Ver ${nombre}` :
          failed         ? 'Reintentar cargar imagen' :
          fetching       ? 'Cargando...' : ''
        }
      >
        {src && !failed ? (
          <img
            src={src}
            alt={nombre}
            className={`w-full h-full object-cover transition-opacity duration-300
              ${loaded ? 'opacity-100' : 'opacity-0'}`}
            onLoad={() => setLoaded(true)}
            onError={() => {
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
    </div>
  )
}
