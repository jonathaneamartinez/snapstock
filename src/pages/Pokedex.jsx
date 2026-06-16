import { useState, useRef, useEffect } from 'react'
import { Search, BookOpen, X, ChevronLeft, ChevronRight } from 'lucide-react'
import { useI18n }          from '../lib/i18n'
import { fetchCardsBySet }  from '../lib/pokemonTcg'
import { scannerApi }       from '../lib/scanner'
import { supabase }         from '../lib/supabase'
import SetSelect      from '../components/ui/SetSelect'
import Spinner        from '../components/ui/Spinner'
import FinishBadge   from '../components/ui/FinishBadge'

/* ─── Constantes ─────────────────────────────────────────────────────── */
const CARD_BACK = 'https://images.pokemontcg.io/back.png'
const PAGE_SIZE = 60

/* ─── Cache de imágenes por nombre+número+idioma ─────────────────────────
   Evita llamadas duplicadas al backend cuando el mismo card aparece varias
   veces (paginación, re-filtros, etc.)
──────────────────────────────────────────────────────────────────────── */
const _imgCache = new Map()
const fetchImgUrl = (name, number, lang) => {
  const key = `${lang}|${name}|${number}`
  if (_imgCache.has(key)) return Promise.resolve(_imgCache.get(key))
  return scannerApi.cardImageUrl(name, number, lang)
    .then(r => { _imgCache.set(key, r.url ?? null); return r.url ?? null })
    .catch(() => { _imgCache.set(key, null); return null })
}

/* Wrapper para no quedar colgado si el scanner demora mucho */
const withTimeout = (promise, ms = 8000) =>
  Promise.race([
    promise,
    new Promise(resolve => setTimeout(() => resolve({ results: [] }), ms)),
  ])

const LANG_CFG = {
  en: { label: 'EN', flag: '🇬🇧', active: 'bg-blue-100 text-blue-600 border-blue-200',   inactive: 'bg-gray-50 text-gray-400 border-gray-200' },
  jp: { label: 'JP', flag: '🇯🇵', active: 'bg-red-100  text-red-600  border-red-200',    inactive: 'bg-gray-50 text-gray-400 border-gray-200' },
  cn: { label: 'CN', flag: '🇨🇳', active: 'bg-yellow-100 text-yellow-700 border-yellow-200', inactive: 'bg-gray-50 text-gray-400 border-gray-200' },
}

/* ─── Normalizar carta a formato uniforme ────────────────────────────── */
const norm = (c, lang) => ({
  _lang:   lang,
  _key:    `${lang}|${(c.name ?? c.nombre ?? '').toLowerCase()}|${c.set_name ?? ''}|${c.card_number ?? c.numero ?? ''}`,
  name:    c.name    ?? c.nombre   ?? '—',
  set:     c.set_name ?? '—',
  set_id:  c.set_id  ?? null,
  number:  c.card_number ?? c.numero  ?? '',
  image:   c.image_url   ?? c.imagen   ?? null,
})

/* ─── Deduplicar por _key ────────────────────────────────────────────── */
const dedupe = (arr) => {
  const seen = new Set()
  return arr.filter(c => { if (seen.has(c._key)) return false; seen.add(c._key); return true })
}

/* ─── Normalizar fila de Supabase `cards` ────────────────────────────── */
const normSupabase = (c) => ({
  _lang:   c.language ?? 'en',
  _key:    `${c.language}|${(c.name ?? '').toLowerCase()}|${c.set_name ?? ''}|${c.card_number ?? ''}`,
  name:    c.name    ?? '—',
  set:     c.set_name ?? '—',
  set_id:  null,
  number:  c.card_number ?? '',
  image:   c.image_url   ?? null,
  variant: c.variant     ?? 'normal',
})

