import { useState, useRef, useEffect } from 'react'
import { Search, BookOpen } from 'lucide-react'
import { useI18n }          from '../lib/i18n'
import {
  searchCardsByName,
  fetchCardsBySet,
} from '../lib/pokemonTcg'
import { scannerApi } from '../lib/scanner'
import SetSelect      from '../components/ui/SetSelect'
import Spinner        from '../components/ui/Spinner'

/* ─── Constantes ─────────────────────────────────────────────────────── */
const CARD_BACK = 'https://images.pokemontcg.io/back.png'
const PAGE_SIZE = 20

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
  price:   c.price_usd   ?? null,
})

/* ─── Deduplicar por _key ────────────────────────────────────────────── */
const dedupe = (arr) => {
  const seen = new Set()
  return arr.filter(c => { if (seen.has(c._key)) return false; seen.add(c._key); return true })
}

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

/* ─── Card individual ────────────────────────────────────────────────── */
function PokedexCard({ card }) {
  const [src, setSrc] = useState(card.image || CARD_BACK)

  return (
    <div className="flex flex-col rounded-2xl overflow-hidden
                    border border-gray-100 bg-white
                    shadow-sm hover:shadow-lg hover:-translate-y-0.5
                    transition-all duration-200 cursor-pointer group">

      {/* Imagen */}
      <div className="aspect-[2.5/3.5] bg-gray-50 overflow-hidden">
        <img
          src={src}
          alt={card.name}
          loading="lazy"
          className="w-full h-full object-contain
                     group-hover:scale-[1.04] transition-transform duration-300"
          onError={() => setSrc(CARD_BACK)}
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
        {card.price != null && (
          <p className="text-[10px] font-bold text-emerald-600 mt-0.5">
            U$D {parseFloat(card.price).toFixed(2)}
          </p>
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
  const [hasMoreEN,   setHasMoreEN]  = useState(false)

  const enPageRef   = useRef(1)
  const enQueryRef  = useRef('')
  const setCacheRef = useRef({ en: [], jp: [], cn: [] })
  const sentinelRef = useRef(null)
  const timerRef    = useRef(null)
  const loadMoreRef = useRef(null) // ref estable para el IntersectionObserver

  /* ── Buscar por nombre (3 idiomas en paralelo) ───────────────────── */
  const runNameSearch = async (q, page, langs) => {
    if (!q || q.length < 2) return
    if (page === 1) { setLoading(true); setCards([]) }
    else             setLoadingMore(true)

    const doEN = langs.has('en')
    const doJP = langs.has('jp')
    const doCN = langs.has('cn')

    const [enRes, jpRes, cnRes] = await Promise.allSettled([
      doEN                  ? searchCardsByName(q, PAGE_SIZE, page)     : Promise.resolve({ results: [], totalCount: 0 }),
      doJP && page === 1    ? scannerApi.buscar(q, 'jp', '', 120)       : Promise.resolve({ results: [] }),
      doCN && page === 1    ? scannerApi.buscar(q, 'cn', '', 120)       : Promise.resolve({ results: [] }),
    ])

    const en = doEN              ? (enRes.value?.results ?? []).map(c => norm(c, 'en')) : []
    const jp = doJP && page === 1 ? (jpRes.value?.results ?? []).map(c => norm(c, 'jp')) : []
    const cn = doCN && page === 1 ? (cnRes.value?.results ?? []).map(c => norm(c, 'cn')) : []

    const enTotal = enRes.value?.totalCount ?? 0
    enPageRef.current  = page
    enQueryRef.current = q
    setHasMoreEN(page * PAGE_SIZE < enTotal)

    if (page === 1) {
      setCards(dedupe([...en, ...jp, ...cn]))
    } else {
      // load more: solo append EN (JP/CN ya vienen completos desde la página 1)
      setCards(prev => {
        const seen = new Set(prev.map(c => c._key))
        return [...prev, ...en.filter(c => !seen.has(c._key))]
      })
    }

    setLoading(false)
    setLoadingMore(false)
  }

  /* ── Cargar todas las cartas de un set (3 idiomas en paralelo) ─────── */
  const loadSet = async (setId, langs) => {
    setLoading(true)
    setCards([])
    setCacheRef.current = { en: [], jp: [], cn: [] }
    setHasMoreEN(false)

    const [enRes, jpRes, cnRes] = await Promise.allSettled([
      fetchCardsBySet(setId),
      scannerApi.buscar('', 'jp', setId, 300),
      scannerApi.buscar('', 'cn', setId, 300),
    ])

    const en = (enRes.value ?? []).map(c => norm(c, 'en'))
    const jp = (jpRes.value?.results ?? []).map(c => norm(c, 'jp'))
    const cn = (cnRes.value?.results ?? []).map(c => norm(c, 'cn'))

    setCacheRef.current = { en, jp, cn }
    applySetFilter('', langs, { en, jp, cn })
    setLoading(false)
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
      setHasMoreEN(false)
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
      setHasMoreEN(false)
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

  /* ── Load more (paginación EN) ────────────────────────────────────── */
  const loadMore = () => {
    if (loadingMore || !hasMoreEN) return
    runNameSearch(enQueryRef.current, enPageRef.current + 1, activeLangs)
  }
  loadMoreRef.current = loadMore // siempre fresco, sin stale closure

  useEffect(() => {
    if (!sentinelRef.current || !hasMoreEN) return
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) loadMoreRef.current() },
      { threshold: 0.1 }
    )
    obs.observe(sentinelRef.current)
    return () => obs.disconnect()
  }, [hasMoreEN, loadingMore])

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

        {/* Loading inicial */}
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
        {!loading && isEmpty && hasSearch && (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
            <span className="text-5xl">🔍</span>
            <p className="font-semibold text-gray-600">Sin resultados</p>
            <p className="text-sm text-gray-400">Probá con otro nombre, set o activando más idiomas</p>
          </div>
        )}

        {/* Grid de cartas */}
        {!loading && cards.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
            {cards.map(card => (
              <PokedexCard key={card._key} card={card} />
            ))}
          </div>
        )}

        {/* Sentinel de infinite scroll + load more indicator */}
        {hasMoreEN && (
          <div ref={sentinelRef}
               className="flex items-center justify-center py-6 mt-4 border-t border-gray-100">
            {loadingMore
              ? <div className="flex items-center gap-2 text-sm text-gray-400">
                  <Spinner size={16} className="text-violet-400" />
                  Cargando más cartas EN…
                </div>
              : <span className="text-xs text-gray-300">↓ Scroll para cargar más</span>
            }
          </div>
        )}
      </div>
    </div>
  )
}
