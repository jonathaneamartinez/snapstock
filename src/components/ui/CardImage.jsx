import { useState, useEffect, useRef } from 'react'
import { fetchCardImages } from '../../lib/pokemonTcg'

/**
 * Imagen de carta con lazy load:
 * - Si tiene image_url directo → lo usa
 * - Si no → espera a que sea visible y busca en Pokemon TCG API
 * - onClick → llama onOpen(largeUrl) para el modal
 */
export default function CardImage({ imageUrl, nombre, numero, idioma, onOpen }) {
  const ref       = useRef(null)
  const [src, setSrc]         = useState(imageUrl || null)
  const [largeSrc, setLarge]  = useState(imageUrl || null)
  const [loaded, setLoaded]   = useState(!!imageUrl)
  const [fetching, setFetching] = useState(false)

  useEffect(() => {
    if (imageUrl) { setSrc(imageUrl); setLarge(imageUrl); setLoaded(true); return }
    if (!nombre)  return

    // Intersection Observer: fetch solo cuando entra en pantalla
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return
        observer.disconnect()
        if (fetching || src) return
        setFetching(true)
        fetchCardImages(nombre, numero, idioma).then(imgs => {
          if (imgs?.small) { setSrc(imgs.small);  setLoaded(true) }
          if (imgs?.large) setLarge(imgs.large)
          setFetching(false)
        })
      },
      { rootMargin: '100px' }
    )
    if (ref.current) observer.observe(ref.current)
    return () => observer.disconnect()
  }, [imageUrl, nombre, numero, idioma])

  const handleClick = () => {
    if (largeSrc && onOpen) onOpen({ src: largeSrc, nombre, numero })
  }

  return (
    <div
      ref={ref}
      onClick={handleClick}
      className={`w-7 h-10 rounded overflow-hidden flex items-center justify-center
        ${src ? 'cursor-pointer hover:scale-110 transition-transform' : 'bg-gray-100'}`}
      title={src ? `Ver ${nombre}` : ''}
    >
      {src ? (
        <img
          src={src}
          alt={nombre}
          className={`w-full h-full object-cover transition-opacity duration-300
            ${loaded ? 'opacity-100' : 'opacity-0'}`}
          onLoad={() => setLoaded(true)}
          onError={() => setSrc(null)}
        />
      ) : fetching ? (
        <div className="w-3 h-3 border border-gray-300 border-t-transparent rounded-full animate-spin" />
      ) : (
        <span className="text-gray-300 text-xs">?</span>
      )}
    </div>
  )
}
