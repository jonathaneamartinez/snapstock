import { useState, useEffect, useRef, useCallback } from 'react'
import { fetchCardImages } from '../../lib/pokemonTcg'
import { supabase } from '../../lib/supabase'

export default function CardImage({ imageUrl, cardId, nombre, numero, idioma, onOpen }) {
  const ref                     = useRef(null)
  const [src,      setSrc]      = useState(imageUrl || null)
  const [largeSrc, setLarge]    = useState(imageUrl || null)
  const [loaded,   setLoaded]   = useState(!!imageUrl)
  const [fetching, setFetching] = useState(false)
  const [failed,   setFailed]   = useState(false)

  const doFetch = useCallback(async () => {
    if (fetching || !nombre) return
    setFetching(true)
    setFailed(false)
    const imgs = await fetchCardImages(nombre, numero, idioma)

    if (!imgs?.small) {
      setFetching(false)
      setFailed(true)
      return
    }

    setSrc(imgs.small)
    setLarge(imgs.large || imgs.small)
    setLoaded(true)
    setFetching(false)
    setFailed(false)

    // Persistir en Supabase
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
    if (imageUrl) { setSrc(imageUrl); setLarge(imageUrl); setLoaded(true); return }
    if (!nombre) return

    // Lazy load: fetch solo cuando entra en pantalla
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return
        observer.disconnect()
        doFetch()
      },
      { rootMargin: '120px' }
    )
    if (ref.current) observer.observe(ref.current)
    return () => observer.disconnect()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageUrl, nombre, numero, idioma, cardId])

  const handleClick = () => {
    if (src && onOpen) onOpen({ src: largeSrc || src, nombre, numero })
  }

  return (
    <div ref={ref} className="flex flex-col items-center gap-0.5">
      {/* Miniatura */}
      <div
        onClick={src ? handleClick : undefined}
        className={`w-7 h-10 rounded overflow-hidden flex items-center justify-center
          ${src ? 'cursor-pointer hover:scale-110 transition-transform duration-150' : 'bg-gray-100'}`}
        title={src ? `Ver ${nombre}` : ''}
      >
        {src ? (
          <img
            src={src}
            alt={nombre}
            className={`w-full h-full object-cover transition-opacity duration-300
              ${loaded ? 'opacity-100' : 'opacity-0'}`}
            onLoad={() => setLoaded(true)}
            onError={() => { setSrc(null); setLoaded(false); setFailed(true) }}
          />
        ) : fetching ? (
          <div className="w-3 h-3 border border-gray-300 border-t-transparent rounded-full animate-spin" />
        ) : (
          <span className="text-gray-300 text-xs">?</span>
        )}
      </div>

      {/* Botón reintentar — solo aparece cuando falló */}
      {failed && !src && !fetching && (
        <button
          onClick={doFetch}
          title="Reintentar buscar imagen"
          className="text-[9px] text-blue-400 hover:text-blue-600 leading-none transition"
        >
          ↺
        </button>
      )}
    </div>
  )
}
