import { useState, useEffect, useRef, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { scannerApi } from '../lib/scanner'
import {
  fetchCardImages,
  fetchCardsBySet,
  fetchCardBySetAndNumber,
  searchCardsByName,
} from '../lib/pokemonTcg'
import { supabase } from '../lib/supabase'
import { searchCatalogByName } from '../lib/catalogSearch'
import { setsForLang } from '../lib/setLangMap'
import { searchSealedByName, searchSealedBySet, upsertSealedFromUrl, sealedLabel } from '../lib/sealedSearch'
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
  const { data } = await supabase
    .from('price_history')
    .select('price_usd, price_buy_usd, price_sell_usd, snapshot_date, finish')
    .eq('card_id', cardId)
    .eq('source', 'pricecharting')
    .eq('grade', grade)
    .order('snapshot_date', { ascending: false })
    .limit(10)
  if (!data?.length) return null
  // Preferir finish exacto; solo caer a 'normal' si el finish pedido ES normal
  const exact   = data.find(r => r.finish === finish)
  const fallback = finish === 'normal' ? data[0] : null
  const row = exact ?? fallback
  if (!row) return null
  return {
    price_usd:      row.price_usd      ?? null,
    price_buy_usd:  row.price_buy_usd  ?? null,
    price_sell_usd: row.price_sell_usd ?? null,
  }
}

