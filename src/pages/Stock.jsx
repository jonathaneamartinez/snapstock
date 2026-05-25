import { useState, useMemo } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useStock }    from '../hooks/useStock'
import { useMetricas } from '../hooks/useMetricas'
import { useDolar }    from '../hooks/useDolar'
import { useSettings, PRICE_SOURCES } from '../hooks/useSettings'
import { getPrecioEfectivo, usdToArs, FUENTE_LABELS } from '../lib/precioUtils'
import { supabase }    from '../lib/supabase'
import Badge           from '../components/ui/Badge'
import Spinner         from '../components/ui/Spinner'
import EmptyState      from '../components/ui/EmptyState'
import CardImage       from '../components/ui/CardImage'
import InlineEdit      from '../components/ui/InlineEdit'
import Toast           from '../components/ui/Toast'
import { AnimatePresence, motion } from 'framer-motion'
import { IDIOMAS, CONDICIONES, STORE_ID, CANALES_VENTA, FEATURES } from '../constants'
import { PAGE_SIZE } from '../hooks/useStock'
import { translateSetName } from '../lib/setTranslations'
import { useI18n } from '../lib/i18n'
import { usePrefetchPageImages } from '../hooks/usePrefetchPageImages'
import ClaimOptionsModal from '../components/stock/ClaimOptionsModal'
import ClaimCartModal    from '../components/stock/ClaimCartModal'
import { getCardImageUrl, warmBlobUrls } from '../lib/imageCache'
import CardPriceModal   from '../components/market/CardPriceModal'
import MarketKpiBadge  from '../components/market/MarketKpiBadge'
import { useMarketKpiBatch } from '../hooks/useMarketKpi'

const fmtUSD = (n) => n != null ? `$${Number(n).toFixed(2)}` : '—'
const fmtARS = (n) => n != null ? `$${Number(n).toLocaleString('es-AR', { maximumFractionDigits: 0 })}` : '—'
const fmtFecha = (s) => {
  if (!s) return '—'
  try { return new Date(s).toLocaleDateString('es-AR') } catch { return '—' }
}

const IDIOMA_FLAG = { en: '🇬🇧', es: '🇪🇸', ja: '🇯🇵', fr: '🇫🇷', de: '🇩🇪', pt: '🇧🇷' }

// Columnas: i18n_key + sort key + type (labels se resuelven con t() dentro del componente)
const COLS_DEF = [
  { i: 'stock_col_image',    key: null,                type: null   },
  { i: 'stock_col_name',     key: 'nombre',            type: 'str'  },
  { i: 'stock_col_set',      key: 'set_name',          type: 'str'  },
  { i: 'stock_col_number',   key: 'numero',            type: 'num'  },
  { i: 'stock_col_language', key: 'idioma',            type: 'str'  },
  { i: 'stock_col_holo',     key: 'holo',              type: 'bool' },
  { i: 'stock_col_condition',key: 'condicion',         type: 'str'  },
  { i: 'stock_col_stock',    key: 'stock',             type: 'num'  },
  { i: 'stock_col_usd',      key: 'price_usd',         type: 'num'  },
  { i: 'stock_col_ars_ofic', key: '_ars_ofic',         type: 'num'  },
  { i: 'stock_col_ars_blue', key: '_ars_blue',         type: 'num'  },
  { i: 'stock_col_sale',     key: 'precio_venta',      type: 'num'  },
  { i: 'stock_col_status',   key: 'status',            type: 'str'  },
  { i: 'stock_col_buyer',    key: 'buyer_name',        type: 'str'  },
  { i: 'stock_col_contact',  key: 'buyer_contact',     type: 'str'  },
  { i: 'stock_col_notes',    key: 'notes',             type: 'str'  },
  { i: 'stock_col_reserved', key: 'reserved_at',       type: 'date' },
  { i: 'stock_col_scanned',  key: 'fecha_escaneada',   type: 'date' },
]

