import { useState, useEffect, useRef, useCallback } from 'react'
import { fetchCardImages } from '../../lib/pokemonTcg'
import { supabase } from '../../lib/supabase'
import { setCardImage, loadBlobUrl } from '../../lib/imageCache'

// Dorso genérico de carta Pokémon (sin dependencia de CDN externo)
const CARD_BACK = 'https://images.pokemontcg.io/back.png'

export default function CardImage({ imageUrl, cardId, nombre, numero, idioma, setName, onOpen }) {
  const ref                     = useRef(null)
  const [src,      setSrc]      = useState(imageUrl || null)
  const [largeSrc, setLarge]    = useState(imageUrl || null)
  const [loaded,   setLoaded]   = useState(!!imageUrl)
  const [fetching, setFetching] = useState(false)
  const [failed,   setFailed]   = useState(false)
  const fetchCount              = useRef(0)
  const retryTimer              = useRef(null)
  const [triedApiFallback, setTriedApiFallback] = useState(false)

  const doFetch = useCallback(async () => {
    if (fetching || !nombre) return
    fetchCount.current++
    setFetching(true)
    setFailed(false)
    const imgs = await fetchCardImages(nombre, numero, setName)

    if (!imgs?.small) {
      setFetching(false)
      setFailed(true)
      // Auto-retry: si es el primer o segundo intento, reintentamos en 8s
      if (fetchCount.current <= 2) {
        retryTimer.current = setTimeout(() => {
          setFailed(false)
          doFetch()
        }, 8000 * fetchCount.current) // 8s, 16s…
      }
      return
    }

    setSrc(imgs.small)
    setLarge(imgs.large || imgs.small)
    setLoaded(true)
    setFetching(false)
    setFailed(false)

    // Guardar en cache en memoria para el generador de claims
    const bestUrl = imgs.large || imgs.small
    if (cardId) {
      setCardImage(cardId, bestUrl)
      loadBlobUrl(bestUrl)
    }

    // Persistir image_url en Supabase para que la próxima vez cargue desde DB
    if (cardId && imgs.large) {
      supabase
        .from('cards')
        .update({ image_url: imgs.large })
        .eq('id', cardId)
        .then(({ error }) => {
          if (error) console.warn('[CardImage] Supabase update error:', error.message)
        })
    }
  }, [nombre, numero, idioma, cardId, fetching])

  useEffect(() => {
    if (imageUrl) {
      setSrc(imageUrl); setLarge(imageUrl); setLoaded(true)
      if (cardId) {
        setCardImage(cardId, imageUrl)
        loadBlobUrl(imageUrl)
      }
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

  // Click en dorso → reintentar fetch
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
          // Muestra el dorso de carta como placeholder clickeable para reintentar
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