// ── Precio con fallback: price_history → PC en vivo ──────────────────────────
// Usar siempre este helper en lugar de fetchPrecioPC directo.
async function fetchPrecioConFallback(cardId, nombre, numero, idioma, finish = 'normal', grade = 'ungraded', wantImage = false) {
  // 1. Intentar cache local (no trae imagen)
  if (cardId && !wantImage) {
    const cached = await fetchPrecioPC(cardId, finish, grade)
    if (cached?.price_usd) return cached
  }
  // 2. Consulta en vivo a PriceCharting (trae precio + imagen de la variante si wantImage)
  if (!nombre) return null
  const langNorm = ['ja','jp'].includes(idioma) ? 'jp' : ['zh','cn'].includes(idioma) ? 'cn' : 'en'
  const numNorm  = numero ? String(numero).split('/')[0].replace(/^0+/, '') : ''
  const live = await scannerApi.cardPrice(nombre, numNorm, langNorm, finish, grade, wantImage)
  if (live?.price_usd) return { price_usd: live.price_usd, price_buy_usd: live.price_buy_usd ?? null, price_sell_usd: live.price_sell_usd ?? null, image_url: live.image_url ?? null }
  if (live?.image_url) return { price_usd: null, image_url: live.image_url }
  return null
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
async function fetchCardId(nombre, numero, idioma, setName, finish = 'normal') {
  if (!nombre) return null
  const numNorm  = normalizeCardNum(numero)
  const finishQ  = finish || 'normal'
  let q = supabase.from('cards').select('id, set_name, language, image_url')
    .ilike('name', nombre.trim())
    .eq('language', idioma || 'en')
    .eq('finish', finishQ)
  if (numNorm) q = q.eq('card_number', numNorm)
  if (setName) q = q.eq('set_name', setName.trim())
  let { data } = await q.limit(1).maybeSingle()
  // Fallback: si no matchea con número normalizado, probar con el raw
  if (!data && numero && numNorm !== numero.trim()) {
    let q2 = supabase.from('cards').select('id, set_name, language, image_url')
      .ilike('name', nombre.trim())
      .eq('language', idioma || 'en')
      .eq('finish', finishQ)
      .eq('card_number', numero.trim())
    if (setName) q2 = q2.eq('set_name', setName.trim())
    const { data: d2 } = await q2.limit(1).maybeSingle()
    data = d2
  }
  return data ? { id: data.id, set_name: data.set_name, image_url: data.image_url ?? null } : null
}

// Busca la carta equivalente en otro idioma, SCOPEADA a los sets correspondientes.
// Es direction-agnóstica: targetSets viene de setsForLang() (EN↔JP↔CN, "varios JP = 1 EN").
// El puente cross-idioma es name_en → evita matchear otra carta del mismo pokémon de
// otro set/época (ej. Dragonair Delta → no agarrar Mega Dream Ex de 2024).
async function findEquivalentCard(bridgeEnName, targetSets, targetLang, finish = 'normal') {
  if (!bridgeEnName || !targetSets?.length) return null
  const base = bridgeEnName.replace(/[δΔ]/g, '').replace(/\b(ex|gx|v|vmax|vstar|tag team)\b/gi, '').replace(/\s+/g, ' ').trim()
  if (!base) return null
  const sel = 'id, name, name_en, set_name, card_number, image_url, finish'
  const full = bridgeEnName.replace(/[%_]/g, '').trim()   // nombre completo (ej. "Charizard ex")
  const b = base.replace(/[%_]/g, '')                      // base pokémon (ej. "Charizard")
  const q = () => supabase.from('cards').select(sel)
    .eq('language', targetLang).in('set_name', targetSets)
  // Prioridad: 1) name_en exacto al nombre completo  2) exacto a la base
  //            3) substring de la base. Y dentro, preferir el finish pedido.
  for (const filt of [
    (r) => r.ilike('name_en', full),
    (r) => r.ilike('name_en', b),
    (r) => r.or(`name_en.ilike.*${b}*,name.ilike.*${b}*`),
  ]) {
    let { data } = await filt(q()).eq('finish', finish || 'normal').limit(1).maybeSingle()
    if (data) return data
    const r2 = await filt(q()).limit(1).maybeSingle()
    if (r2.data) return r2.data
  }
  return null
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
  const qc = useQueryClient()
  const { blue, oficial } = useDolar()
  const { margen } = useSettings()
  const { t } = useI18n()
  const [showImport, setShowImport] = useState(false)
  // Tab activo del ingreso: 'carta' | 'links' | 'sellado'. LINKS y CARTA son
  // ambos ingreso de carta (tipo='carta'); LINKS solo cambia el modo de entrada.
  const [tab, setTab] = useState('carta')
  // Progressive disclosure: true cuando ya se matcheó/eligió una carta.
  // Bloquea idioma/nombre/set/número y habilita cantidad/condición/tipo/grado/precios.
  const [cardSelected, setCardSelected] = useState(false)
  // Error del tab LINKS (link no-PC / sin match / timeout) — inline bajo la URL.
  const [linkError, setLinkError] = useState(null)
  // Tab NÚMERO: la carta se identifica por idioma + set + número (nombre = resultado).
  const numMode = tab === 'numero'

  const [form, setForm] = useState({
    nombre: '', set: '', set_id: null, numero: '', cantidad: 1,
    condicion: 'NM', idioma: 'en', precioVenta: '', finish: 'normal', grade: 'ungraded',
    tipo: 'carta', sealedId: null, product_type: null,   // tipo 'carta' | 'sellado'
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
  const [preview,          setPreview]          = useState(null)
  const [previewLoad,      setPreviewLoad]      = useState(false)
  const [selectedCardId,   setSelectedCardId]   = useState(null)   // card_id resuelto de la carta seleccionada

  // PC URL resolver
  const [pcUrl,     setPcUrl]     = useState('')
  const [pcLoading, setPcLoading] = useState(false)

  const handlePcUrl = async (url) => {
    setPcUrl(url)
    const inLinks = tab === 'links'
    if (inLinks) setLinkError(null)
    const u = (url || '').trim()
    if (!u) return
    // Dominio incorrecto → error inline (solo en LINKS)
    if (!u.includes('pricecharting.com')) {
      if (inLinks) setLinkError({ msg: 'El link debe ser de pricecharting.com' })
      return
    }
    if (!u.includes('pricecharting.com/game/')) return   // link parcial, esperar
    setPcLoading(true)
    try {
      // Timeout de 10s para no colgar la UI si PC no responde
      const result = await Promise.race([
        scannerApi.resolvePcUrl(u),
        new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 10000)),
      ])
      if (!result || result.error) {
        if (inLinks) setLinkError({ msg: 'No pudimos encontrar esta carta en nuestra base. Cargala manualmente desde el tab CARTA.', cta: true })
        return
      }

      // ── SELLADO: el link es de un producto (ETB/Box/Bundle…) → resolver/crear ──
      if (form.tipo === 'sellado') {
        const sp = await upsertSealedFromUrl(url, result)
        if (sp) {
          setForm(f => ({ ...f, nombre: sp.name, set: sp.set_name || '', set_id: null,
                          sealedId: sp.id, product_type: sp.product_type }))
          setCardSelected(true)
          setPreview({ imagen: sp.image_url || result.image_url || null,
                       precio_usd: result.price_usd ?? null,
                       precio_buy_usd: result.price_buy_usd ?? null,
                       precio_sell_usd: result.price_sell_usd ?? null, precio_source: 'pc' })
          if (result.price_usd && blue) {
            const m = margen ?? 0
            setForm(f => ({ ...f, precioVenta: String(Math.round(result.price_usd * blue * (1 + m / 100) / 500) * 500) }))
          }
        }
        setPcUrl('')
        return
      }

      const langRaw = result.lang || 'en'
      // Mapear jp→ja y cn→zh para que coincida con los códigos del selector IDIOMAS
      const langForm = langRaw === 'jp' ? 'ja' : langRaw === 'cn' ? 'zh' : langRaw
      setForm(f => ({
        ...f,
        nombre:  result.name        || f.nombre,
        set:     result.set_name    || f.set,
        set_id:  null,
        numero:  result.card_number || f.numero,
        idioma:  langForm,
      }))
      setCardSelected(true)
      setPreview({
        imagen:          result.image_url      ?? null,
        precio_usd:      result.price_usd      ?? null,
        precio_buy_usd:  result.price_buy_usd  ?? null,
        precio_sell_usd: result.price_sell_usd ?? null,
        precio_source:   'pc',
      })
      // Si PC no devolvió imagen, buscar por fallback según idioma
      if (!result.image_url && result.name) {
        fetchPreviewImageByLang(result.name, result.card_number || '', langForm, null)
      }
      if (result.price_usd && blue) {
        const m = margen ?? 0
        const autoARS = Math.round(result.price_usd * blue * (1 + m / 100) / 500) * 500
        setForm(f => ({ ...f, precioVenta: String(autoARS) }))
      }
      setPcUrl('')
    } catch (e) {
      // Timeout u otro fallo de red → error inline (solo en LINKS)
      if (tab === 'links') setLinkError({ msg: 'No respondió PriceCharting. Reintentá.' })
    } finally {
      setPcLoading(false)
    }
  }

  /**
   * Busca imagen por fallback según idioma cuando PC no la devuelve.
   * EN: pokemontcg.io → TCGDex → R2
   * JP: R2 → TCGDex ja
   * CN: R2
   */
  const fetchPreviewImageByLang = async (nombre, numero, idioma, setId) => {
    const lang = normLang(idioma)
    const num  = numero ? normalizeNum(numero) : ''
    let imageUrl = null
    try {
      if (lang === 'en') {
        // 1° pokemontcg.io (confiable para EN)
        if (setId && num) {
          const card = await fetchCardBySetAndNumber(setId, num)
          imageUrl = card?.images?.small || card?.images?.large || null
        }
        if (!imageUrl && num) {
          try {
            const tcgdex = await fetch(`https://api.tcgdex.net/v2/en/cards/${setId || 'base1'}/${num}`)
            const d = await tcgdex.json()
            if (d?.image) imageUrl = d.image + '/high.webp'
          } catch (_) {}
        }
        // 2° R2 vía backend con scoring nombre+número
        if (!imageUrl) {
          const res = await scannerApi.cardImageUrl(nombre, num, 'en', { setId: setId || '' })
          if (res?.url) imageUrl = res.url
        }
      } else if (lang === 'jp') {
        // 1° R2 vía backend
        const res = await scannerApi.cardImageUrl(nombre, num, 'jp', { setId: setId || '' })
        if (res?.url) imageUrl = res.url
        // 2° TCGDex japonés
        if (!imageUrl && setId && num) {
          try {
            const tcgdex = await fetch(`https://api.tcgdex.net/v2/ja/cards/${setId}/${num}`)
            const d = await tcgdex.json()
            if (d?.image) imageUrl = d.image + '/high.webp'
          } catch (_) {}
        }
      } else {
        // CN: solo R2
        const res = await scannerApi.cardImageUrl(nombre, num, 'cn', { setId: setId || '' })
        if (res?.url) imageUrl = res.url
      }
    } catch (_) {}
    if (imageUrl) {
      setPreview(prev => ({ ...prev, imagen: imageUrl }))
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

    // ── Modo SELLADO: autocomplete desde sealed_products (ETB, Box, Bundle…) ──
    if (form.tipo === 'sellado') {
      if (!val.trim() || val.length < 2) { setSuggestions([]); setShowSug(false); return }
      sugTimer.current = setTimeout(async () => {
        const res = await searchSealedByName(val.trim())
        setSuggestions(res); setShowSug(res.length > 0)
      }, 250)
      return
    }

    // ── Caso A: set precargado → filtro local + búsqueda Supabase para custom ─
    if (allSetCardsRef.current.length > 0) {
      if (!val.trim()) { setSuggestions(allSetCardsRef.current.slice(0, 60)); setShowSug(true); return }

      // Filtrar del caché local
      filterFromCache(val)

      // También buscar en Supabase cartas con nombre custom que el caché no tiene.
      // Filtramos por idioma para no traer prints de otro idioma (coherencia idioma↔carta).
      if (val.trim().length >= 2) {
        supabase
          .from('cards')
          .select('name, set_name, card_number, image_url, language')
          .ilike('name', `${val.trim()}%`)
          .eq('language', normLang(form.idioma))
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

        const q = val.trim()
        const stillCurrent = () => sugQueryRef.current === q
        sugQueryRef.current = q

        if (lang === 'en') {
          sugPageRef.current = 1

          // 1) NUESTRO catálogo (Supabase, local y rápido) → mostrar YA
          const supaMatched = await searchCatalogByName(q, 'en', 25)
          if (!stillCurrent()) return
          setSuggestions(supaMatched)
          setShowSug(supaMatched.length > 0)
          setSugLoading(false)

          // 2) En segundo plano: precios PC + extras de pokemontcg.io (no bloquea el dropdown)
          ;(async () => {
            try {
              const enriched = await enrichSuggestionsWithPCPrices(supaMatched, 'en')
              if (stillCurrent()) setSuggestions(enriched)

              const { results, totalCount } = await searchCardsByName(q, 20, 1)
              if (!stillCurrent()) return
              const have = new Set(enriched.map(c => `${c.nombre}|${c.set}|${c.numero}`))
              const extra = results
                .map(c => ({ nombre: c.name, set: c.set_name, set_id: null, numero: c.card_number, imagen: c.image_url, precio_usd: c.price_usd, source: 'market' }))
                .filter(c => !have.has(`${c.nombre}|${c.set}|${c.numero}`))
              sugTotalRef.current = totalCount
              setHasMore((supaMatched.length + extra.length) < totalCount)
              if (extra.length) {
                const merged = await enrichSuggestionsWithPCPrices([...enriched, ...extra], 'en')
                if (stillCurrent()) setSuggestions(merged)
              }
            } catch (_) {}
          })()
        } else {
          // 1) NUESTRO catálogo (name + name_en) → mostrar YA (trae variantes JP/CN
          //    incluso buscando en inglés, gracias a name_en)
          const catalog = await searchCatalogByName(q, lang, 25)
          if (!stillCurrent()) return
          setSuggestions(catalog)
          setShowSug(catalog.length > 0)
          setSugLoading(false)

          // 2) En segundo plano: precios PC + complemento del scanner backend
          ;(async () => {
            try {
              const enriched = await enrichSuggestionsWithPCPrices(catalog, lang)
              if (stillCurrent()) setSuggestions(enriched)

              let backend = []
              try {
                const res = await scannerApi.buscar(q, lang, '', 20)
                backend = (res?.results ?? res?.opciones ?? []).map(c => ({
                  nombre: c.nombre || c.name, set: c.set_name || c.set, set_id: c.set_code || null,
                  numero: c.numero || c.number, imagen: c.imagen || c.image_url, precio_usd: null, source: 'phash',
                }))
              } catch (_) {}
              const seen = new Set(catalog.map(c => `${(c.nombre||'').toLowerCase()}|${c.set}|${c.numero}`))
              const extra = backend.filter(c => !seen.has(`${(c.nombre||'').toLowerCase()}|${c.set}|${c.numero}`))
              if (extra.length) {
                const merged = await enrichSuggestionsWithPCPrices([...enriched, ...extra], lang)
                if (stillCurrent()) setSuggestions(merged)
              }
            } catch (_) {}
          })()
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
    // ── SELLADO: fija el producto y trae el precio de mercado desde PC ──
    if (sug.source === 'sealed') {
      setForm(f => ({ ...f, nombre: sug.nombre, set: sug.set || '', sealedId: sug.sealedId,
                      product_type: sug.product_type, finish: 'normal', grade: 'ungraded' }))
      setShowSug(false); setSuggestions([]); setCardSelected(true)
      setPreview({ imagen: sug.imagen, precio_usd: null, precio_source: null })
      // precio de mercado del sellado: /card-price por "{set} {nombre}".
      // Limpiamos corchetes ([Pokemon Center], etc.) y "Pokemon " para que PC matchee mejor.
      const nombreLimpio = (sug.nombre || '').replace(/\[[^\]]*\]/g, '').replace(/\s+/g, ' ').trim()
      const setLimpio    = (sug.set || '').replace(/^Pokemon\s+/i, '').trim()
      let pc = await scannerApi.cardPrice(`${setLimpio} ${nombreLimpio}`.trim(), '', 'en', 'normal', 'ungraded', false)
      // Reintento sin el set si no hubo match (algunos sellados PC solo por nombre)
      if (!pc?.price_usd && nombreLimpio) {
        pc = await scannerApi.cardPrice(nombreLimpio, '', 'en', 'normal', 'ungraded', false)
      }
      if (pc?.price_usd) {
        setPreview(prev => ({ ...prev, precio_usd: pc.price_usd, precio_source: 'pc' }))
        if (blue) { const m = margen ?? 0; setField('precioVenta', String(Math.round(pc.price_usd * blue * (1 + m / 100) / 500) * 500)) }
      }
      return
    }
    setForm(f => ({
      ...f,
      nombre:  sug.nombre  || '',
      set:     sug.set     || '',
      set_id:  sug.set_id  ?? f.set_id,
      numero:  sug.numero  || '',
    }))
    setShowSug(false)
    setSuggestions([])
    setCardSelected(true)
    setPreview({ imagen: sug.imagen, precio_usd: sug.precio_usd ?? null, precio_source: sug.source_price === 'pc' ? 'pc' : sug.source === 'market' ? 'tcgplayer' : null })

    // 1. Buscar precio de PriceCharting primero (fuente principal)
    const idioma = sug.idioma || form.idioma || 'en'
    const normLangLocal = (l) => ['ja','jp'].includes(l) ? 'jp' : ['zh','cn'].includes(l) ? 'cn' : 'en'
    const cardResult = await fetchCardId(sug.nombre, sug.numero, normLangLocal(idioma), sug.set, form.finish)
    let precioBase = sug.precio_usd ?? null

    if (cardResult) {
      setSelectedCardId(cardResult.id)
      const pcResult = await fetchPrecioConFallback(cardResult.id, sug.nombre, sug.numero, normLangLocal(idioma), form.finish, form.grade)
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

    // ── Tab NÚMERO: la carta se resuelve por set + número (todos los idiomas) ──
    if (numMode) {
      if (!val.trim()) { setCardSelected(false); setPreview(null); setField('nombre', ''); return }
      if (!form.set_id) return                       // necesita el set primero
      numTimer.current = setTimeout(async () => {
        const numNorm = normalizeNum(val.trim())     // "151/159"→"151", "GG13/GG70"→"GG13"
        // 1) buscar en el caché del set precargado (EN via pokemontcg, JP/CN via índice)
        let hit = allSetCardsRef.current.find(c => normalizeNum(c.numero || '') === numNorm)
        // 2) si el caché aún no cargó, cargarlo y reintentar
        if (!hit && allSetCardsRef.current.length === 0) {
          await preloadSetCards(form.set_id, form.idioma)
          hit = allSetCardsRef.current.find(c => normalizeNum(c.numero || '') === numNorm)
        }
        // 3) fallback EN: pokemontcg.io por set + número exacto
        if (!hit && normLang(form.idioma) === 'en') {
          const card = await fetchCardBySetAndNumber(form.set_id, val.trim())
          if (card) hit = { nombre: card.name, set: card.set_name, set_id: card.set_id,
                            numero: card.card_number, imagen: card.image_url,
                            precio_usd: card.price_usd, source: 'market' }
        }
        if (hit) selectSuggestion({ ...hit, idioma: form.idioma })
      }, 400)
      return
    }

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
            const cidResult = await fetchCardId(form.nombre, res.number || numNorm, lang, res.set_name || form.set, form.finish)
            if (cidResult) {
              if (cidResult.set_name) setForm(f => ({ ...f, set: cidResult.set_name || f.set }))
              const pcResult = await fetchPrecioConFallback(cidResult.id, form.nombre, res.number || numNorm, form.idioma, form.finish, form.grade)
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
          const cidResult = await fetchCardId(form.nombre, numNorm, lang, form.set, form.finish)
          if (cidResult) {
            if (cidResult.set_name) setForm(f => ({ ...f, set: cidResult.set_name || f.set }))
            const pcResult = await fetchPrecioConFallback(cidResult.id, form.nombre, numNorm, form.idioma, form.finish, form.grade)
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
  const langSeqRef = useRef(0)   // secuencia: descarta resoluciones async viejas (race al cambiar idioma rápido)
  useEffect(() => {
    const prev = prevIdiomaRef.current
    prevIdiomaRef.current = form.idioma
    if (form.idioma === prev) return
    const mySeq = ++langSeqRef.current
    const alive = () => langSeqRef.current === mySeq   // false si hubo otro cambio de idioma después

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

    // Al cambiar idioma: limpiar precio y re-llamar a la API. NO limpiamos la imagen
    // upfront: si no hay equivalente en el idioma nuevo, mejor mantener la imagen
    // actual que mostrar una carta de otra época equivocada.
    setPreview(prev => ({ ...prev, precio_usd: null, precio_buy_usd: null, precio_sell_usd: null, precio_source: null }))

    const prevSet  = form.set            // set del idioma anterior
    const prevLang = normLang(prev)      // idioma anterior (origen del cambio)

    ;(async () => {
      // ── Aplica una carta equivalente encontrada (precio + imagen + set/número) ──
      const applyEq = async (eq) => {
        if (!alive()) return
        // Al ir a EN mostramos el nombre en inglés; a JP/CN dejamos el término escrito.
        setForm(f => ({
          ...f,
          nombre: lang === 'en' ? (eq.name_en || eq.name || f.nombre) : f.nombre,
          set:    eq.set_name || f.set,
          numero: eq.card_number || f.numero,
          set_id: null,
        }))
        if (eq.id) setSelectedCardId(eq.id)
        const nameForPrice = eq.name_en || eq.name || form.nombre
        const pc = await fetchPrecioConFallback(eq.id, nameForPrice, eq.card_number, lang, form.finish, form.grade, !eq.image_url)
        if (!alive()) return   // hubo otro cambio de idioma mientras se buscaba → descartar
        const img = eq.image_url || pc?.image_url
        if (img) setPreview(prev => ({ ...prev, imagen: img, sinVersionIdioma: false }))
        if (pc?.price_usd) {
          setPreview(prev => ({ ...prev, precio_usd: pc.price_usd, precio_buy_usd: pc.price_buy_usd ?? null, precio_sell_usd: pc.price_sell_usd ?? null, precio_source: 'pc', grade: form.grade }))
          if (blue) { const m = margen ?? 0; setForm(f => ({ ...f, precioVenta: String(Math.round(pc.price_usd * blue * (1 + m / 100) / 500) * 500) })) }
        }
      }

      try {
        // 0) Puente cross-idioma vía name_en. Si vengo de EN, el nombre ya es inglés;
        //    si vengo de JP/CN, busco el name_en de la carta origen (selectedCardId o
        //    por nombre+set+idioma) para usarlo como puente.
        let bridgeEn = prevLang === 'en' ? form.nombre : null
        if (!bridgeEn && form.nombre) {
          const src = await supabase.from('cards')
            .select('name_en').eq('language', prevLang).eq('name', form.nombre)
            .ilike('set_name', prevSet || '%').limit(1).maybeSingle()
          if (!alive()) return
          bridgeEn = src?.data?.name_en || null
        }

        // 1) Sets del idioma destino que corresponden al set+idioma de origen.
        const targetSets = setsForLang(prevSet, prevLang, lang)

        if (bridgeEn && targetSets.length) {
          const eq = await findEquivalentCard(bridgeEn, targetSets, lang, form.finish)
          if (!alive()) return
          if (eq) { await applyEq(eq); return }
          // Correspondencia conocida pero la carta no existe en ese set destino →
          // NO búsqueda salvaje (evita traer carta de otra época). Mantener imagen.
          setPreview(prev => ({ ...prev, precio_source: null, sinVersionIdioma: true }))
          return
        }

        // 2) Sin correspondencia de set conocida (set exclusivo/promo). Para no arrastrar
        //    una carta equivocada, NO buscamos a ciegas: mantenemos la imagen actual,
        //    limpiamos precio y avisamos que no hay versión mapeada en ese idioma.
        if (alive()) setPreview(prev => ({ ...prev, precio_source: null, sinVersionIdioma: true }))
      } catch (_) {
        if (alive()) setPreview(prev => ({ ...prev, precio_source: null, sinVersionIdioma: true }))
      }
    })()
  }, [form.idioma]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Al cambiar finish o grade → re-buscar precio PC con la variante correcta ──
  const prevFinishRef = useRef(form.finish)
  const prevGradeRef  = useRef(form.grade)
  useEffect(() => {
    const finishChanged = form.finish !== prevFinishRef.current
    const gradeChanged  = form.grade  !== prevGradeRef.current
    prevFinishRef.current = form.finish
    prevGradeRef.current  = form.grade
    if (!finishChanged && !gradeChanged) return
    if (!form.nombre) return

    // Limpiar precio inmediatamente para que el usuario vea que se está actualizando.
    // Al cambiar el finish (otra variante = otra carta) también limpiamos la imagen.
    if (finishChanged) {
      setPreview(prev => ({ ...prev, precio_usd: null, precio_buy_usd: null, precio_sell_usd: null, precio_source: null, imagen: null }))
    }

    ;(async () => {
      // Buscar el card_id correcto para el nuevo finish (puede diferir del selectedCardId actual)
      const lang = normLang(form.idioma)
      const cidResult = await fetchCardId(form.nombre, form.numero, lang, form.set, form.finish)
      const targetCardId = cidResult?.id ?? selectedCardId
      if (cidResult?.id) setSelectedCardId(cidResult.id)

      // Imagen guardada de la variante (si existe) → mostrar ya
      if (finishChanged && cidResult?.image_url) {
        setPreview(prev => ({ ...prev, imagen: cidResult.image_url }))
      }

      // Si no tenemos imagen de la variante, pedirla en vivo a PriceCharting (image=1)
      const wantImage = finishChanged && !cidResult?.image_url
      const pcResult = await fetchPrecioConFallback(targetCardId, form.nombre, form.numero, form.idioma, form.finish, form.grade, wantImage)
      if (pcResult?.image_url) {
        setPreview(prev => ({ ...prev, imagen: pcResult.image_url }))
      }
      if (!pcResult?.price_usd) return
      setPreview(prev => ({
        ...prev,
        precio_usd:      pcResult.price_usd,
        precio_buy_usd:  pcResult.price_buy_usd  ?? null,
        precio_sell_usd: pcResult.price_sell_usd ?? null,
        precio_source:   'pc',
        grade:           form.grade,
      }))
      if (pcResult.price_usd && blue) {
        const m = margen ?? 0
        setForm(f => ({ ...f, precioVenta: String(Math.round(pcResult.price_usd * blue * (1 + m / 100) / 500) * 500) }))
      }
    })()
  }, [form.finish, form.grade]) // eslint-disable-line react-hooks/exhaustive-deps

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

      // ── SELLADO: inserta en inventory referenciando sealed_products (sin card) ──
      if (form.tipo === 'sellado' && form.sealedId) {
        const { error: sErr } = await supabase.from('inventory').insert({
          store_id:          STORE_ID,
          sealed_product_id: form.sealedId,
          product_type:      'sealed',
          quantity:          cantidad,
          condicion:         form.condicion,
          condition:         form.condicion,
          status:            'disponible',
          estado:            'disponible',
          price_usd:         precioUsd,
          price_ars_oficial: arsOfic ?? null,
          price_ars_blue:    arsBlue ?? null,
          sale_price_ars:    form.precioVenta ? parseFloat(form.precioVenta) : (precioVenta || null),
          scan_date:         new Date().toISOString(),
          idioma:            'en',
          grade:             'ungraded',
        })
        if (sErr) throw sErr
        showToast(`✅ ${cantidad > 1 ? cantidad + ' productos' : 'Producto sellado'} al stock`)
        setForm({ nombre: '', set: '', set_id: null, numero: '', cantidad: 1, condicion: 'NM',
                  idioma: 'en', precioVenta: '', finish: 'normal', grade: 'ungraded',
                  tipo: 'sellado', sealedId: null, product_type: null })
        setPreview(null); setSelectedCardId(null); setCardSelected(false); setLoading(false)
        return
      }

      // 1. Buscar o crear la carta en `cards`
      let cardId = null
      // Buscar carta existente (cards es tabla global, sin store_id)
      const langFinal = normLang(form.idioma) || 'en'

      // Buscar carta existente filtrando también por idioma y finish
      const finishFinal = form.finish || 'normal'
      let cardQuery = supabase
        .from('cards')
        .select('id')
        .ilike('name', form.nombre.trim())
        .eq('language', langFinal)
        .eq('finish', finishFinal)

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
        // Insertar nueva carta con idioma y finish del formulario
        const { data: newCard, error: cardErr } = await supabase
          .from('cards')
          .insert({
            name:        form.nombre.trim(),
            set_name:    form.set.trim()    || null,
            card_number: form.numero.trim() || null,
            language:    langFinal,
            image_url:   preview?.imagen    || null,
            finish:      finishFinal,
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
        .eq('finish', finishFinal)
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
      qc.invalidateQueries({ queryKey: ['stock'] })
      qc.invalidateQueries({ queryKey: ['metricas'] })
      setForm({ nombre: '', set: '', set_id: null, numero: '', cantidad: 1, condicion: 'NM', idioma: 'en', precioVenta: '', finish: 'normal', grade: 'ungraded' })
      setPreview(null)
      setSelectedCardId(null)
      setCardSelected(false)
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

  // ── Cambio de tab (CARTA | LINKS | SELLADO) — resetea el formulario ──────
  const switchTab = (val) => {
    const tipo = val === 'sellado' ? 'sellado' : 'carta'
    setTab(val)
    setForm(f => ({ ...f, tipo, nombre: '', set: '', set_id: null, numero: '',
                    sealedId: null, product_type: null, precioVenta: '' }))
    setPreview(null); setSuggestions([]); setShowSug(false); setPcUrl('')
    setCardSelected(false); setLinkError(null)
    allSetCardsRef.current = []
  }

  const inputCls = "w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
  const labelCls = "text-xs text-gray-500 font-medium mb-1 block"
  const disCls   = "disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed disabled:opacity-60"

  // ── Progressive disclosure: flags de habilitación (solo aplican a CARTA/LINKS) ──
  // LINKS: identidad SIEMPRE bloqueada (se carga desde la URL).
  // CARTA: se bloquea al seleccionar la carta.
  // NÚMERO: idioma/set/número quedan EDITABLES (para corregir); el nombre es
  //   RESULTADO (se completa por número), por eso va deshabilitado.
  const isCard         = form.tipo !== 'sellado'
  const linkMode       = tab === 'links'
  const identityLocked = isCard && (cardSelected || linkMode) && !numMode
  const nombreDisabled = identityLocked || numMode
  const numeroDisabled = numMode
    ? !form.set_id                                                 // NÚMERO: número tras elegir set
    : (identityLocked || (!form.set_id && !form.nombre))
  const detailsEnabled = !isCard || cardSelected                   // cantidad/cond/tipo/grado/precios/venta

  // Resetea la carta seleccionada para elegir otra (mantiene idioma y tab).
  const clearCard = () => {
    setForm(f => ({ ...f, nombre: '', set: '', set_id: null, numero: '', cantidad: 1,
                    condicion: 'NM', finish: 'normal', grade: 'ungraded', precioVenta: '',
                    sealedId: null, product_type: null }))
    setPreview(null); setSuggestions([]); setShowSug(false)
    setSelectedCardId(null); setCardSelected(false)
    setLinkError(null); setPcUrl('')
    allSetCardsRef.current = []
  }

  // Banner "seleccionado" con botón para cambiar (carta o sellado)
  const selectedBanner = cardSelected ? (
    <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-blue-50 border border-blue-200">
      <span className="text-xs text-blue-700 font-medium truncate">
        ✓ {form.nombre}{form.set ? ` · ${form.set}` : ''}{form.numero ? ` · #${form.numero}` : ''}
      </span>
      <button type="button" onClick={clearCard}
        className="shrink-0 text-xs font-semibold text-blue-600 hover:text-blue-800
                   bg-white border border-blue-200 rounded-lg px-2.5 py-1 transition">
        Cambiar
      </button>
    </div>
  ) : null

  // ── Piezas reutilizables del formulario (mismas en CARTA/LINKS y SELLADO) ──
  // Se componen en distinto orden según el tab, sin duplicar la lógica.
  const nombreField = (
    <div ref={wrapRef} className="relative">
      <label className={labelCls}>{form.tipo === 'sellado' ? 'Producto sellado' : t('ingresos_card_name')}</label>
      <input
        value={form.nombre}
        onChange={e => handleNombreChange(e.target.value)}
        onFocus={handleNombreFocus}
        placeholder={form.tipo === 'sellado'
          ? 'Buscar sellado o elegí un set… ej: Elite Trainer Box'
          : numMode ? 'Se completa al ingresar el número'
          : (form.set_id ? t('ingresos_search_set') : t('ingresos_search_card'))}
        autoComplete="off"
        disabled={nombreDisabled}
        className={`${inputCls} ${disCls}`}
      />
      {sugLoading && (
        <div className="absolute right-3 top-8">
          <div className="w-4 h-4 border-2 border-blue-300 border-t-transparent rounded-full animate-spin" />
        </div>
      )}
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
                {sug.source === 'sealed'
                  ? <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-amber-100 text-amber-700">{sealedLabel(sug.product_type)}</span>
                  : <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium
                    ${sug.source_price === 'pc'
                      ? 'bg-emerald-100 text-emerald-700'
                      : sug.source === 'market'
                        ? 'bg-blue-100 text-blue-600'
                        : 'bg-gray-100 text-gray-500'}`}>
                    {sug.source_price === 'pc' ? 'PC' : sug.source === 'market' ? t('ingresos_source_market') : t('ingresos_source_stock')}
                  </span>}
              </div>
            </button>
          ))}
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
  )

  const setEditionField = (
    <div>
      <label className={labelCls}>{t('ingresos_set_edition')}</label>
      <SetSelect
        value={form.set}
        setId={form.set_id}
        lang={form.idioma}
        disabled={identityLocked}
        onChange={async ({ set_name, set_id }) => {
          setForm(f => ({ ...f, set: set_name, set_id, numero: '', nombre: '' }))
          setSuggestions([])
          setShowSug(false)
          setPreview(null)
          setCardSelected(false)
          allSetCardsRef.current = []
          // SELLADO: al elegir set, listar los sellados de ese set (ETB/Box/Bundle…)
          if (form.tipo === 'sellado') {
            const res = await searchSealedBySet(set_name)
            setSuggestions(res); setShowSug(res.length > 0)
            return
          }
          // ▶ Precarga las cartas del set EN BACKGROUND inmediatamente.
          if (set_id) preloadSetCards(set_id, form.idioma)
        }}
        className="w-full"
      />
    </div>
  )

  const qtyCondRow = (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      <div>
        <label className={labelCls}>{t('ingresos_quantity')}</label>
        <input type="number" min="1" value={form.cantidad}
          onChange={e => setField('cantidad', e.target.value)}
          disabled={!detailsEnabled}
          className={`${inputCls} ${disCls}`} />
      </div>
      <div>
        <label className={labelCls}>{t('ingresos_condition')}</label>
        <select value={form.condicion} onChange={e => setField('condicion', e.target.value)}
          disabled={!detailsEnabled}
          className={`${inputCls} bg-white ${disCls}`}>
          {CONDICIONES.map(c => <option key={c}>{c}</option>)}
        </select>
      </div>
    </div>
  )

  return (
    <div className="max-w-5xl">
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="flex flex-col lg:flex-row lg:items-start">

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

              {/* Tabs: CARTA | LINKS | SELLADO */}
              <div className="flex gap-2">
                {[['carta', '🃏 Carta'], ['numero', '🔢 Número'], ['links', '🔗 Links'], ['sellado', '📦 Sellado']].map(([val, lbl]) => (
                  <button key={val} type="button"
                    onClick={() => switchTab(val)}
                    className={`flex-1 py-2 rounded-xl text-sm font-semibold transition border
                      ${tab === val ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
                    {lbl}
                  </button>
                ))}
              </div>

              {/* URL de PriceCharting — solo en LINKS y SELLADO (auto-fill) */}
              {(tab === 'links' || tab === 'sellado') && (
              <div>
                <label className={labelCls}>URL de PriceCharting <span className="text-gray-400 font-normal">(pegá el link y se completa solo)</span></label>
                <div className="relative">
                  <input
                    value={pcUrl}
                    onChange={e => handlePcUrl(e.target.value)}
                    placeholder={form.tipo === 'sellado'
                      ? 'https://www.pricecharting.com/game/pokemon-.../elite-trainer-box'
                      : 'https://www.pricecharting.com/game/pokemon-.../...'}
                    className={`${inputCls} pr-8 text-xs`}
                  />
                  {pcLoading && (
                    <div className="absolute right-3 top-2.5">
                      <div className="w-4 h-4 border-2 border-blue-300 border-t-transparent rounded-full animate-spin" />
                    </div>
                  )}
                </div>
                {/* Error del link (solo LINKS) */}
                {tab === 'links' && linkError && (
                  <div className="mt-1.5 flex items-center justify-between gap-2 text-xs text-red-600
                                  bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                    <span>{linkError.msg}</span>
                    {linkError.cta && (
                      <button type="button" onClick={() => switchTab('carta')}
                        className="shrink-0 font-semibold text-red-700 hover:text-red-900
                                   bg-white border border-red-200 rounded-lg px-2 py-0.5 transition">
                        Ir a CARTA
                      </button>
                    )}
                  </div>
                )}
              </div>
              )}

              {form.tipo === 'sellado' ? (
                /* ── SELLADO: layout original (sin cambios funcionales) ── */
                <>
                  {selectedBanner}
                  {/* Búsqueda: solo mientras no haya un sellado seleccionado */}
                  {!cardSelected && (
                    <>
                      {nombreField}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {setEditionField}
                      </div>
                    </>
                  )}
                  {/* Categoría del sellado seleccionado */}
                  {cardSelected && form.product_type && (
                    <div>
                      <label className={labelCls}>Categoría</label>
                      <div className="px-3 py-2 rounded-xl bg-amber-50 text-amber-700 text-sm font-medium border border-amber-200">
                        {sealedLabel(form.product_type)}
                      </div>
                    </div>
                  )}
                  {qtyCondRow}
                </>
              ) : (
                /* ── CARTA / LINKS: idioma → nombre+set → número → cantidad+cond → tipo+grado ── */
                <>
                  {selectedBanner}

                  {/* Idioma — primer campo: acota el universo de búsqueda */}
                  <div>
                    <label className={labelCls}>{t('ingresos_language')}</label>
                    <select value={form.idioma}
                      onChange={e => {
                        const newIdioma = e.target.value
                        setField('idioma', newIdioma)
                        allSetCardsRef.current = []
                        setSuggestions([])
                        if (form.set_id) preloadSetCards(form.set_id, newIdioma)
                      }}
                      disabled={identityLocked}
                      className={`${inputCls} bg-white ${disCls}`}>
                      {IDIOMAS.map(i => <option key={i.code} value={i.code}>{i.flag} {i.label}</option>)}
                    </select>
                  </div>

                  {/* Nombre + Set / Edición — misma jerarquía, 50/50 */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {nombreField}
                    {setEditionField}
                  </div>

                  {/* Número de carta */}
                  <div>
                    <label className={labelCls}>{t('ingresos_card_number')}</label>
                    <input
                      value={form.numero}
                      onChange={e => handleNumeroChange(e.target.value)}
                      placeholder={form.set_id ? '151/159, GG13, TG30…'
                        : (numMode ? 'Primero elegí el set' : t('ingresos_card_number_ph'))}
                      disabled={numeroDisabled}
                      className={`${inputCls} ${disCls}`}
                    />
                  </div>

                  {/* Cantidad + Condición */}
                  {qtyCondRow}

                  {/* Tipo + Grado */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className={labelCls}>Tipo</label>
                      <FinishSelect
                        value={form.finish}
                        onChange={v => setField('finish', v)}
                        disabled={!detailsEnabled}
                        className="w-full"
                      />
                    </div>
                    <div>
                      <label className={labelCls}>Grado</label>
                      <select value={form.grade}
                        onChange={async e => {
                          const val = e.target.value
                          setForm(f => ({ ...f, grade: val }))
                          if (form.nombre) {
                            const cardResult = await fetchCardId(form.nombre, form.numero, normLang(form.idioma), form.set, form.finish)
                            const pcResult = await fetchPrecioConFallback(cardResult?.id ?? null, form.nombre, form.numero, form.idioma, form.finish, val)
                            if (pcResult?.price_usd) {
                              const m = margen ?? 0
                              setPreview(prev => ({ ...prev, precio_usd: pcResult.price_usd, precio_buy_usd: pcResult.price_buy_usd ?? null, precio_sell_usd: pcResult.price_sell_usd ?? null, precio_source: 'pc', grade: val }))
                              setForm(f => ({ ...f, precioVenta: String(Math.round(pcResult.price_usd * blue * (1 + m / 100) / 500) * 500) }))
                            } else {
                              setPreview(prev => ({ ...prev, precio_usd: null, precio_buy_usd: null, precio_sell_usd: null, grade: val }))
                            }
                          }
                        }}
                        disabled={!detailsEnabled}
                        className={`${inputCls} bg-white ${disCls}`}>
                        <option value="ungraded">Sin graduar</option>
                        <option value="psa9">PSA 9</option>
                        <option value="psa10">PSA 10</option>
                        <option value="bgs10">BGS 10</option>
                      </select>
                    </div>
                  </div>
                </>
              )}

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
                      disabled={previewLoad || !detailsEnabled}
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
                  disabled={!detailsEnabled}
                  className={`${inputCls} ${disCls}`}
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

              <button type="submit" disabled={loading || !form.nombre.trim() || (isCard && !cardSelected)}
                className="w-full py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-50
                           text-white font-bold rounded-xl transition flex items-center justify-center gap-2">
                {loading ? <Spinner size={18} /> : t('ingresos_add_to_stock')}
              </button>
            </form>
          </div>

          {/* ── Panel preview (der) ──────────────────────────────────────── */}
          <div className="lg:w-80 self-stretch border-t lg:border-t-0 lg:border-l border-gray-100
                          bg-gray-50 flex flex-col items-center justify-start p-6 gap-4">
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
                    className="w-64 rounded-2xl shadow-xl object-contain"
                    draggable={false}
                  />
                  {/* Badge verificado */}
                  <div className="absolute -top-2 -right-2 bg-emerald-500 text-white
                                  text-[10px] font-bold px-2 py-0.5 rounded-full shadow">
                    ✓
                  </div>
                </div>
                <div className="text-center">
                  <p className="text-base font-semibold text-gray-800 leading-tight">{form.nombre}</p>
                  {form.set && <p className="text-xs text-gray-400 mt-0.5">{form.set}</p>}
                  {form.numero && <p className="text-xs text-gray-400">#{form.numero}</p>}
                  {preview?.sinVersionIdioma && (
                    <p className="text-[11px] text-amber-600 mt-2 max-w-[12rem]">
                      No hay versión mapeada de esta carta en este idioma. Se mantiene la imagen anterior.
                    </p>
                  )}
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center gap-3 text-center">
                <div className="w-64 h-80 bg-white border-2 border-dashed border-gray-200
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