export default function Stock() {
  const queryClient = useQueryClient()

  const [filters,     setFilters]     = useState({ estado: 'disponible', page: 0, sortCol: null, sortDir: 'asc' })
  const [kpiSort,      setKpiSort]      = useState('')   // '' | 'score' | 'demand' | 'liquidity' | 'trend' | 'demand_asc' | 'liquidity_asc'
  const [kpiStateFilter, setKpiStateFilter] = useState('') // '' | 'buyable' | 'sell_now' | 'normal' | 'con_datos'
  const [demoKpi,      setDemoKpi]      = useState(false) // modo demo: muestra datos simulados de KPI
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [bulkLoading, setBulkLoading] = useState(false)
  const [confirmDel,  setConfirmDel]  = useState(false)
  const [confirmSell, setConfirmSell] = useState(false)
  const [bulkChannel, setBulkChannel] = useState('fuera_de_evento')
  const [bulkBuyer,   setBulkBuyer]   = useState('')
  const [toast,       setToast]       = useState({ visible: false, mensaje: '', tipo: 'success' })
  const [claimCards,   setClaimCards]   = useState(null)    // array para modal de generación
  const [showCartModal, setShowCartModal] = useState(false) // carrito review modal
  const [priceCard,    setPriceCard]    = useState(null)   // carta para modal de historial de precio
  // ── Carrito de claim persistente (sobrevive cambios de página) ──────────
  const [claimCart,   setClaimCart]   = useState(new Map()) // inventory_id → row data

  const { t } = useI18n()
  const { data, isLoading, error } = useStock(filters)
  const { data: m } = useMetricas()
  const { blue, oficial } = useDolar()
  const { precioFuente, savePrecioFuente } = useSettings()

  // Columnas con labels traducidos
  const COLS = COLS_DEF.map(c => ({ ...c, h: t(c.i) }))

  const set = (k, v) => {
    setSelectedIds(new Set())
    setFilters(f => ({ ...f, [k]: v || undefined, page: 0 }))
  }
  const goToPage = (p) => {
    // NO reseteamos selectedIds → la selección es acumulativa entre páginas
    setFilters(f => ({ ...f, page: p }))
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const rawRows     = data?.rows  ?? []
  const total       = data?.total ?? 0

  // ── Enriquecer filas con ARS calculado y precio efectivo según proveedor ──
  const rows = useMemo(() => rawRows.map(r => {
    const efectivo = getPrecioEfectivo(r, precioFuente)
    const usdEfectivo = efectivo.usd ?? r.price_usd
    return {
      ...r,
      price_usd_efectivo:  usdEfectivo,
      precio_fuente_label: efectivo.label,
      precio_fuente_flag:  (FUENTE_LABELS[efectivo.fuente] ?? {}).flag ?? '💲',
      _ars_ofic: r.price_ars_oficial ?? (usdEfectivo != null && oficial ? Math.round(usdEfectivo * oficial) : null),
      _ars_blue: r.price_ars_blue    ?? (usdEfectivo != null && blue    ? Math.round(usdEfectivo * blue)    : null),
    }
  }), [rawRows, blue, oficial, precioFuente])

  const imageMap = usePrefetchPageImages(rows)

  // ── Market KPI batch (solo si plan pro) ──────────────────────────────────
  const kpiCardIds = useMemo(
    () => FEATURES.marketIntel ? rows.map(r => r.card_id).filter(Boolean) : [],
    [rows]
  )
  const { data: kpiMapReal = {} } = useMarketKpiBatch(kpiCardIds)

  // ── Demo KPI: genera datos simulados para previsualizar filtros/orden ────
  const KPI_STATES_DEMO = ['buyable', 'sell_now', 'normal', 'normal', 'normal']
  const demoKpiMap = useMemo(() => {
    if (!demoKpi) return {}
    const seed = (str = '') => {
      let h = 0
      for (let i = 0; i < str.length; i++) h = (Math.imul(31, h) + str.charCodeAt(i)) | 0
      return Math.abs(h)
    }
    const map = {}
    rows.forEach(r => {
      const s = seed(r.card_id || r.inventory_id || r.nombre || '')
      const score     = 20 + (s % 75)
      const demand    = 10 + ((s * 7)  % 85)
      const liquidity = 10 + ((s * 13) % 85)
      const trend     = 10 + ((s * 19) % 85)
      const supply    = 10 + ((s * 23) % 85)
      map[r.card_id]  = {
        kpi_score:               score,
        kpi_state:               KPI_STATES_DEMO[s % KPI_STATES_DEMO.length],
        kpi_demand_component:    demand,
        kpi_liquidity_component: liquidity,
        kpi_trend_component:     trend,
        kpi_supply_component:    supply,
        avg_listing_price_usd:   5 + (s % 50),
        active_listings:         1 + (s % 30),
        price_change_7d_pct:     (s % 20) - 8,
        snapshot_date:           new Date().toISOString().slice(0, 10),
      }
    })
    return map
  }, [rows, demoKpi])

  const kpiMap = demoKpi ? demoKpiMap : kpiMapReal

  const { sortCol, sortDir = 'asc' } = filters

  // ── Sort server-side: cambiar columna vuelve a página 0 ─────────────────
  const handleSort = (key) => {
    if (!key) return
    setSelectedIds(new Set())
    setFilters(f => {
      if (f.sortCol === key) {
        if (f.sortDir === 'asc') return { ...f, sortDir: 'desc', page: 0 }
        return { ...f, sortCol: null, sortDir: 'asc', page: 0 }
      }
      return { ...f, sortCol: key, sortDir: 'asc', page: 0 }
    })
  }

  // ── Sort / filter KPI client-side (sobre la página actual) ─────────────
  const sortedRows = useMemo(() => {
    let list = [...rows]

    if (kpiStateFilter) {
      list = list.filter(r => {
        const kpi = kpiMap[r.card_id]
        if (kpiStateFilter === 'con_datos') return kpi?.kpi_score != null
        if (kpiStateFilter === 'sin_datos') return !kpi || kpi.kpi_score == null
        return kpi?.kpi_state === kpiStateFilter
      })
    }

    if (kpiSort) {
      const getVal = (r) => {
        const kpi = kpiMap[r.card_id]
        if (!kpi) return -1
        switch (kpiSort) {
          case 'score':         return kpi.kpi_score               ?? -1
          case 'demand':        return kpi.kpi_demand_component    ?? -1
          case 'demand_asc':    return -(kpi.kpi_demand_component  ?? 999)
          case 'liquidity':     return kpi.kpi_liquidity_component ?? -1
          case 'liquidity_asc': return -(kpi.kpi_liquidity_component ?? 999)
          case 'trend':         return kpi.kpi_trend_component     ?? -1
          case 'price_asc':     return -(r.price_usd_efectivo      ?? 999)
          default: return -1
        }
      }
      list.sort((a, b) => getVal(b) - getVal(a))
    }

    return list
  }, [rows, kpiMap, kpiSort, kpiStateFilter])

  const currentPage = data?.page  ?? 0
  const totalPages  = Math.ceil(total / PAGE_SIZE)

  // allSelected = todas las cartas de la página actual están seleccionadas
  const allSelected  = rows.length > 0 && rows.every(r => selectedIds.has(r.inventory_id))
  const someSelected = selectedIds.size > 0

  const disponibles = rows.filter(r => r.status === 'disponible').length
  const reservadas  = rows.filter(r => r.status === 'reservada').length
  const valorUSD    = rows.reduce((s, r) => s + (r.price_usd || 0) * (r.stock || 1), 0)

  const toggleAll = () => {
    if (allSelected) {
      // Desseleccionar solo las de esta página (las de otras páginas quedan)
      setSelectedIds(prev => {
        const next = new Set(prev)
        rows.forEach(r => next.delete(r.inventory_id))
        return next
      })
    } else {
      // Agregar todas las de esta página a la selección existente
      setSelectedIds(prev => {
        const next = new Set(prev)
        rows.forEach(r => next.add(r.inventory_id))
        return next
      })
    }
  }

  const toggleOne = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  // ── Toast helper ────────────────────────────────────────────────────────
  const showToast = (mensaje, tipo = 'success') => {
    setToast({ visible: true, mensaje, tipo })
    setTimeout(() => setToast(t => ({ ...t, visible: false })), 2500)
  }

  // ── Guardar comprador inline (Feature 1) ─────────────────────────────────
  const saveBuyerName = async (inventoryId, nuevoNombre) => {
    const { error } = await supabase
      .from('inventory')
      .update({ buyer_name: nuevoNombre })
      .eq('id', inventoryId)
    if (!error) {
      queryClient.invalidateQueries({ queryKey: ['stock'] })
      showToast(t('stock_buyer_updated'))
    }
  }

  // ── Guardar precio de venta inline (Feature 2) ──────────────────────────
  const saveSalePrice = async (inventoryId, nuevoPrecio) => {
    const { error } = await supabase
      .from('inventory')
      .update({ sale_price_ars: nuevoPrecio })
      .eq('id', inventoryId)
    if (!error) {
      queryClient.invalidateQueries({ queryKey: ['stock'] })
      showToast(t('stock_price_updated'))
    }
  }

  // ── Acción: marcar como vendidas + registrar en sales ───────────────────
  const handleMarkSold = async (buyer, channel) => {
    setBulkLoading(true)
    const ids = [...selectedIds]
    const now = new Date().toISOString()

    // 1. Actualizar inventory (status + estado + comprador)
    await supabase
      .from('inventory')
      .update({
        status:     'vendida',
        estado:     'vendida',
        buyer_name: buyer || null,
      })
      .in('id', ids)

    // 2. Insertar en sales — una fila por carta
    const selectedRows = sortedRows.filter(r => ids.includes(r.inventory_id))
    const salesRows = selectedRows.map(r => ({
      store_id:     STORE_ID,
      channel:      channel      || 'fuera_de_evento',
      buyer_name:   buyer        || null,
      notes:        r.nombre     || '',
      total_ars:    r._ars_blue  ?? r._ars_ofic ?? null,
      sold_at:      now,
      estado:       'pendiente',
      inventory_id: r.inventory_id || null,
    }))

    if (salesRows.length > 0) {
      const { error: salesErr } = await supabase.from('sales').insert(salesRows)
      if (salesErr) {
        showToast(`Error al registrar en ventas: ${salesErr.message}`, 'error')
      } else {
        showToast(`${ids.length} carta${ids.length === 1 ? '' : 's'} vendida${ids.length === 1 ? '' : 's'} ✓`)
      }
    }

    queryClient.invalidateQueries({ queryKey: ['stock'] })
    queryClient.invalidateQueries({ queryKey: ['metricas'] })
    queryClient.invalidateQueries({ queryKey: ['ventas'] })
    setSelectedIds(new Set())
    setConfirmSell(false)
    setBulkBuyer('')
    setBulkLoading(false)
  }

  // ── Agregar al carrito de claim (solo disponibles de la página actual) ───
  const handleAddToClaim = () => {
    const toAdd = sortedRows.filter(r =>
      selectedIds.has(r.inventory_id) && r.status === 'disponible'
    )

    if (!toAdd.length) {
      showToast(t('stock_select_available'), 'error')
      return
    }

    setClaimCart(prev => {
      const next = new Map(prev)
      toAdd.forEach(r => {
        next.set(r.inventory_id, {
          ...r,
          // Capturar la mejor URL disponible en este momento (blob ya cacheado mientras estaba visible)
          image_url: getCardImageUrl(r.card_id) || r.image_url || imageMap[r.card_id] || '',
        })
      })
      return next
    })

    // Deseleccionar las cartas de esta página
    setSelectedIds(prev => {
      const next = new Set(prev)
      sortedRows.forEach(r => next.delete(r.inventory_id))
      return next
    })

    // Pre-calentar blobs en background (fire-and-forget, 6 a la vez)
    // Así cuando el usuario configure y genere el claim, muchos/todos ya están en cache
    const urlsToWarm = toAdd
      .map(r => getCardImageUrl(r.card_id) || r.image_url || imageMap[r.card_id] || '')
      .filter(Boolean)
    warmBlobUrls(urlsToWarm)   // sin await, corre en background

    showToast(`${toAdd.length} ${toAdd.length === 1 ? t('stock_card_singular') : t('stock_card_plural')} ${toAdd.length === 1 ? t('stock_claim_added') : t('stock_claim_added_plural')}`)
  }

  // ── Abrir carrito review → luego el usuario puede continuar al generador ─
  const handleOpenClaim = () => {
    if (!claimCart.size) return
    setShowCartModal(true)
  }

  // ── Desde el carrito review, continuar a ClaimOptionsModal ───────────────
  const handleContinueToGenerator = () => {
    if (!claimCart.size) return
    const cards = [...claimCart.values()].map(r => ({
      ...r,
      image_url: getCardImageUrl(r.card_id) || r.image_url || '',
    }))
    warmBlobUrls(cards.map(c => c.image_url).filter(Boolean))
    setClaimCards(cards)
    setShowCartModal(false)
  }

  // ── Quitar una carta individual del carrito ──────────────────────────────
  const handleRemoveFromCart = (inventoryId) => {
    setClaimCart(prev => {
      const next = new Map(prev)
      next.delete(inventoryId)
      return next
    })
  }

  // ── Acción: eliminar ────────────────────────────────────────────────────
  const handleDelete = async () => {
    setBulkLoading(true)
    const ids = [...selectedIds]
    await supabase.from('inventory').delete().in('id', ids)
    queryClient.invalidateQueries({ queryKey: ['stock'] })
    queryClient.invalidateQueries({ queryKey: ['metricas'] })
    setSelectedIds(new Set())
    setConfirmDel(false)
    setBulkLoading(false)
  }

  return (
    <div className="space-y-4 pb-28">

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: t('stock_kpi_total'),     value: (m?.totalCartas ?? 0).toLocaleString('es-AR'), sub: t('stock_kpi_in_stock'),   color: 'text-blue-600'    },
          { label: t('stock_kpi_available'), value: disponibles.toLocaleString('es-AR'),           sub: t('stock_kpi_for_sale'),   color: 'text-emerald-600' },
          { label: t('stock_kpi_reserved'),  value: reservadas.toLocaleString('es-AR'),            sub: t('stock_kpi_to_deliver'), color: 'text-amber-500'   },
          { label: t('stock_kpi_value'),     value: `$${valorUSD.toLocaleString('en', { maximumFractionDigits: 0 })}`, sub: t('stock_kpi_usd'), color: 'text-gray-800' },
        ].map(k => (
          <div key={k.label} className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm">
            <p className="text-xs text-gray-400 mb-1">{k.label}</p>
            <p className={`text-2xl font-extrabold ${k.color}`}>{k.value}</p>
            <p className="text-xs text-gray-400 mt-0.5">{k.sub}</p>
          </div>
        ))}
      </div>

      {/* ── Carrito de claim ─────────────────────────────────────────────── */}
      <AnimatePresence>
        {claimCart.size > 0 && (
          <motion.div
            key="claim-cart-bar"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{    opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
            className="flex items-center gap-2"
          >
            <button
              onClick={handleOpenClaim}
              className="flex-1 flex items-center justify-center gap-2
                         py-3 px-5 bg-violet-600 hover:bg-violet-500
                         text-white font-bold text-sm rounded-2xl shadow-md transition"
            >
              🃏 {t('stock_claim_cart_label')} · {claimCart.size} {claimCart.size === 1 ? t('stock_card_singular') : t('stock_card_plural')}
              <span className="text-violet-300 text-xs font-normal ml-1">{t('stock_claim_cart_view')}</span>
            </button>
            <button
              onClick={() => setClaimCart(new Map())}
              title="Vaciar carrito"
              className="p-3 bg-white border border-gray-200 hover:bg-red-50
                         hover:border-red-200 text-gray-400 hover:text-red-400
                         rounded-2xl shadow-sm transition text-sm"
            >
              🗑
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Filtros */}
      <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm">
        <div className="flex flex-wrap gap-2">
          <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
            {[
              { v: '',           l: t('stock_status_all')       },
              { v: 'disponible', l: t('stock_status_available') },
              { v: 'reservada',  l: t('stock_status_reserved')  },
              { v: 'vendida',    l: t('stock_status_sold')      },
            ].map(e => (
              <button key={e.v} onClick={() => set('estado', e.v)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition
                  ${(filters.estado ?? '') === e.v
                    ? 'bg-white shadow text-gray-800'
                    : 'text-gray-500 hover:text-gray-700'}`}>
                {e.l}
              </button>
            ))}
          </div>
          <input type="text" placeholder={t('stock_search_placeholder')}
            onChange={e => set('busqueda', e.target.value)}
            className="border border-gray-200 rounded-xl px-3 py-1.5 text-sm flex-1 min-w-40
                       focus:outline-none focus:ring-2 focus:ring-blue-200" />
          {/* Wrapper helper para selects con flecha custom centrada */}
          <div className="relative shrink-0">
            <select onChange={e => set('idioma', e.target.value)}
              className="appearance-none border border-gray-200 rounded-xl pl-3 pr-7 py-1.5 text-sm bg-white cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-200">
              <option value="">{t('stock_filter_language')}</option>
              {IDIOMAS.map(i => <option key={i.code} value={i.code}>{i.flag} {i.label}</option>)}
            </select>
            <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-[10px]">▾</span>
          </div>
          <div className="relative shrink-0">
            <select onChange={e => set('condicion', e.target.value)}
              className="appearance-none border border-gray-200 rounded-xl pl-3 pr-7 py-1.5 text-sm bg-white cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-200">
              <option value="">{t('stock_filter_condition')}</option>
              {CONDICIONES.map(c => <option key={c}>{c}</option>)}
            </select>
            <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-[10px]">▾</span>
          </div>

          {/* ── Controles KPI (solo plan pro) ── */}
          {FEATURES.marketIntel && (<>
            <div className="relative shrink-0">
              <select
                value={kpiStateFilter}
                onChange={e => setKpiStateFilter(e.target.value)}
                className={`appearance-none rounded-xl pl-3 pr-7 py-1.5 text-sm cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-200 transition
                  ${kpiStateFilter
                    ? 'border border-blue-300 bg-blue-50 text-blue-700 font-semibold'
                    : 'border border-gray-200 bg-white'}`}
              >
                <option value="">📡 Señal mercado</option>
                <option value="con_datos">✅ Con datos KPI</option>
                <option value="buyable">🟢 Buen momento de compra</option>
                <option value="sell_now">🔴 Momento de vender</option>
                <option value="normal">🟡 Mercado estable</option>
                <option value="sin_datos">⬜ Sin datos aún</option>
              </select>
              <span className={`pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px]
                ${kpiStateFilter ? 'text-blue-400' : 'text-gray-400'}`}>▾</span>
            </div>

            <div className="relative shrink-0">
              <select
                value={kpiSort}
                onChange={e => setKpiSort(e.target.value)}
                className={`appearance-none rounded-xl pl-3 pr-7 py-1.5 text-sm cursor-pointer focus:outline-none focus:ring-2 focus:ring-purple-200 transition
                  ${kpiSort
                    ? 'border border-purple-300 bg-purple-50 text-purple-700 font-semibold'
                    : 'border border-gray-200 bg-white'}`}
              >
                <option value="">↕ Ordenar por KPI</option>
                <option value="score">⭐ Mayor oportunidad</option>
                <option value="demand">🔥 Más demanda</option>
                <option value="demand_asc">📉 Menos demanda</option>
                <option value="liquidity">💧 Más líquida</option>
                <option value="liquidity_asc">🐢 Menos líquida</option>
                <option value="trend">📈 Precio subiendo</option>
                <option value="price_asc">💲 Precio más bajo</option>
              </select>
              <span className={`pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px]
                ${kpiSort ? 'text-purple-400' : 'text-gray-400'}`}>▾</span>
            </div>

            {/* Toggle demo KPI */}
            <button
              onClick={() => setDemoKpi(v => !v)}
              title="Activar datos de ejemplo para previsualizar filtros y orden KPI"
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold transition
                ${demoKpi
                  ? 'border-amber-400 bg-amber-50 text-amber-700 shadow-sm'
                  : 'border-gray-200 bg-white text-gray-500 hover:border-amber-300 hover:text-amber-600'}`}
            >
              {demoKpi ? t('stock_demo_on') : t('stock_demo_kpi')}
            </button>

            {/* Chip activo — reset rápido */}
            {(kpiSort || kpiStateFilter) && (
              <button
                onClick={() => { setKpiSort(''); setKpiStateFilter('') }}
                className="flex items-center gap-1 px-3 py-1.5 rounded-xl border border-red-200
                           bg-red-50 text-red-500 text-xs font-semibold hover:bg-red-100 transition"
              >
                {t('stock_clear_kpi')}
              </button>
            )}
          </>)}
        </div>
      </div>

      {/* Banner Demo KPI */}
      {FEATURES.marketIntel && demoKpi && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-2.5
                        flex items-center justify-between text-xs">
          <span className="text-amber-700 font-medium flex items-center gap-2">
            🟡 <strong>{t('stock_demo_banner')}</strong>
            <span className="text-amber-500 font-normal">— {t('stock_demo_banner_sub')}</span>
          </span>
          <button onClick={() => setDemoKpi(false)}
                  className="text-amber-400 hover:text-amber-700 font-bold transition ml-3">
            ✕
          </button>
        </div>
      )}

      {/* Banner KPI activo */}
      {FEATURES.marketIntel && (kpiSort || kpiStateFilter) && (
        <div className="bg-purple-50 border border-purple-100 rounded-2xl px-4 py-2.5
                        flex items-center justify-between text-xs">
          <span className="text-purple-700 font-medium flex items-center gap-1.5">
            📡
            {kpiSort && (
              <span>
                Orden KPI: <strong>{{
                  score: '⭐ Mayor oportunidad',
                  demand: '🔥 Más demanda',
                  demand_asc: '📉 Menos demanda',
                  liquidity: '💧 Más líquida',
                  liquidity_asc: '🐢 Menos líquida',
                  trend: '📈 Precio subiendo',
                  price_asc: '💲 Precio más bajo',
                }[kpiSort]}</strong>
              </span>
            )}
            {kpiSort && kpiStateFilter && <span className="text-purple-400 mx-1">·</span>}
            {kpiStateFilter && (
              <span>
                Señal: <strong>{{
                  con_datos: '✅ Con datos',
                  buyable: '🟢 Compra',
                  sell_now: '🔴 Vender',
                  normal: '🟡 Estable',
                  sin_datos: '⬜ Sin datos',
                }[kpiStateFilter]}</strong>
              </span>
            )}
            <span className="text-purple-400 ml-1">(página actual)</span>
          </span>
          <button onClick={() => { setKpiSort(''); setKpiStateFilter('') }}
                  className="text-purple-400 hover:text-purple-700 font-semibold transition">
            ✕
          </button>
        </div>
      )}

      {/* Tabla */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        {isLoading && <div className="flex justify-center py-16"><Spinner size={32} className="text-blue-400" /></div>}
        {error     && <p className="text-red-500 text-sm p-6">Error: {error.message}</p>}
        {!isLoading && !error && rows.length === 0 && (
          <EmptyState emoji="📭" title={t('no_results')} sub={t('try_filters')} />
        )}
        {!isLoading && !error && rows.length > 0 && sortedRows.length === 0 && (
          <EmptyState emoji="📡" title={t('stock_no_kpi_results')} sub={t('stock_no_kpi_sub')} />
        )}

        {!isLoading && sortedRows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 text-gray-400 uppercase sticky top-0 z-10">
                <tr>
                  <th className="pl-4 pr-2 py-3">
                    <input type="checkbox" checked={allSelected} onChange={toggleAll}
                      className="w-3.5 h-3.5 rounded accent-blue-600 cursor-pointer" />
                  </th>
                  {COLS.map(col => (
                    <th key={col.h}
                      onClick={() => handleSort(col.key)}
                      className={`px-3 py-3 text-left font-semibold whitespace-nowrap select-none
                        ${col.key ? 'cursor-pointer hover:text-gray-600 hover:bg-gray-100 transition' : ''}`}>
                      <span className="inline-flex items-center gap-1">
                        {col.h}
                        {col.key && sortCol === col.key && (
                          <span className="text-blue-500">{sortDir === 'asc' ? '↑' : '↓'}</span>
                        )}
                        {col.key && sortCol !== col.key && (
                          <span className="text-gray-300 opacity-0 group-hover:opacity-100">↕</span>
                        )}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sortedRows.map(r => {
                  const isSelected = selectedIds.has(r.inventory_id)
                  return (
                    <tr key={r.inventory_id}
                      className={`transition ${isSelected ? 'bg-blue-50' : 'hover:bg-gray-50'}`}>
                      {/* Checkbox fila */}
                      <td className="pl-4 pr-2 py-2">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleOne(r.inventory_id)}
                          className="w-3.5 h-3.5 rounded accent-blue-600 cursor-pointer"
                        />
                      </td>
                      {/* Imagen — click abre el panel de detalle / precio */}
                      <td className="px-3 py-2">
                        <CardImage
                          imageUrl={r.image_url || imageMap[r.card_id]}
                          cardId={r.card_id}
                          nombre={r.nombre}
                          numero={r.numero}
                          idioma={r.idioma}
                          setName={r.set_name}
                          onOpen={(imgs) => setPriceCard({ ...r, image_url: imgs?.src || r.image_url })}
                        />
                      </td>
                      <td className="px-3 py-2 font-medium text-gray-800 max-w-[140px]">
                        <span className="truncate block">{r.nombre || '—'}</span>
                      </td>
                      <td className="px-3 py-2 text-gray-500 max-w-[100px]">
                        <span className="truncate block">{translateSetName(r.set_name) || '—'}</span>
                      </td>
                      <td className="px-3 py-2 text-gray-500">{r.numero || '—'}</td>
                      <td className="px-3 py-2 text-center">{IDIOMA_FLAG[r.idioma] ?? r.idioma ?? '—'}</td>
                      <td className="px-3 py-2 text-center">{r.holo ? '✨' : '—'}</td>
                      <td className="px-3 py-2"><Badge label={r.condicion} /></td>
                      <td className="px-3 py-2 font-semibold text-gray-700 text-center">{r.stock}</td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <div className="flex items-center gap-1">
                          {FEATURES.marketIntel ? (
                            <button
                              onClick={() => setPriceCard(r)}
                              title="Ver historial de precio y KPI de mercado"
                              className="text-emerald-600 font-semibold hover:underline hover:text-emerald-700 transition cursor-pointer"
                            >
                              {fmtUSD(r.price_usd_efectivo ?? r.price_usd)}
                            </button>
                          ) : (
                            <span className="text-emerald-600 font-semibold">
                              {fmtUSD(r.price_usd_efectivo ?? r.price_usd)}
                            </span>
                          )}
                          <span className="text-[10px] text-gray-400 leading-none">{r.precio_fuente_flag}</span>
                        </div>
                        {/* KPI badge inline (solo plan pro, si hay datos) */}
                        {FEATURES.marketIntel && r.card_id && kpiMap[r.card_id]?.kpi_score != null && (
                          <div className="mt-0.5">
                            <MarketKpiBadge
                              kpiScore={kpiMap[r.card_id].kpi_score}
                              kpiState={kpiMap[r.card_id].kpi_state}
                              size="sm"
                            />
                            {/* Chip del componente activo si hay kpiSort */}
                            {kpiSort && kpiSort !== 'price_asc' && (() => {
                              const kd = kpiMap[r.card_id]
                              const val = {
                                score: kd.kpi_score,
                                demand: kd.kpi_demand_component,
                                demand_asc: kd.kpi_demand_component,
                                liquidity: kd.kpi_liquidity_component,
                                liquidity_asc: kd.kpi_liquidity_component,
                                trend: kd.kpi_trend_component,
                              }[kpiSort]
                              const label = {
                                score: '⭐', demand: '🔥', demand_asc: '🔥',
                                liquidity: '💧', liquidity_asc: '💧', trend: '📈',
                              }[kpiSort]
                              if (val == null) return null
                              return (
                                <span className="text-[9px] text-gray-400 font-medium ml-0.5">
                                  {label}{Math.round(val)}
                                </span>
                              )
                            })()}
                          </div>
                        )}
                        {/* Mini selector de proveedor por carta */}
                        {r.precios_fuentes && Object.keys(r.precios_fuentes).length > 1 && (
                          <select
                            value={r.precio_fuente_override ?? precioFuente}
                            onChange={async (e) => {
                              await supabase.from('inventory')
                                .update({ precio_fuente_override: e.target.value })
                                .eq('id', r.inventory_id)
                              queryClient.invalidateQueries({ queryKey: ['stock'] })
                            }}
                            className="text-[10px] text-gray-400 bg-transparent border-none outline-none cursor-pointer"
                          >
                            {Object.entries(r.precios_fuentes).map(([k, v]) => (
                              <option key={k} value={k}>{v.label} ${v.usd?.toFixed(2)}</option>
                            ))}
                          </select>
                        )}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <span className={r.price_ars_oficial != null ? 'text-gray-600' : 'text-gray-400'}>
                          {fmtARS(r._ars_ofic)}
                        </span>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <span className={`font-semibold ${r.price_ars_blue != null ? 'text-blue-600' : 'text-blue-400'}`}>
                          {fmtARS(r._ars_blue)}
                        </span>
                      </td>
                      {/* P. Venta editable (Feature 2) */}
                      <td className="px-3 py-2 whitespace-nowrap">
                        <InlineEdit
                          value={r.sale_price_ars ?? r.precio_venta ?? null}
                          type="number"
                          placeholder={t('stock_price_ph_none')}
                          formatDisplay={v => v != null ? fmtARS(v) : null}
                          onSave={v => saveSalePrice(r.inventory_id, v)}
                        />
                      </td>
                      <td className="px-3 py-2"><Badge label={r.status} /></td>
                      {/* Comprador editable solo si está reservada (Feature 1) */}
                      <td className="px-3 py-2 text-gray-600">
                        {r.status === 'reservada'
                          ? <InlineEdit
                              value={r.buyer_name ?? null}
                              type="text"
                              placeholder={t('stock_buyer_ph_none')}
                              onSave={v => saveBuyerName(r.inventory_id, v)}
                            />
                          : (r.buyer_name || '—')
                        }
                      </td>
                      <td className="px-3 py-2 text-gray-500">{r.buyer_contact || '—'}</td>
                      <td className="px-3 py-2 text-gray-400 max-w-[100px]">
                        <span className="truncate block">{r.notes || '—'}</span>
                      </td>
                      <td className="px-3 py-2 text-gray-400 whitespace-nowrap">{fmtFecha(r.reserved_at)}</td>
                      <td className="px-3 py-2 text-gray-400 whitespace-nowrap">{fmtFecha(r.fecha_escaneada)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Panel lateral: detalle de carta + historial de precio */}
      <CardPriceModal card={priceCard} onClose={() => setPriceCard(null)} />

      {/* Carrito review modal */}
      {showCartModal && (
        <ClaimCartModal
          cart={claimCart}
          onClose={() => setShowCartModal(false)}
          onContinue={handleContinueToGenerator}
          onRemove={handleRemoveFromCart}
          onClear={() => setClaimCart(new Map())}
        />
      )}

      {/* Modal claim (generación) */}
      {claimCards && (
        <ClaimOptionsModal
          cards={claimCards}
          onClose={() => setClaimCards(null)}
          onConfirmed={() => {
            setClaimCards(null)
            setClaimCart(new Map())   // vaciar carrito después de confirmar
            showToast('Claim guardado correctamente ✓')
          }}
        />
      )}

      {/* Toast */}
      <Toast mensaje={toast.mensaje} tipo={toast.tipo} visible={toast.visible} />

      {/* ── Paginador flotante ──────────────────────────────────────────────── */}
      {totalPages > 1 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40
                        flex items-center gap-2 px-4 py-2
                        bg-white border border-gray-200 rounded-2xl shadow-lg
                        text-xs text-gray-500">
          <span className="hidden sm:block whitespace-nowrap font-medium text-gray-400 mr-1">
            {(m?.totalCartas ?? total).toLocaleString('es-AR')} cartas
          </span>
          <div className="w-px h-4 bg-gray-200 hidden sm:block" />

          <button onClick={() => goToPage(0)} disabled={currentPage === 0}
            className="px-1.5 py-1 rounded-lg hover:bg-gray-100 disabled:opacity-30 transition font-bold">
            «
          </button>
          <button onClick={() => goToPage(currentPage - 1)} disabled={currentPage === 0}
            className="px-2 py-1 rounded-lg hover:bg-gray-100 disabled:opacity-30 transition">
            ‹
          </button>

          {Array.from({ length: totalPages }, (_, i) => i)
            .filter(i => Math.abs(i - currentPage) <= 2)
            .map(i => (
              <button key={i} onClick={() => goToPage(i)}
                className={`w-7 h-7 rounded-lg text-xs font-semibold transition
                  ${i === currentPage
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'hover:bg-gray-100 text-gray-600'}`}>
                {i + 1}
              </button>
            ))
          }

          <button onClick={() => goToPage(currentPage + 1)} disabled={currentPage >= totalPages - 1}
            className="px-2 py-1 rounded-lg hover:bg-gray-100 disabled:opacity-30 transition">
            ›
          </button>
          <button onClick={() => goToPage(totalPages - 1)} disabled={currentPage >= totalPages - 1}
            className="px-1.5 py-1 rounded-lg hover:bg-gray-100 disabled:opacity-30 transition font-bold">
            »
          </button>

          <div className="w-px h-4 bg-gray-200" />
          <span className="whitespace-nowrap text-gray-400">
            {currentPage + 1} / {totalPages}
          </span>
        </div>
      )}

      {/* ── Barra de acciones bulk ──────────────────────────────────────────── */}
      <AnimatePresence>
        {someSelected && !confirmDel && (
          <motion.div
            key="bulk-bar"
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0,  opacity: 1 }}
            exit={{    y: 80, opacity: 0 }}
            transition={{ type: 'spring', damping: 22, stiffness: 300 }}
            className={`fixed left-1/2 -translate-x-1/2 z-50
                       flex items-center gap-3 px-5 py-3
                       bg-gray-900 text-white rounded-2xl shadow-2xl
                       ${totalPages > 1 ? 'bottom-[96px]' : 'bottom-6'}`}
          >
            <span className="text-sm font-semibold whitespace-nowrap">
              {selectedIds.size} {selectedIds.size === 1 ? t('stock_card_singular') : t('stock_card_plural')}
            </span>
            <div className="w-px h-5 bg-white/20" />
            <button
              onClick={() => setConfirmSell(true)}
              disabled={bulkLoading}
              className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400
                         disabled:opacity-50 rounded-xl text-xs font-semibold transition whitespace-nowrap">
              {t('stock_bulk_mark_sold')}
            </button>
            <button
              onClick={handleAddToClaim}
              disabled={bulkLoading}
              className="px-3 py-1.5 bg-violet-500 hover:bg-violet-400
                         disabled:opacity-50 rounded-xl text-xs font-semibold transition whitespace-nowrap">
              {t('stock_bulk_add_claim')}
            </button>
            <button
              onClick={() => setConfirmDel(true)}
              disabled={bulkLoading}
              className="px-3 py-1.5 bg-red-500 hover:bg-red-400
                         disabled:opacity-50 rounded-xl text-xs font-semibold transition">
              {t('stock_bulk_delete')}
            </button>
            <button
              onClick={() => setSelectedIds(new Set())}
              className="w-6 h-6 flex items-center justify-center rounded-full
                         bg-white/10 hover:bg-white/20 text-white/70 text-base transition">
              ×
            </button>
          </motion.div>
        )}

        {/* Confirmación venta — canal + comprador */}
        {confirmSell && (
          <motion.div
            key="confirm-sell-bar"
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0,  opacity: 1 }}
            exit={{    y: 80, opacity: 0 }}
            transition={{ type: 'spring', damping: 22, stiffness: 300 }}
            className={`fixed left-1/2 -translate-x-1/2 z-50
                       flex flex-wrap items-center gap-2 px-4 py-3
                       bg-emerald-700 text-white rounded-2xl shadow-2xl
                       ${totalPages > 1 ? 'bottom-[96px]' : 'bottom-6'}`}
          >
            <span className="text-xs font-semibold whitespace-nowrap">
              ✓ {selectedIds.size} {selectedIds.size === 1 ? t('stock_card_singular') : t('stock_card_plural')} {selectedIds.size === 1 ? t('stock_sold_toast') : t('stock_sold_plural')} ·
            </span>
            <select
              value={bulkChannel}
              onChange={e => setBulkChannel(e.target.value)}
              className="border border-emerald-500 rounded-lg px-2 py-1 text-xs
                         bg-emerald-600 text-white focus:outline-none focus:ring-2 focus:ring-emerald-300"
            >
              {CANALES_VENTA.map(c => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
            <input
              autoFocus
              type="text"
              placeholder={t('stock_bulk_buyer_ph')}
              value={bulkBuyer}
              onChange={e => setBulkBuyer(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleMarkSold(bulkBuyer, bulkChannel)}
              className="border border-emerald-500 rounded-lg px-2.5 py-1 text-xs
                         bg-emerald-600 text-white placeholder-emerald-300
                         focus:outline-none focus:ring-2 focus:ring-emerald-300 min-w-[130px]"
            />
            <button
              onClick={() => handleMarkSold(bulkBuyer, bulkChannel)}
              disabled={bulkLoading}
              className="px-3 py-1.5 bg-white text-emerald-700 hover:bg-emerald-50
                         disabled:opacity-50 rounded-xl text-xs font-bold transition whitespace-nowrap"
            >
              {bulkLoading ? '…' : t('stock_bulk_confirm_sell')}
            </button>
            <button
              onClick={() => { setConfirmSell(false); setBulkBuyer('') }}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500
                         rounded-xl text-xs font-semibold transition"
            >
              {t('cancel')}
            </button>
          </motion.div>
        )}

        {/* Confirmación eliminar */}
        {confirmDel && (
          <motion.div
            key="confirm-bar"
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0,  opacity: 1 }}
            exit={{    y: 80, opacity: 0 }}
            transition={{ type: 'spring', damping: 22, stiffness: 300 }}
            className={`fixed left-1/2 -translate-x-1/2 z-50
                       flex items-center gap-3 px-5 py-3
                       bg-red-600 text-white rounded-2xl shadow-2xl
                       ${totalPages > 1 ? 'bottom-[96px]' : 'bottom-6'}`}
          >
            <span className="text-sm font-semibold whitespace-nowrap">
              {t('stock_bulk_delete_confirm').replace('{n}', selectedIds.size).replace('{cards}', selectedIds.size === 1 ? t('stock_card_singular') : t('stock_card_plural'))}
            </span>
            <button
              onClick={handleDelete}
              disabled={bulkLoading}
              className="px-3 py-1.5 bg-white text-red-600 hover:bg-red-50
                         disabled:opacity-50 rounded-xl text-xs font-bold transition">
              {bulkLoading ? '…' : t('yes_delete')}
            </button>
            <button
              onClick={() => setConfirmDel(false)}
              className="px-3 py-1.5 bg-white/20 hover:bg-white/30
                         rounded-xl text-xs font-semibold transition">
              {t('cancel')}
            </button>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  )
}