/* ─── Badge de idioma ────────────────────────────────────────────────── */
function LangBadge({ lang }) {
  const cfg = LANG_CFG[lang]
  if (!cfg) return null
  return (
    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border whitespace-nowrap
                      ${cfg.active}`}>
      {cfg.flag} {cfg.label}
    </span>
  )
}

/* ─── Modal de carta ampliada ────────────────────────────────────────── */
function CardModal({ card, onClose, onPrev, onNext, hasPrev, hasNext }) {
  const [src,   setSrc]   = useState(card.image || CARD_BACK)
  const [price, setPrice] = useState(null)  // { price_usd, source, finish } | null | 'loading'

  const handleError = () => setSrc(CARD_BACK)

  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape')      onClose()
      if (e.key === 'ArrowLeft'  && hasPrev) onPrev()
      if (e.key === 'ArrowRight' && hasNext) onNext()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose, onPrev, onNext, hasPrev, hasNext])

  useEffect(() => {
    setSrc(card.image || CARD_BACK)
    setPrice('loading')
    if (!card.name) return
    let cancelled = false
    fetchImgUrl(card.name, card.number, card._lang).then(url => {
      if (!cancelled) setSrc(url || CARD_BACK)
    })
    scannerApi.cardPrice(card.name, card.number, card._lang, card.variant || 'normal')
      .then(r => { if (!cancelled) setPrice(r) })
      .catch(() => { if (!cancelled) setPrice(null) })
    return () => { cancelled = true }
  }, [card])

  const fmtUSD = (n) => n != null ? `U$D ${Number(n).toFixed(2)}` : null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4
                 bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative flex flex-col items-center gap-4 max-w-sm w-full"
        onClick={e => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute -top-3 -right-3 z-10 w-8 h-8 rounded-full
                     bg-white/90 text-gray-600 hover:text-gray-900
                     flex items-center justify-center shadow-lg
                     transition hover:scale-110"
        >
          <X size={16} />
        </button>

        {hasPrev && (
          <button
            onClick={onPrev}
            className="absolute left-[-48px] top-1/2 -translate-y-1/2
                       w-9 h-9 rounded-full bg-white/90 text-gray-600
                       hover:text-gray-900 flex items-center justify-center
                       shadow-lg transition hover:scale-110"
          >
            <ChevronLeft size={20} />
          </button>
        )}
        {hasNext && (
          <button
            onClick={onNext}
            className="absolute right-[-48px] top-1/2 -translate-y-1/2
                       w-9 h-9 rounded-full bg-white/90 text-gray-600
                       hover:text-gray-900 flex items-center justify-center
                       shadow-lg transition hover:scale-110"
          >
            <ChevronRight size={20} />
          </button>
        )}

        <img
          src={src}
          alt={card.name}
          className="w-full rounded-2xl shadow-2xl"
          style={{ maxHeight: '70vh', objectFit: 'contain' }}
          onError={handleError}
        />

        <div className="bg-white/90 backdrop-blur-sm rounded-2xl px-5 py-3
                        flex flex-col gap-2 shadow-lg w-full">
          <div className="flex items-center gap-3">
            <LangBadge lang={card._lang} />
            <div className="flex-1 min-w-0">
              <p className="font-bold text-gray-800 text-sm truncate">{card.name}</p>
              <p className="text-xs text-gray-400 truncate">{card.set}</p>
            </div>
            {card.number && (
              <span className="text-xs text-gray-300 shrink-0">#{card.number}</span>
            )}
          </div>

          {/* Variant + precio */}
          <div className="flex items-center justify-between border-t border-gray-100 pt-2 gap-2">
            <FinishBadge finish={card.variant || 'normal'} size="sm" />
            <div className="text-right">
              {price === 'loading' && (
                <span className="text-xs text-gray-300">Cargando precio…</span>
              )}
              {price && price !== 'loading' && price.price_usd != null && (
                <span className="text-sm font-bold text-emerald-600">
                  {fmtUSD(price.price_usd)}
                </span>
              )}
              {price && price !== 'loading' && price.price_usd == null && (
                <span className="text-xs text-gray-300">Sin precio</span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ─── Card individual ────────────────────────────────────────────────── */
function PokedexCard({ card, onClick }) {
  // Arrancar con la image_url de Supabase (render instantáneo), pero siempre
  // buscar la imagen CORRECTA por nombre+número en R2. Así si la BD tiene
  // una URL incorrecta (otro card), se sobreescribe con la imagen real.
  const [src, setSrc] = useState(card.image || CARD_BACK)

  useEffect(() => {
    if (!card.name) return
    let cancelled = false
    fetchImgUrl(card.name, card.number, card._lang).then(url => {
      if (cancelled) return
      // Si R2/pokemontcg.io no encontró imagen → mostrar dorso en lugar de
      // conservar una image_url potencialmente incorrecta de Supabase
      setSrc(url || CARD_BACK)
    })
    return () => { cancelled = true }
  }, [card.name, card.number, card._lang])

  const handleError = () => setSrc(CARD_BACK)

  return (
    <div
      onClick={onClick}
      className="flex flex-col rounded-2xl overflow-hidden
                 border border-gray-100 bg-white
                 shadow-sm hover:shadow-lg hover:-translate-y-0.5
                 transition-all duration-200 cursor-pointer group"
    >
      {/* Imagen */}
      <div className="aspect-[2.5/3.5] bg-gray-50 overflow-hidden">
        <img
          src={src}
          alt={card.name}
          loading="lazy"
          className="w-full h-full object-contain
                     group-hover:scale-[1.04] transition-transform duration-300"
          onError={handleError}
        />
      </div>

      {/* Info */}
      <div className="p-2 pb-2.5 flex flex-col gap-0.5">
        <p className="text-xs font-semibold text-gray-800 leading-tight line-clamp-2">
          {card.name}
        </p>
        <p className="text-[10px] text-gray-400 truncate">{card.set}</p>
        <div className="flex items-center justify-between mt-1 gap-1">
          <LangBadge lang={card._lang} />
          {card.number && (
            <span className="text-[9px] text-gray-300 shrink-0">#{card.number}</span>
          )}
        </div>
        {card.variant && card.variant !== 'normal' && (
          <div className="mt-0.5">
            <FinishBadge finish={card.variant} size="xs" />
          </div>
        )}
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════
   Página principal
════════════════════════════════════════════════════════════════════════ */
export default function Pokedex() {
  const { t } = useI18n()

  const [query,       setQuery]      = useState('')
  const [setInfo,     setSetInfo]    = useState({ set_id: null, set_name: '' })
  const [activeLangs, setActiveLangs] = useState(new Set(['en', 'jp', 'cn']))
  const [cards,       setCards]      = useState([])
  const [loading,     setLoading]    = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [loadingAlt,  setLoadingAlt] = useState(false) // JP/CN cargando (solo en modo set)
  const [hasMore,     setHasMore]    = useState(false)
  const [modalIdx,    setModalIdx]   = useState(null)  // índice de carta abierta en modal

  // Warm-up: despertar Railway apenas el usuario entra a la página
  useEffect(() => { scannerApi.health().catch(() => {}) }, [])

  const pageRef      = useRef(1)
  const queryRef     = useRef('')
  const setCacheRef  = useRef({ en: [], jp: [], cn: [] })
  const sentinelRef  = useRef(null)
  const timerRef     = useRef(null)
  const loadMoreRef  = useRef(null) // ref estable para el IntersectionObserver
  const searchIdRef  = useRef(0)    // evita que resultados viejos sobreescriban los nuevos

  /* ── Buscar por nombre — usa Supabase directamente (todas las langs juntas) ── */
  const runNameSearch = async (q, page, langs) => {
    if (!q || q.length < 2) return

    // Incrementar ID para cancelar callbacks de búsquedas anteriores
    searchIdRef.current += 1
    const myId = searchIdRef.current

    if (page === 1) { setLoading(true); setLoadingAlt(false); setCards([]) }
    else             setLoadingMore(true)

    try {
      const from = (page - 1) * PAGE_SIZE
      const to   = from + PAGE_SIZE - 1

      const { data, count, error } = await supabase
        .from('cards')
        .select('id, name, set_name, card_number, language, image_url, variant', { count: 'exact' })
        .ilike('name', `${q}%`)
        .in('language', [...langs])
        .range(from, to)
        .order('name')
        .order('card_number')

      if (searchIdRef.current !== myId) return // búsqueda cancelada
      if (error) throw error

      const total   = count ?? 0
      const results = (data ?? []).map(normSupabase)

      pageRef.current  = page
      queryRef.current = q
      setHasMore(to < total - 1)

      if (page === 1) {
        setCards(dedupe(results))
      } else {
        setCards(prev => {
          const seen = new Set(prev.map(c => c._key))
          return [...prev, ...results.filter(c => !seen.has(c._key))]
        })
      }
    } catch (err) {
      if (searchIdRef.current !== myId) return
      console.error('Pokédex search error:', err)
      setHasMore(false)
    } finally {
      if (searchIdRef.current === myId) {
        setLoading(false)
        setLoadingMore(false)
      }
    }
  }

  /* ── Cargar todas las cartas de un set — progresivo: EN primero ─────── */
  const loadSet = async (setId, langs) => {
    searchIdRef.current += 1
    const myId = searchIdRef.current

    setLoading(true)
    setLoadingAlt(false)
    setCards([])
    setCacheRef.current = { en: [], jp: [], cn: [] }
    setHasMore(false)

    // Lanzar los 3 en paralelo
    const enPromise = fetchCardsBySet(setId)
    const jpPromise = withTimeout(scannerApi.buscar('', 'jp', setId, 300))
    const cnPromise = withTimeout(scannerApi.buscar('', 'cn', setId, 300))

    // Mostrar EN en cuanto llegue
    let en = []
    try {
      const enCards = await enPromise
      if (searchIdRef.current !== myId) return
      en = enCards.map(c => norm(c, 'en'))
    } catch (_) {
      if (searchIdRef.current !== myId) return
    }

    const currentQuery = query
    setCacheRef.current = { en, jp: [], cn: [] }
    applySetFilter(currentQuery, langs, { en, jp: [], cn: [] })
    setLoading(false)
    if (langs.has('jp') || langs.has('cn')) setLoadingAlt(true)

    // Agregar JP/CN en background
    Promise.allSettled([jpPromise, cnPromise]).then(([jpRes, cnRes]) => {
      if (searchIdRef.current !== myId) return
      const jp = langs.has('jp') ? (jpRes.value?.results ?? []).map(c => norm(c, 'jp')) : []
      const cn = langs.has('cn') ? (cnRes.value?.results ?? []).map(c => norm(c, 'cn')) : []
      setCacheRef.current = { en, jp, cn }
      applySetFilter(currentQuery, langs, { en, jp, cn })
      setLoadingAlt(false)
    })
  }

  /* ── Filtrar el cache del set de forma local (0ms) ──────────────── */
  const applySetFilter = (q, langs, cache = setCacheRef.current) => {
    const qL = q.trim().toLowerCase()
    const f  = (arr) => qL ? arr.filter(c => c.name.toLowerCase().includes(qL)) : arr
    const en = langs.has('en') ? f(cache.en) : []
    const jp = langs.has('jp') ? f(cache.jp) : []
    const cn = langs.has('cn') ? f(cache.cn) : []
    setCards(dedupe([...en, ...jp, ...cn]))
  }

  /* ── Handler: cambio de nombre ────────────────────────────────────── */
  const handleQuery = (val) => {
    setQuery(val)
    clearTimeout(timerRef.current)

    if (setInfo.set_id) {
      // Filtro instantáneo desde caché del set
      applySetFilter(val, activeLangs)
      return
    }

    if (!val.trim() || val.trim().length < 2) {
      setCards([])
      setHasMore(false)
      return
    }

    timerRef.current = setTimeout(() => runNameSearch(val.trim(), 1, activeLangs), 200)
  }

  /* ── Handler: cambio de set ───────────────────────────────────────── */
  const handleSetChange = (patch) => {
    const newInfo = { set_id: patch.set_id ?? null, set_name: patch.set_name ?? '' }
    setSetInfo(newInfo)
    clearTimeout(timerRef.current)

    if (patch.set_id) {
      loadSet(patch.set_id, activeLangs)
    } else {
      // Set limpiado
      setCacheRef.current = { en: [], jp: [], cn: [] }
      setCards([])
      setHasMore(false)
      if (query.trim().length >= 2)
        timerRef.current = setTimeout(() => runNameSearch(query.trim(), 1, activeLangs), 0)
    }
  }

  /* ── Handler: toggle de idioma ────────────────────────────────────── */
  const toggleLang = (key) => {
    setActiveLangs(prev => {
      const next = new Set(prev)
      if (next.has(key) && next.size > 1) next.delete(key)
      else next.add(key)

      // Aplicar inmediatamente con el nuevo Set
      if (setInfo.set_id) {
        applySetFilter(query, next)
      } else if (query.trim().length >= 2) {
        clearTimeout(timerRef.current)
        timerRef.current = setTimeout(() => runNameSearch(query.trim(), 1, next), 50)
      }
      return next
    })
  }

  /* ── Load more (paginación Supabase) ─────────────────────────────── */
  const loadMore = () => {
    if (loadingMore || !hasMore) return
    runNameSearch(queryRef.current, pageRef.current + 1, activeLangs)
  }
  loadMoreRef.current = loadMore // siempre fresco, sin stale closure

  useEffect(() => {
    if (!sentinelRef.current || !hasMore) return
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) loadMoreRef.current() },
      { threshold: 0.1 }
    )
    obs.observe(sentinelRef.current)
    return () => obs.disconnect()
  }, [hasMore, loadingMore])

  /* ─────────────────────────────────────────────────────────────────── */
  const hasSearch = query.trim().length >= 2 || !!setInfo.set_id
  const isEmpty   = !loading && cards.length === 0

  return (
    <div className="space-y-5">

      {/* ── Header + controles ──────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
              <BookOpen size={20} className="text-violet-500" />
              Pokédex
            </h2>
            <p className="text-sm text-gray-400 mt-0.5">
              {t('pokedex_sub') !== 'pokedex_sub'
                ? t('pokedex_sub')
                : 'Explorá cartas en todos los idiomas y expansiones'}
            </p>
          </div>
          {cards.length > 0 && (
            <span className="text-sm font-semibold text-gray-500 bg-gray-50 px-3 py-1.5 rounded-xl shrink-0">
              {cards.length} cartas
            </span>
          )}
        </div>

        {/* Búsqueda */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300 pointer-events-none" />
            <input
              type="text"
              value={query}
              onChange={e => handleQuery(e.target.value)}
              placeholder="Buscar por nombre… ej: Gengar, Charizard, Mew"
              className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm
                         bg-white focus:outline-none focus:ring-2 focus:ring-violet-300
                         placeholder:text-gray-300 transition"
            />
          </div>
          <div className="sm:w-60">
            <SetSelect
              value={setInfo.set_name}
              setId={setInfo.set_id}
              onChange={handleSetChange}
              placeholder="Filtrar por set…"
            />
          </div>
        </div>

        {/* Filtros de idioma */}
        <div className="mt-3 flex items-center gap-2 flex-wrap">
          <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">
            Idioma:
          </span>
          {Object.entries(LANG_CFG).map(([key, cfg]) => (
            <button
              key={key}
              onClick={() => toggleLang(key)}
              className={`px-3 py-1 rounded-full text-xs font-semibold border transition
                ${activeLangs.has(key) ? cfg.active : cfg.inactive}`}
            >
              {cfg.flag} {cfg.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Grid de cartas ──────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 min-h-[200px]">

        {/* Loading inicial (esperando EN) */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <Spinner size={28} className="text-violet-400" />
            <p className="text-sm text-gray-400">Buscando cartas…</p>
          </div>
        )}

        {/* Empty: sin búsqueda todavía */}
        {!loading && isEmpty && !hasSearch && (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
            <img src={CARD_BACK} alt="" className="w-14 h-auto opacity-25 mb-2 drop-shadow" />
            <p className="font-semibold text-gray-600">Buscá un Pokémon</p>
            <p className="text-sm text-gray-400 max-w-xs">
              Escribí un nombre o elegí un set para explorar todas las cartas
            </p>
          </div>
        )}

        {/* Empty: buscó pero no encontró */}
        {!loading && isEmpty && hasSearch && !loadingAlt && (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
            <span className="text-5xl">🔍</span>
            <p className="font-semibold text-gray-600">Sin resultados</p>
            <p className="text-sm text-gray-400">Probá con otro nombre, set o activando más idiomas</p>
          </div>
        )}

        {/* Grid de cartas (se muestra apenas llega EN) */}
        {!loading && cards.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
            {cards.map((card, i) => (
              <PokedexCard key={card._key} card={card} onClick={() => setModalIdx(i)} />
            ))}
          </div>
        )}

        {/* Indicador JP/CN cargando en background */}
        {loadingAlt && !loading && (
          <div className="flex items-center justify-center gap-2 pt-4 pb-1">
            <Spinner size={13} className="text-gray-300" />
            <span className="text-xs text-gray-300">Cargando JP · CN…</span>
          </div>
        )}

        {/* Sentinel de infinite scroll + load more indicator */}
        {hasMore && (
          <div ref={sentinelRef}
               className="flex items-center justify-center py-6 mt-4 border-t border-gray-100">
            {loadingMore
              ? <div className="flex items-center gap-2 text-sm text-gray-400">
                  <Spinner size={16} className="text-violet-400" />
                  Cargando más cartas…
                </div>
              : <span className="text-xs text-gray-300">↓ Scroll para cargar más</span>
            }
          </div>
        )}
      </div>

      {/* ── Modal de carta ampliada ──────────────────────────────────── */}
      {modalIdx !== null && cards[modalIdx] && (
        <CardModal
          card={cards[modalIdx]}
          onClose={() => setModalIdx(null)}
          onPrev={() => setModalIdx(i => Math.max(0, i - 1))}
          onNext={() => setModalIdx(i => Math.min(cards.length - 1, i + 1))}
          hasPrev={modalIdx > 0}
          hasNext={modalIdx < cards.length - 1}
        />
      )}
    </div>
  )
}
