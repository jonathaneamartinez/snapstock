import { useState, useEffect, useRef, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { scannerApi } from '../lib/scanner'
import {
  fetchCardImages,
  fetchCardsBySet,
  fetchCardBySetAndNumber,
  searchCardsByName,
} from '../lib/pokemonTcg'
import { supabase } from '../lib/supabase'
import { useDolar } from '../hooks/useDolar'
import { useSettings } from '../hooks/useSettings'
import { CONDICIONES, IDIOMAS, STORE_ID } from '../constants'

// ── Enriquece una lista de sugerencias con precios PC desde price_history ─────
// Hace 1 sola query batch por nombre × idioma, sin necesitar card_id previo.
async function enrichSuggestionsWithPCPrices(suggestions, lang) {
  if (!suggestions.length) return suggestions

  // Recolectar nombres únicos (case-insensitive normalizados)
  const names = [...new Set(suggestions.map(s => s.nombre).filter(Boolean))]
  if (!names.length) return suggestions

  // Buscar card_ids — usamos ilike OR sobre todos los nombres para tolerar
  // diferencias de capitalización. Supabase no soporta ilike+in nativo,
  // así que pedimos por los nombres tal cual y complementamos con número+set.
  const { data: cards } = await supabase
    .from('cards')
    .select('id, name, card_number, set_name')
    .in('name', names)
    .eq('language', lang)
    .limit(300)

  // Segunda pasada: buscar por nombre case-insensitive para los que no matchearon
  const foundNames = new Set((cards ?? []).map(c => c.name))
  const missing = names.filter(n => !foundNames.has(n))
  let extraCards = []
  if (missing.length) {
    // Buscar cada nombre faltante con ilike (hasta 5 para no abusar)
    for (const nm of missing.slice(0, 5)) {
      const { data } = await supabase
        .from('cards')
        .select('id, name, card_number, set_name')
        .ilike('name', nm)
        .eq('language', lang)
        .limit(10)
      if (data?.length) extraCards.push(...data)
    }
  }

  const allCards = [...(cards ?? []), ...extraCards]
  if (!allCards.length) return suggestions

  const cardIds = [...new Set(allCards.map(c => c.id))]
  const { data: prices } = await supabase
    .from('price_history')
    .select('card_id, price_usd, snapshot_date')
    .in('card_id', cardIds)
    .eq('source', 'pricecharting')
    .eq('grade', 'ungraded')
    .order('snapshot_date', { ascending: false })
    .limit(500)

  if (!prices?.length) return suggestions

  // Mapa card_id → precio más reciente
  const priceMap = {}
  for (const p of prices) {
    if (!priceMap[p.card_id]) priceMap[p.card_id] = p.price_usd
  }

  // Índices de búsqueda: nombre (lower) + numero → id, y nombre (lower) + set (lower) → id
  const byNameNum = {}
  const byNameSet = {}
  const byNameOnly = {}
  for (const c of allCards) {
    const nl = (c.name || '').toLowerCase()
    const nu = (c.card_number || '').toLowerCase()
    const sl = (c.set_name || '').toLowerCase()
    byNameNum[`${nl}|${nu}`]  = c.id
    byNameSet[`${nl}|${sl}`]  = c.id
    byNameOnly[nl]            = c.id // fallback más débil
  }

  return suggestions.map(s => {
    const nl = (s.nombre || '').toLowerCase()
    const nu = (s.numero  || '').toLowerCase()
    const sl = (s.set     || '').toLowerCase()
    const cid = byNameNum[`${nl}|${nu}`]
             ?? byNameSet[`${nl}|${sl}`]
             ?? byNameOnly[nl]
    const pcPrice = cid ? priceMap[cid] : null
    return pcPrice ? { ...s, precio_usd: pcPrice, source_price: 'pc' } : s
  })
}

// ── Busca precio de PriceCharting desde price_history por card_id + grade ────
async function fetchPrecioPC(cardId, finish = 'normal', grade = 'ungraded') {
  if (!cardId) return null
  let q = supabase
    .from('price_history')
    .select('price_usd, price_buy_usd, price_sell_usd, snapshot_date, finish')
    .eq('card_id', cardId)
    .eq('source', 'pricecharting')
    .eq('grade', grade)
    .order('snapshot_date', { ascending: false })
  const { data } = await q.limit(5)
  if (!data?.length) return null
  // Preferir el finish exacto, sino el más reciente
  const exact = data.find(r => r.finish === finish || r.finish === 'normal')
  const row   = exact ?? data[0]
  return {
    price_usd:      row.price_usd      ?? null,
    price_buy_usd:  row.price_buy_usd  ?? null,
    price_sell_usd: row.price_sell_usd ?? null,
  }
}

// ── Normaliza número de carta (strip ceros leading, quita /total) ─────────────
function normalizeCardNum(raw) {
  if (!raw) return ''
  const s = String(raw).trim()
  const left = s.includes('/') ? s.split('/')[0] : s
  if (/^\d+$/.test(left)) return String(parseInt(left, 10))
  return left
}

// ── Busca card_id + set_name en Supabase por nombre+numero+idioma ─────────────
async function fetchCardId(nombre, numero, idioma, setName) {
  if (!nombre) return null
  const numNorm = normalizeCardNum(numero)
  let q = supabase.from('cards').select('id, set_name, language')
    .ilike('name', nombre.trim())
    .eq('language', idioma || 'en')
  if (numNorm) q = q.eq('card_number', numNorm)
  if (setName) q = q.eq('set_name', setName.trim())
  let { data } = await q.limit(1).maybeSingle()
  // Fallback: si no matchea con número normalizado, probar con el raw
  if (!data && numero && numNorm !== numero.trim()) {
    let q2 = supabase.from('cards').select('id, set_name, language')
      .ilike('name', nombre.trim())
      .eq('language', idioma || 'en')
      .eq('card_number', numero.trim())
    if (setName) q2 = q2.eq('set_name', setName.trim())
    const { data: d2 } = await q2.limit(1).maybeSingle()
    data = d2
  }
  return data ? { id: data.id, set_name: data.set_name } : null
}
import Toast      from '../components/ui/Toast'
import Spinner    from '../components/ui/Spinner'
import SetSelect    from '../components/ui/SetSelect'
import FinishSelect  from '../components/ui/FinishSelect'
import ImportarCartasModal from '../components/ingresos/ImportarCartasModal'
import { useI18n } from '../lib/i18n'

const fmtARS = (n) => n != null ? `$${Math.round(n).toLocaleString('es-AR')}` : '—'

export default function Ingresos() {
  const navigate = useNavigate()
  const { blue, oficial } = useDolar()
  const { margen } = useSettings()
  const { t } = useI18n()
  const [showImport, setShowImport] = useState(false)

  const [form, setForm] = useState({
    nombre: '', set: '', set_id: null, numero: '', cantidad: 1,
    condicion: 'NM', idioma: 'en', precioVenta: '', finish: 'normal', grade: 'ungraded',
  })
  const [loading,   setLoading]   = useState(false)
  const [toast,     setToast]     = useState({ visible: false, msg: '', tipo: 'success' })

  // Autocomplete
  const [suggestions,   setSuggestions]   = useState([])
  const [sugLoading,    setSugLoading]    = useState(false)
  const [showSug,       setShowSug]       = useState(false)
  const [loadingMore,   setLoadingMore]   = useState(false)
  const [hasMore,       setHasMore]       = useState(false)
  const sugTimer       = useRef(null)
  const sugPageRef     = useRef(1)         // página actual en pokemontcg.io
  const sugTotalRef    = useRef(0)         // totalCount de la query actual
  const sugQueryRef    = useRef('')        // query activa (para "cargar más")
  const sentinelRef    = useRef(null)      // div al final del dropdown → dispara siguiente página
  // Cache de cartas del set seleccionado (para JP/CN — permite filtrar client-side)
  const allSetCardsRef = useRef([])

  // Preview / precios de mercado
  const [preview,     setPreview]     = useState(null)   // { imagen, precio_usd, precio_buy_usd, precio_sell_usd, grade }
  const [previewLoad, setPreviewLoad] = useState(false)

  // PC URL resolver
  const [pcUrl,     setPcUrl]     = useState('')
  const [pcLoading, setPcLoading] = useState(false)

  const handlePcUrl = async (url) => {
    setPcUrl(url)
    if (!url.includes('pricecharting.com/game/')) return
    setPcLoading(true)
    try {
      const result = await scannerApi.resolvePcUrl(url)
      if (!result || result.error) return
      setForm(f => ({
        ...f,
        nombre:  result.name        || f.nombre,
        set:     result.set_name    || f.set,
        set_id:  null,
        numero:  result.card_number || f.numero,
        idioma:  result.lang        || f.idioma,
      }))
      setPreview({
        imagen:          result.image_url      ?? null,
        precio_usd:      result.price_usd      ?? null,
        precio_buy_usd:  result.price_buy_usd  ?? null,
        precio_sell_usd: result.price_sell_usd ?? null,
        precio_source:   'pc',
      })
      if (result.price_usd && blue) {
        const m = margen ?? 0
        const autoARS = Math.round(result.price_usd * blue * (1 + m / 100) / 500) * 500
        setForm(f => ({ ...f, precioVenta: String(autoARS) }))
      }
      setPcUrl('')
    } finally {
      setPcLoading(false)
    }
  }

  const setField = (k, v) => setForm(f => ({ ...f, [k]: v }))

  // ── Normaliza "078/217" → "78", "TG30" → "TG30" ──────────────────────
  const normalizeNum = (raw) => {
    const s    = String(raw).trim()
    const left = s.includes('/') ? s.split('/')[0] : s
    if (/^\d+$/.test(left)) return String(parseInt(left, 10))
    return left
  }

  // ── Normaliza idioma al formato que usa el backend ────────────────────
  const normLang = (idioma) => {
    if (['ja', 'jp', 'japanese'].includes(idioma)) return 'jp'
    if (['zh', 'cn', 'chinese'].includes(idioma))  return 'cn'
    return 'en'
  }

  /**
   * Busca imagen desde el índice local del backend (card_phash.json → R2).
   * Funciona para EN, JP y CN. Es la fuente primaria para cualquier idioma.
   * Si numero es vacío, busca solo por nombre (útil al cambiar idioma JP/CN).
   * @returns {Promise<{url, set_name, number}|null>}
   */
  const fetchImageFromBackend = async (nombre, numero, idioma, setId = '') => {
    if (!nombre) return null
    const lang = normLang(idioma)
    const num  = numero ? normalizeNum(numero) : ''
    return scannerApi.cardImageUrl(nombre, num, lang, { setId })
  }

  // ── Precarga las cartas de un set en background ────────────────────────
  // Se llama inmediatamente al seleccionar el set (no espera al focus del input).
  const preloadSetCards = useCallback(async (setId, idioma) => {
    if (!setId) return
    const lang = normLang(idioma)
    setSugLoading(true)
    try {
      if (lang === 'en') {
        // pokemontcg.io → trae precios. fetchCardsBySet tiene caché interno por setId.
        const cards = await fetchCardsBySet(setId)
        allSetCardsRef.current = cards.map(c => ({
          nombre:     c.name,
          set:        c.set_name,
          set_id:     c.set_id,
          numero:     c.card_number,
          imagen:     c.image_url,
          precio_usd: c.price_usd,
          source:     'market',
        }))
      } else {
        // JP/CN → índice local del scanner (q vacío = todas las cartas del set)
        const res = await scannerApi.buscar('', lang, setId, 200)
        allSetCardsRef.current = (res?.results ?? []).map(c => ({
          nombre:     c.nombre,
          set:        c.set_name,
          set_id:     c.set_code,
          numero:     c.numero,
          imagen:     c.imagen,
          precio_usd: null,
          source:     'phash',
        }))
      }
    } catch (_) {}
    finally { setSugLoading(false) }
  }, [])

  // ── Filtrado local instantáneo sobre las cartas ya precargadas ──────────
  const filterFromCache = useCallback(async (val) => {
    const q = val.trim().toLowerCase()
    const filtered = q
      ? allSetCardsRef.current.filter(c =>
          c.nombre?.toLowerCase().includes(q) ||
          c.numero?.toLowerCase().startsWith(q)
        )
      : allSetCardsRef.current
    const slice = filtered.slice(0, 60)
    setSuggestions(slice)
    setShowSug(slice.length > 0)
    setSugLoading(false)
    // Enriquecer en background sin bloquear el render inicial
    const lang = normLang(form.idioma)
    enrichSuggestionsWithPCPrices(slice, lang).then(enriched => {
      setSuggestions(enriched)
    })
  }, [form.idioma])

  // ── Carga la siguiente página de resultados (infinite scroll) ──────────
  const loadMoreSuggestions = useCallback(async () => {
    if (loadingMore || !hasMore) return
    if (normLang(form.idioma) !== 'en' || !sugQueryRef.current) return
    setLoadingMore(true)
    const nextPage = sugPageRef.current + 1
    try {
      const { results, totalCount } = await searchCardsByName(sugQueryRef.current, 20, nextPage)
      if (!results.length) { setHasMore(false); return }
      const mapped = results.map(c => ({
        nombre:     c.name,
        set:        c.set_name,
        set_id:     null,
        numero:     c.card_number,
        imagen:     c.image_url,
        precio_usd: c.price_usd,
        source:     'market',
      }))
      sugPageRef.current  = nextPage
      sugTotalRef.current = totalCount
      setSuggestions(prev => [...prev, ...mapped])
      setHasMore((nextPage * 20) < totalCount)
    } catch (_) {}
    finally { setLoadingMore(false) }
  }, [loadingMore, hasMore, form.idioma])

  // IntersectionObserver sobre el sentinel al final del dropdown
  useEffect(() => {
    if (!sentinelRef.current || !showSug || !hasMore) return
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) loadMoreSuggestions() },
      { threshold: 0.1 }
    )
    obs.observe(sentinelRef.current)
    return () => obs.disconnect()
  }, [showSug, hasMore, loadingMore, loadMoreSuggestions])

  // ── Autocomplete: busca mientras escribe ───────────────────────────────
  const handleNombreChange = (val) => {
    setField('nombre', val)
    clearTimeout(sugTimer.current)

    // ── Caso A: set precargado → filtro local + búsqueda Supabase para custom ─
    if (allSetCardsRef.current.length > 0) {
      if (!val.trim()) { setSuggestions(allSetCardsRef.current.slice(0, 60)); setShowSug(true); return }

      // Filtrar del caché local
      filterFromCache(val)

      // También buscar en Supabase cartas con nombre custom que el caché no tiene
      if (val.trim().length >= 2) {
        supabase
          .from('cards')
          .select('name, set_name, card_number, image_url, language')
          .ilike('name', `${val.trim()}%`)
          .limit(5)
          .then(({ data }) => {
            if (!data?.length) return
            const cached = new Set(allSetCardsRef.current.map(c => `${c.nombre}|${c.numero}`))
            const extras = data
              .filter(c => !cached.has(`${c.name}|${c.card_number}`))
              .map(c => ({ nombre: c.name, set: c.set_name, set_id: null, numero: c.card_number, imagen: c.image_url, precio_usd: null, source: 'stock' }))
            if (extras.length > 0) {
              setSuggestions(prev => {
                const existingNames = new Set(prev.map(p => `${p.nombre}|${p.numero}`))
                const newExtras = extras.filter(e => !existingNames.has(`${e.nombre}|${e.numero}`))
                return [...newExtras, ...prev]
              })
              setShowSug(true)
            }
          })
      }
      return
    }

    if (!val.trim() || val.length < 2) { setSuggestions([]); setShowSug(false); setHasMore(false); return }
    setSugLoading(true)

    // ── Caso B: sin set, EN → pokemontcg.io (precios incluidos, caché sesión) ──
    // ── Caso C: sin set, JP/CN → scanner backend ──────────────────────────────
    sugTimer.current = setTimeout(async () => {
      try {
        const lang = normLang(form.idioma)

        if (lang === 'en') {
          sugPageRef.current  = 1
          sugQueryRef.current = val.trim()

          // Buscar en Supabase cartas custom (renombradas/agregadas manualmente)
          const { data: supaCards } = await supabase
            .from('cards')
            .select('name, set_name, card_number, image_url, language')
            .ilike('name', `${val.trim()}%`)
            .eq('language', 'en')
            .limit(5)
          const supaMatched = (supaCards ?? []).map(c => ({
            nombre:     c.name,
            set:        c.set_name,
            set_id:     null,
            numero:     c.card_number,
            imagen:     c.image_url,
            precio_usd: null,
            source:     'stock',   // indica que viene de nuestro catálogo
          }))

          const { results, totalCount } = await searchCardsByName(val.trim(), 20, 1)
          const mapped = results.map(c => ({
            nombre:     c.name,
            set:        c.set_name,
            set_id:     null,
            numero:     c.card_number,
            imagen:     c.image_url,
            precio_usd: c.price_usd,
            source:     'market',
          }))

          // Mezclar: cartas de Supabase primero (si no están ya en los resultados de market)
          const marketNames = new Set(mapped.map(c => `${c.nombre}|${c.set}|${c.numero}`))
          const supaExtra = supaMatched.filter(c => !marketNames.has(`${c.nombre}|${c.set}|${c.numero}`))
          const combined = [...supaExtra, ...mapped]

          sugTotalRef.current = totalCount
          // Enriquecer con precios PC (reemplaza precio TCGPlayer si PC tiene precio)
          const enriched = await enrichSuggestionsWithPCPrices(combined, 'en')
          setSuggestions(enriched)
          setHasMore(mapped.length < totalCount)
          setShowSug(enriched.length > 0)
        } else {
          const res = await scannerApi.buscar(val.trim(), lang, '', 20)
          const mapped = (res?.results ?? res?.opciones ?? []).map(c => ({
            nombre:     c.nombre || c.name,
            set:        c.set_name || c.set,
            set_id:     c.set_code || null,
            numero:     c.numero || c.number,
            imagen:     c.imagen || c.image_url,
            precio_usd: null,
            source:     'phash',
          }))
          const enriched = await enrichSuggestionsWithPCPrices(mapped, lang)
          setSuggestions(enriched)
          setShowSug(enriched.length > 0)
        }
      } catch (_) {}
      finally { setSugLoading(false) }
    }, 150)  // 150 ms (antes 300 ms)
  }

  // ── Focus en nombre → mostrar cartas del set si ya están precargadas ───
  const handleNombreFocus = () => {
    if (!form.set_id) return
    if (allSetCardsRef.current.length > 0) {
      // Ya precargado → mostrar inmediatamente sin ningún fetch
      filterFromCache(form.nombre)
      return
    }
    // Todavía en vuelo (preloadSetCards ya corriendo en background) → esperar
  }

  // ── Seleccionar sugerencia ─────────────────────────────────────────────
  const selectSuggestion = useCallback(async (sug) => {
    setForm(f => ({
      ...f,
      nombre:  sug.nombre  || '',
      set:     sug.set     || '',
      set_id:  sug.set_id  ?? f.set_id,
      numero:  sug.numero  || '',
    }))
    setShowSug(false)
    setSuggestions([])
    setPreview({ imagen: sug.imagen, precio_usd: sug.precio_usd ?? null, precio_source: sug.source_price === 'pc' ? 'pc' : sug.source === 'market' ? 'tcgplayer' : null })

    // 1. Buscar precio de PriceCharting primero (fuente principal)
    const idioma = sug.idioma || form.idioma || 'en'
    const normLangLocal = (l) => ['ja','jp'].includes(l) ? 'jp' : ['zh','cn'].includes(l) ? 'cn' : 'en'
    const cardResult = await fetchCardId(sug.nombre, sug.numero, normLangLocal(idioma), sug.set)
    let precioBase = sug.precio_usd ?? null

    if (cardResult) {
      const pcResult = await fetchPrecioPC(cardResult.id, form.finish, form.grade)
      if (pcResult?.price_usd) {
        precioBase = pcResult.price_usd
        setPreview(prev => ({
          ...prev,
          precio_buy_usd:  pcResult.price_buy_usd  ?? null,
          precio_sell_usd: pcResult.price_sell_usd ?? null,
          precio_source:   'pc',
          grade:           form.grade,
        }))
      }
    }
    // Precio base nunca puede ser 0 o negativo
    if (precioBase && precioBase <= 0) precioBase = null

    if (precioBase && blue) {
      const m = margen ?? 0
      const baseARS   = precioBase * blue
      const conMargen = baseARS * (1 + m / 100)
      const autoARS   = Math.round(Math.max(conMargen, baseARS) / 500) * 500
      setForm(f => ({ ...f, precioVenta: String(autoARS) || f.precioVenta }))
    }

    setPreview(prev => ({ ...prev, precio_usd: precioBase }))

    // 2. Si falta imagen → buscar en scanner/pokemontcg.io
    if (!sug.imagen) fetchPreviewImage(sug.nombre, sug.numero, sug.set)
  }, [blue, margen, form.idioma])

  // ── Preview: busca imagen Y precio si faltan ──────────────────────────
  // fetchCardImages retorna { small, large, price_usd } — los tres se aprovechan.
  const fetchPreviewImage = async (nombre, numero, setName) => {
    if (!nombre) return
    setPreviewLoad(true)
    const imgs = await fetchCardImages(nombre, numero, setName)
    if (imgs) {
      setPreview(prev => ({
        ...prev,
        imagen:     imgs.large || imgs.small || prev?.imagen,
        precio_usd: imgs.price_usd ?? prev?.precio_usd,
      }))
    }
    setPreviewLoad(false)
  }

  // Cuando el usuario escribe un número: busca la carta exacta
  const numTimer = useRef(null)
  const handleNumeroChange = (val) => {
    setField('numero', val)
    clearTimeout(numTimer.current)
    if (!val.trim()) return

    numTimer.current = setTimeout(async () => {
      const numNorm = normalizeNum(val.trim())

      setSugLoading(true)
      try {
        // 1. Buscar en índice local del backend (cubre EN, JP, CN desde R2)
        if (form.nombre) {
          const res = await fetchImageFromBackend(form.nombre, numNorm, form.idioma, form.set_id || '')
          if (res?.url) {
            setPreview(prev => ({ ...prev, imagen: res.url }))
            // Si el backend devuelve set_name y número, actualizamos el form
            if (res.set_name || res.number) {
              setForm(f => ({
                ...f,
                set:    res.set_name || f.set,
                numero: res.number   || f.numero,
              }))
            }
            // Buscar precio PC para este resultado
            const lang = normLang(form.idioma)
            const cidResult = await fetchCardId(form.nombre, res.number || numNorm, lang, res.set_name || form.set)
            if (cidResult) {
              if (cidResult.set_name) setForm(f => ({ ...f, set: cidResult.set_name || f.set }))
              const pcResult = await fetchPrecioPC(cidResult.id, form.finish, form.grade)
              if (pcResult?.price_usd) {
                const m = margen ?? 0
                setPreview(prev => ({ ...prev, precio_usd: pcResult.price_usd, precio_buy_usd: pcResult.price_buy_usd ?? null, precio_sell_usd: pcResult.price_sell_usd ?? null, precio_source: 'pc', grade: form.grade }))
                setForm(f => ({ ...f, precioVenta: String(Math.round(pcResult.price_usd * blue * (1 + m / 100) / 500) * 500) || f.precioVenta }))
              }
            }
            setSugLoading(false)
            return
          }
        }

        // 2. Inglés con set: intentar pokemontcg.io API (trae nombre+precio)
        if (form.set_id && normLang(form.idioma) === 'en') {
          const card = await fetchCardBySetAndNumber(form.set_id, val.trim())
          if (card) {
            selectSuggestion({
              nombre:     card.name,
              set:        card.set_name,
              set_id:     card.set_id,
              numero:     card.card_number,
              imagen:     card.image_url,
              precio_usd: card.price_usd,
              idioma:     form.idioma,
              source:     'market',
            })
            return
          }
        }

        // 3. Si hay nombre: buscar card_id y precio PriceCharting
        if (form.nombre) {
          const lang = normLang(form.idioma)
          const cidResult = await fetchCardId(form.nombre, numNorm, lang, form.set)
          if (cidResult) {
            if (cidResult.set_name) setForm(f => ({ ...f, set: cidResult.set_name || f.set }))
            const pcResult = await fetchPrecioPC(cidResult.id, form.finish, form.grade)
            if (pcResult?.price_usd) {
              const m = margen ?? 0
              const autoPrice = String(Math.round(pcResult.price_usd * blue * (1 + m / 100) / 500) * 500)
              setPreview(prev => ({ ...prev, precio_usd: pcResult.price_usd, precio_buy_usd: pcResult.price_buy_usd ?? null, precio_sell_usd: pcResult.price_sell_usd ?? null, precio_source: 'pc', grade: form.grade }))
              setForm(f => ({ ...f, precioVenta: autoPrice || f.precioVenta }))
              setSugLoading(false)
              return
            }
          }
          fetchPreviewImage(form.nombre, numNorm, form.set)
        }
      } finally {
        setSugLoading(false)
      }
    }, 400)
  }

  // ── Al cambiar idioma → limpiar sugerencias y re-buscar con el nuevo idioma ──
  const prevIdiomaRef = useRef(form.idioma)
  useEffect(() => {
    const prev = prevIdiomaRef.current
    prevIdiomaRef.current = form.idioma
    if (form.idioma === prev) return

    // Siempre limpiar sugerencias y caché de set al cambiar idioma
    setSuggestions([])
    setShowSug(false)
    allSetCardsRef.current = []

    // Si hay nombre escrito, re-disparar búsqueda con nuevo idioma
    if (form.nombre && form.nombre.length >= 2) {
      handleNombreChange(form.nombre)
    }

    if (!form.nombre) return

    const lang = normLang(form.idioma)

    // Para todos los idiomas: buscar primero en nuestro índice R2
    // (tenemos EN + JP + CN descargados). Fallback a pokemontcg.io solo para EN.
    fetchImageFromBackend(form.nombre, lang === 'en' ? form.numero : '', form.idioma)
      .then(res => {
        if (res?.url) {
          setPreview(prev => ({ ...prev, imagen: res.url }))
          setForm(f => ({
            ...f,
            set:    res.set_name || f.set,
            numero: res.number   || (lang === 'en' ? f.numero : ''),
            set_id: lang === 'en' ? f.set_id : null,
          }))
          return
        }
        // Sin resultado en R2 → fallback a pokemontcg.io (solo EN tiene precios)
        if (lang === 'en') {
          fetchPreviewImage(form.nombre, form.numero, form.set)
        }
      })
  }, [form.idioma]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Cerrar dropdown al hacer click afuera ──────────────────────────────
  const wrapRef = useRef(null)
  useEffect(() => {
    const handler = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setShowSug(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // ── Precios calculados ──────────────────────────────────────────────────
  const usd          = preview?.precio_usd      ?? null
  const usdBuy       = preview?.precio_buy_usd  ?? null
  const usdSell      = preview?.precio_sell_usd ?? null
  const arsOfic      = usd != null && oficial ? usd * oficial : null
  const arsBlue      = usd != null && blue    ? usd * blue    : null
  const GRADE_LABELS = { ungraded: 'Sin graduar', psa9: 'PSA 9', psa10: 'PSA 10', bgs10: 'BGS 10' }

  // ── Submit: escribe directo en Supabase ────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.nombre.trim()) return
    setLoading(true)
    try {
      const precioUsd   = usd ?? null
      const cantidad    = parseInt(form.cantidad) || 1
      // Si el usuario no puso precio manual, calcular desde precio de mercado
      const precioVenta = parseFloat(form.precioVenta) ||
        (precioUsd && blue ? Math.round(precioUsd * blue * (1 + (margen ?? 0) / 100) / 500) * 500 : null)

      // 1. Buscar o crear la carta en `cards`
      let cardId = null
      // Buscar carta existente (cards es tabla global, sin store_id)
      const langFinal = normLang(form.idioma) || 'en'

      // Buscar carta existente filtrando también por idioma
      let cardQuery = supabase
        .from('cards')
        .select('id')
        .ilike('name', form.nombre.trim())
        .eq('language', langFinal)

      if (form.set.trim())    cardQuery = cardQuery.eq('set_name', form.set.trim())
      if (form.numero.trim()) cardQuery = cardQuery.eq('card_number', form.numero.trim())

      const { data: existing } = await cardQuery.maybeSingle()

      if (existing?.id) {
        cardId = existing.id
        // Actualizar imagen si tenemos una nueva
        if (preview?.imagen) {
          await supabase.from('cards').update({ image_url: preview.imagen }).eq('id', cardId)
        }
      } else {
        // Insertar nueva carta con idioma del formulario (siempre form.idioma, nunca default EN)
        const { data: newCard, error: cardErr } = await supabase
          .from('cards')
          .insert({
            name:        form.nombre.trim(),
            set_name:    form.set.trim()    || null,
            card_number: form.numero.trim() || null,
            language:    langFinal,
            image_url:   preview?.imagen    || null,
          })
          .select('id')
          .single()
        if (cardErr) throw cardErr
        cardId = newCard.id
      }

      const isHolo    = form.finish === 'holofoil' || form.finish === 'reverse'
      const isReverse = form.finish === 'reverse'

      // 2. Upsert en inventory: si ya existe la carta con misma condición y finish, suma el quantity
      const { data: existingInv } = await supabase
        .from('inventory')
        .select('id, quantity')
        .eq('store_id', STORE_ID)
        .eq('card_id',  cardId)
        .eq('condition', form.condicion)
        .eq('status', 'disponible')
        .maybeSingle()

      if (existingInv) {
        const { error: invErr } = await supabase
          .from('inventory')
          .update({
            quantity:          (existingInv.quantity || 1) + cantidad,
            price_usd:         precioUsd,
            price_ars_oficial: arsOfic   ?? null,
            price_ars_blue:    arsBlue   ?? null,
            sale_price_ars:    form.precioVenta ? parseFloat(form.precioVenta) : null,
            grade:             form.grade || 'ungraded',
          })
          .eq('id', existingInv.id)
        if (invErr) throw invErr
      } else {
        const { error: invErr } = await supabase
          .from('inventory')
          .insert({
            store_id:          STORE_ID,
            card_id:           cardId,
            quantity:          cantidad,
            condicion:         form.condicion,
            condition:         form.condicion,
            status:            'disponible',
            estado:            'disponible',
            price_usd:         precioUsd,
            price_ars_oficial: arsOfic   ?? null,
            price_ars_blue:    arsBlue   ?? null,
            sale_price_ars:    form.precioVenta ? parseFloat(form.precioVenta) : null,
            scan_date:         new Date().toISOString(),
            finish:            form.finish || 'normal',
            holo:              isHolo,
            grade:             form.grade || 'ungraded',
          })
        if (invErr) throw invErr
      }

      showToast(`✅ ${cantidad > 1 ? `${cantidad} ${t('ingresos_added_many')}` : t('ingresos_added_one')} al stock`)
      setForm({ nombre: '', set: '', set_id: null, numero: '', cantidad: 1, condicion: 'NM', idioma: 'en', precioVenta: '', finish: 'normal', grade: 'ungraded' })
      setPreview(null)
    } catch (err) {
      console.error('Error al guardar carta:', err)
      showToast(err?.message || 'Error al guardar la carta', 'error')
    } finally {
      setLoading(false)
    }
  }

  const showToast = (msg, tipo = 'success') => {
    setToast({ visible: true, msg, tipo })
    setTimeout(() => setToast(prev => ({ ...prev, visible: false })), 2500)
  }

  const inputCls = "w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
  const labelCls = "text-xs text-gray-500 font-medium mb-1 block"

  return (
    <div className="max-w-4xl">
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="flex flex-col lg:flex-row">

          {/* ── Formulario (izq) ────────────────────────────────────────── */}
          <div className="flex-1 p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-semibold text-gray-800">{t('ingresos_form_title')}</h3>
              <button
                onClick={() => setShowImport(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 hover:bg-gray-200
                           text-gray-600 text-xs font-semibold rounded-xl transition"
              >
                📥 {t('ingresos_import_csv')}
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">

              {/* URL de PriceCharting — auto-fill rápido */}
              <div>
                <label className={labelCls}>URL de PriceCharting <span className="text-gray-400 font-normal">(pegá el link y se completa solo)</span></label>
                <div className="relative">
                  <input
                    value={pcUrl}
                    onChange={e => handlePcUrl(e.target.value)}
                    placeholder="https://www.pricecharting.com/game/pokemon-.../..."
                    className={`${inputCls} pr-8 text-xs`}
                  />
                  {pcLoading && (
                    <div className="absolute right-3 top-2.5">
                      <div className="w-4 h-4 border-2 border-blue-300 border-t-transparent rounded-full animate-spin" />
                    </div>
                  )}
                </div>
              </div>

              {/* Nombre con autocomplete */}
              <div ref={wrapRef} className="relative">
                <label className={labelCls}>{t('ingresos_card_name')}</label>
                <input
                  value={form.nombre}
                  onChange={e => handleNombreChange(e.target.value)}
                  onFocus={handleNombreFocus}
                  placeholder={form.set_id ? t('ingresos_search_set') : t('ingresos_search_card')}
                  autoComplete="off"
                  className={inputCls}
                />
                {/* Spinner búsqueda */}
                {sugLoading && (
                  <div className="absolute right-3 top-8">
                    <div className="w-4 h-4 border-2 border-blue-300 border-t-transparent rounded-full animate-spin" />
                  </div>
                )}
                {/* Dropdown sugerencias */}
                {showSug && suggestions.length > 0 && (
                  <div className="absolute z-30 top-full left-0 right-0 mt-1
                                  bg-white border border-gray-200 rounded-2xl shadow-xl
                                  max-h-72 overflow-y-auto">
                    {suggestions.map((sug, i) => (
                      <button key={`${sug.nombre}|${sug.set}|${sug.numero}|${i}`} type="button"
                        onMouseDown={() => selectSuggestion(sug)}
                        className="w-full flex items-center gap-3 px-4 py-2.5
                                   hover:bg-blue-50 text-left border-b border-gray-100
                                   last:border-0 transition">
                        {sug.imagen
                          ? <img src={sug.imagen} alt="" className="w-7 h-10 object-cover rounded shrink-0" />
                          : <div className="w-7 h-10 bg-gray-100 rounded shrink-0 flex items-center justify-center text-gray-300 text-xs">?</div>
                        }
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-800 truncate">{sug.nombre}</p>
                          <p className="text-xs text-gray-400 truncate">
                            {sug.set}{sug.numero ? ` · #${sug.numero}` : ''}
                          </p>
                        </div>
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          {sug.precio_usd && (
                            <span className="text-xs font-bold text-emerald-600">
                              ${Number(sug.precio_usd).toFixed(2)}
                            </span>
                          )}
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium
                            ${sug.source_price === 'pc'
                              ? 'bg-emerald-100 text-emerald-700'
                              : sug.source === 'market'
                                ? 'bg-blue-100 text-blue-600'
                                : 'bg-gray-100 text-gray-500'}`}>
                            {sug.source_price === 'pc' ? 'PC' : sug.source === 'market' ? t('ingresos_source_market') : t('ingresos_source_stock')}
                          </span>
                        </div>
                      </button>
                    ))}

                    {/* Sentinel de infinite scroll — cuando aparece en pantalla carga +20 */}
                    {hasMore && (
                      <div ref={sentinelRef} className="flex items-center justify-center py-3 border-t border-gray-100">
                        {loadingMore
                          ? <div className="w-4 h-4 border-2 border-blue-300 border-t-transparent rounded-full animate-spin" />
                          : <span className="text-[11px] text-gray-400">↓ más resultados</span>
                        }
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Set + Número */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>{t('ingresos_set_edition')}</label>
                  <SetSelect
                    value={form.set}
                    setId={form.set_id}
                    lang={form.idioma}
                    onChange={({ set_name, set_id }) => {
                      setForm(f => ({ ...f, set: set_name, set_id, numero: '', nombre: '' }))
                      setSuggestions([])
                      setShowSug(false)
                      setPreview(null)
                      allSetCardsRef.current = []
                      // ▶ Precarga las cartas del set EN BACKGROUND inmediatamente.
                      // Cuando el usuario haga foco en el nombre, ya estarán listas.
                      if (set_id) preloadSetCards(set_id, form.idioma)
                    }}
                    className="w-full"
                  />
                </div>
                <div>
                  <label className={labelCls}>{t('ingresos_card_number')}</label>
                  <input
                    value={form.numero}
                    onChange={e => handleNumeroChange(e.target.value)}
                    placeholder={form.set_id ? '1, TG30…' : t('ingresos_card_number_ph')}
                    disabled={!form.set_id && !form.nombre}
                    className={`${inputCls} disabled:opacity-50`}
                  />
                </div>
              </div>

              {/* Cantidad + Condición + Idioma */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className={labelCls}>{t('ingresos_quantity')}</label>
                  <input type="number" min="1" value={form.cantidad}
                    onChange={e => setField('cantidad', e.target.value)}
                    className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>{t('ingresos_condition')}</label>
                  <select value={form.condicion} onChange={e => setField('condicion', e.target.value)}
                    className={`${inputCls} bg-white`}>
                    {CONDICIONES.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Tipo</label>
                  <FinishSelect
                    value={form.finish}
                    onChange={v => setField('finish', v)}
                    className="w-full"
                  />
                </div>
                <div className="col-span-3">
                  <label className={labelCls}>Grado</label>
                  <div className="flex gap-2">
                    {[
                      { value: 'ungraded', label: 'Sin graduar' },
                      { value: 'psa9',     label: 'PSA 9' },
                      { value: 'psa10',    label: 'PSA 10' },
                      { value: 'bgs10',    label: 'BGS 10' },
                    ].map(g => (
                      <button
                        key={g.value}
                        type="button"
                        onClick={async () => {
                          setForm(f => ({ ...f, grade: g.value }))
                          // Re-fetch precio para el nuevo grado
                          if (preview?.precio_usd !== undefined) {
                            const cardResult = await fetchCardId(form.nombre, form.numero, normLang(form.idioma), form.set)
                            if (cardResult) {
                              const pcResult = await fetchPrecioPC(cardResult.id, form.finish, g.value)
                              if (pcResult?.price_usd) {
                                const m = margen ?? 0
                                setPreview(prev => ({ ...prev, precio_usd: pcResult.price_usd, precio_buy_usd: pcResult.price_buy_usd ?? null, precio_sell_usd: pcResult.price_sell_usd ?? null, grade: g.value }))
                                setForm(f => ({ ...f, precioVenta: String(Math.round(pcResult.price_usd * blue * (1 + m / 100) / 500) * 500) }))
                              } else {
                                setPreview(prev => ({ ...prev, precio_usd: null, precio_buy_usd: null, precio_sell_usd: null, grade: g.value }))
                              }
                            }
                          }
                        }}
                        className={`flex-1 py-1.5 text-xs font-semibold rounded-xl border transition
                          ${form.grade === g.value
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'bg-white text-gray-600 border-gray-200 hover:bg-blue-50'}`}
                      >
                        {g.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className={labelCls}>{t('ingresos_language')}</label>
                  <select value={form.idioma}
                    onChange={e => {
                      const newIdioma = e.target.value
                      setField('idioma', newIdioma)
                      allSetCardsRef.current = []
                      setSuggestions([])
                      // Recargar cartas del set con el nuevo idioma
                      if (form.set_id) preloadSetCards(form.set_id, newIdioma)
                    }}
                    className={`${inputCls} bg-white`}>
                    {IDIOMAS.map(i => <option key={i.code} value={i.code}>{i.flag} {i.label}</option>)}
                  </select>
                </div>
              </div>

              {/* Precios de mercado (read-only) */}
              <div className="bg-gray-50 rounded-2xl p-4 space-y-2">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide">
                      {t('ingresos_market_price')}
                    </p>
                    {usd != null && (
                      preview?.precio_source === 'pc'
                        ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700 border border-emerald-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
                            PriceCharting · {GRADE_LABELS[form.grade] ?? form.grade}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-600 border border-blue-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-400 inline-block" />
                            TCGPlayer
                          </span>
                        )
                    )}
                  </div>
                  {form.nombre && (
                    <button
                      type="button"
                      onClick={() => fetchPreviewImage(form.nombre, form.numero, form.set)}
                      disabled={previewLoad}
                      title="Actualizar precio"
                      className="flex items-center gap-1 text-[10px] text-blue-500 hover:text-blue-700
                                 bg-blue-50 hover:bg-blue-100 px-2 py-1 rounded-lg transition disabled:opacity-40"
                    >
                      {previewLoad ? '⏳' : '🔄'} Actualizar
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: 'USD',        value: usd     != null ? `$${Number(usd).toFixed(2)}` : '—', color: 'text-emerald-600' },
                    { label: 'ARS Oficial',value: fmtARS(arsOfic),                                       color: 'text-gray-700'   },
                    { label: 'ARS Blue',   value: fmtARS(arsBlue),                                       color: 'text-blue-600'   },
                  ].map(p => (
                    <div key={p.label} className="bg-white rounded-xl p-3 border border-gray-200 text-center">
                      <p className="text-[10px] text-gray-400 mb-1">{p.label}</p>
                      <p className={`text-sm font-bold ${p.color}`}>{p.value}</p>
                    </div>
                  ))}
                </div>
                {/* Buy/Sell refs — solo disponibles para ungraded */}
                {form.grade === 'ungraded' && (usdBuy || usdSell) && (
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    {usdBuy && (
                      <div className="bg-white rounded-xl p-2 border border-gray-200 text-center">
                        <p className="text-[10px] text-gray-400 mb-0.5">Buy ref</p>
                        <p className="text-xs font-bold text-orange-500">${Number(usdBuy).toFixed(2)}</p>
                      </div>
                    )}
                    {usdSell && (
                      <div className="bg-white rounded-xl p-2 border border-gray-200 text-center">
                        <p className="text-[10px] text-gray-400 mb-0.5">Sell ref</p>
                        <p className="text-xs font-bold text-teal-600">${Number(usdSell).toFixed(2)}</p>
                      </div>
                    )}
                  </div>
                )}
                {usd == null && (
                  <p className="text-[11px] text-gray-400 text-center pt-1">
                    {t('ingresos_autocomplete_hint')}
                  </p>
                )}
              </div>

              {/* Precio venta */}
              <div>
                <label className={labelCls}>{t('ingresos_sale_price')}</label>
                <input type="number" step="0.01" min="0"
                  value={form.precioVenta}
                  onChange={e => setField('precioVenta', e.target.value)}
                  placeholder={usd != null ? `${t('ingresos_suggested')}: ${fmtARS(arsBlue)}` : 'Ej: 14000'}
                  className={inputCls}
                />
              </div>

              {/* Tip scanner */}
              <p className="text-xs text-gray-400 bg-blue-50 rounded-xl px-4 py-3">
                {t('ingresos_scanner_tip_pre')}{' '}
                <Link to="/scanner" className="text-blue-600 font-semibold hover:underline">
                  {t('ingresos_scanner_tip_link')}
                </Link>
                {' '}{t('ingresos_scanner_tip_post')}
              </p>

              <button type="submit" disabled={loading || !form.nombre.trim()}
                className="w-full py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-50
                           text-white font-bold rounded-xl transition flex items-center justify-center gap-2">
                {loading ? <Spinner size={18} /> : t('ingresos_add_to_stock')}
              </button>
            </form>
          </div>

          {/* ── Panel preview (der) ──────────────────────────────────────── */}
          <div className="lg:w-64 border-t lg:border-t-0 lg:border-l border-gray-100
                          bg-gray-50 flex flex-col items-center justify-center p-6 gap-4">
            {previewLoad ? (
              <div className="flex flex-col items-center gap-3 text-gray-400">
                <div className="w-8 h-8 border-2 border-blue-300 border-t-transparent rounded-full animate-spin" />
                <p className="text-xs">{t('ingresos_image_searching')}</p>
              </div>
            ) : preview?.imagen ? (
              <>
                <div className="relative">
                  <img
                    src={preview.imagen}
                    alt={form.nombre}
                    className="w-40 rounded-2xl shadow-xl object-contain"
                    draggable={false}
                  />
                  {/* Badge verificado */}
                  <div className="absolute -top-2 -right-2 bg-emerald-500 text-white
                                  text-[10px] font-bold px-2 py-0.5 rounded-full shadow">
                    ✓
                  </div>
                </div>
                <div className="text-center">
                  <p className="text-sm font-semibold text-gray-800 leading-tight">{form.nombre}</p>
                  {form.set && <p className="text-xs text-gray-400 mt-0.5">{form.set}</p>}
                  {form.numero && <p className="text-xs text-gray-400">#{form.numero}</p>}
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center gap-3 text-center">
                <div className="w-40 h-56 bg-white border-2 border-dashed border-gray-200
                                rounded-2xl flex items-center justify-center">
                  <div className="text-center">
                    <img src="https://images.pokemontcg.io/back.png" alt=""
                      className="w-12 h-auto object-contain opacity-30 mx-auto mb-2" />
                    <p className="text-xs text-gray-300">{t('ingresos_image_placeholder')}</p>
                  </div>
                </div>
              </div>
            )}
          </div>

        </div>
      </div>

      <Toast mensaje={toast.msg} tipo={toast.tipo} visible={toast.visible} />

      {showImport && (
        <ImportarCartasModal
          onClose={() => setShowImport(false)}
          onDone={() => navigate('/stock')}
        />
      )}
    </div>
  )
}
