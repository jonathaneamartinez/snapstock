import { useState, useEffect, useRef } from 'react'
import { fetchCardImages } from '../../lib/pokemonTcg'
import { supabase } from '../../lib/supabase'

/**
 * Imagen de carta con lazy load:
 * - Si tiene image_url directo → lo usa
 * - Si no → espera a que sea visible, busca en Pokemon TCG API,
 *   y guarda la URL en cards.image_url de Supabase para futuras cargas
 * - onClick → llama onOpen({ src, nombre, numero }) para el modal
 */
export default function CardImage({ imageUrl, cardId, nombre, numero, idioma, onOpen }) {
  const ref                   = useRef(null)
  const [src,      setSrc]    = useState(imageUrl || null)
  const [largeSrc, setLarge]  = useState(imageUrl || null)
  const [loaded,   setLoaded] = useState(!!imageUrl)
  const [fetching, setFetching] = useState(false)

  useEffect(() => {
    if (imageUrl) {
      setSrc(imageUrl)
      setLarge(imageUrl)
      setLoaded(true)
      return
    }
    if (!nombre) return

    // Intersection Observer: fetch solo cuando la fila entra en pantalla
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return
        observer.disconnect()
        if (fetching || src) return

        setFetching(true)
        fetchCardImages(nombre, numero, idioma).then(async (imgs) => {
          if (!imgs?.small) { setFetching(false); return }

          setSrc(imgs.small)
          setLarge(imgs.large || imgs.small)
          setLoaded(true)
          setFetching(false)

          // Persistir en Supabase para no volver a llamar a la API
          if (cardId && imgs.large) {
            supabase
              .from('cards')
              .update({ image_url: imgs.large })
              .eq('id', cardId)
              .then(({ error }) => {
                if (error) console.warn('[CardImage] No se pudo guardar imagen:', error.message)
              })
          }
        })
      },
      { rootMargin: '120px' }
    )

    if (ref.current) observer.observe(ref.current)
    return () => observer.disconnect()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageUrl, nombre, numero, idioma, cardId])

  const handleClick = () => {
    if (!onOpen) return
    onOpen({ src: largeSrc || src, nombre, numero })
  }

  return (
    <div
      ref={ref}
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
          onError={() => { setSrc(null); setLoaded(false) }}
        />
      ) : fetching ? (
        <div className="w-3 h-3 border border-gray-300 border-t-transparent rounded-full animate-spin" />
      ) : (
        <span className="text-gray-300 text-xs">?</span>
      )}
    </div>
  )
}
