import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { STORE_ID } from '../constants'

const PAGE_SIZE = 50

// Mapeo de key de columna UI → columna real en Supabase
// table: null → columna directa de inventory (sort server-side)
// table: 'cards' → columna de tabla relacionada (sort server-side via foreignTable)
const SORT_MAP = {
  nombre:       { col: 'name_en',           table: 'cards',    foreignTable: true  },
  set_name:     { col: 'set_name',          table: 'cards',    foreignTable: true  },
  numero:       { col: 'card_number',       table: 'cards',    foreignTable: true  },
  idioma:       { col: 'language',          table: 'cards',    foreignTable: true  },
  holo:         { col: 'is_holo',           table: 'cards',    foreignTable: true  },
  condicion:    { col: 'condition',         table: null                            },
  stock:        { col: 'quantity',          table: null                            },
  // USD/ARS: el server ordena por price_usd (reconciliado al USD efectivo por el
  // job diario). ARS ofic/blue = USD × cotización (mismo factor para todas), así
  // que ordenar por price_usd da el MISMO orden visual y nunca depende de las
  // columnas price_ars_* que pueden quedar viejas. P.Venta → sale_price_ars (lo
  // que realmente se muestra). Esto mantiene el orden consistente en TODAS las páginas.
  price_usd:    { col: 'price_usd',     table: null },
  _ars_ofic:    { col: 'price_usd',     table: null },
  _ars_blue:    { col: 'price_usd',     table: null },
  precio_venta: { col: 'sale_price_ars', table: null },
  status:       { col: 'status',            table: null                            },
  buyer_name:   { col: 'buyer_name',        table: null                            },
}

// Etiqueta de filtro (negocio) → estados reales de market_signals.kpi_state
const KPI_FILTER_STATES = {
  buyable:  ['mercado_frio', 'saturada'],   // precio bajo / cae → conviene comprar
  sell_now: ['subida_sana', 'explotada'],   // precio alto / pico → conviene vender
  normal:   ['normal'],
}

export function useStock(filters = {}) {
  const { estado, busqueda, idioma, condicion, page = 0, sortCol, sortDir = 'asc',
          kpiFilter = null } = filters

  return useQuery({
    queryKey: ['stock', filters],
    queryFn: async () => {
      // Usamos cards!inner cuando hay filtros sobre cards O cuando el sort
      // es por una columna de cards (foreignTable sort requiere !inner)
      const sortDef0        = sortCol ? SORT_MAP[sortCol] : null
      // Filtro por señal de mercado (KPI) — vía embed anidado cards→market_signals_latest.
      const kpiStates       = kpiFilter ? (KPI_FILTER_STATES[kpiFilter] || null) : null
      const kpiConDatos     = kpiFilter === 'con_datos'
      const kpiActive       = !!(kpiStates || kpiConDatos)   // 'sin_datos' no soportado server-side
      const needsCardFilter = !!(busqueda || idioma || sortDef0?.foreignTable || kpiActive)
      const cardJoin        = needsCardFilter ? 'cards!inner' : 'cards'
      // Embed de la señal dentro de cards (solo cuando se filtra por KPI)
      const kpiEmbed        = kpiActive ? ', market_signals_latest!inner(kpi_state)' : ''

      // ── Aplica todos los filtros a un query builder ────────────────────────
      const applyFilters = (q) => {
        // Columnas de inventory
        if (estado)    q = q.or(`status.eq.${estado},and(status.is.null,estado.eq.${estado})`)
        // En vista "Disponible" ocultamos las cartas sin stock físico (quantity = 0)
        if (estado === 'disponible') q = q.gt('quantity', 0)
        if (condicion) q = q.or(`condition.eq.${condicion},condicion.eq.${condicion}`)

        // Filtro de idioma — server-side sobre cards
        if (idioma) {
          const l = idioma.toLowerCase()
          const variants =
            (l === 'jp' || l === 'ja') ? 'language.eq.jp,language.eq.ja' :
            (l === 'cn' || l === 'zh') ? 'language.eq.cn,language.eq.zh' :
            `language.eq.${l}`
          q = q.or(variants, { referencedTable: 'cards' })
        }

        // Búsqueda de texto — server-side sobre cards (todas las páginas)
        if (busqueda) {
          const term = busqueda.trim()
            .replace(/\\/g, '\\\\')
            .replace(/%/g, '\\%')
            .replace(/_/g, '\\_')
          // Si el término tiene formato XXX/XXX (ej: "078/217"), normalizar → "78"
          const numNorm = /^\d+\/\d+$/.test(term)
            ? String(parseInt(term.split('/')[0], 10))
            : term
          const numFilter = numNorm !== term
            ? `name.ilike.%${term}%,name_en.ilike.%${term}%,set_name.ilike.%${term}%,card_number.ilike.%${term}%,card_number.ilike.%${numNorm}%`
            : `name.ilike.%${term}%,name_en.ilike.%${term}%,set_name.ilike.%${term}%,card_number.ilike.%${term}%`
          q = q.or(numFilter, { referencedTable: 'cards' })
        }

        // Filtro por señal de mercado (KPI) — server-side, sobre TODO el stock,
        // vía embed anidado cards → market_signals_latest (sin listas gigantes de id).
        if (kpiStates) {
          q = q.in('cards.market_signals_latest.kpi_state', kpiStates)
        } else if (kpiConDatos) {
          q = q.neq('cards.market_signals_latest.kpi_state', 'sin_datos')
        }

        return q
      }

      const selectFields = `
        id,
        quantity,
        condition,
        condicion,
        idioma,
        status,
        estado,
        price_usd,
        price_ars_blue,
        price_ars_oficial,
        sale_price_ars,
        precios_fuentes,
        precio_fuente_override,
        buyer_name,
        buyer_contact,
        comprador,
        contacto,
        notas,
        sale_notes,
        reserved_at,
        fecha_reserva,
        scanned_at,
        scan_date,
        updated_at,
        tags,
        holo,
        finish,
        grade,
        product_type,
        sealed_product_id,
        ${cardJoin} (
          id,
          name,
          name_en,
          full_name,
          set_name,
          card_number,
          image_url,
          language,
          is_holo,
          variant${kpiEmbed}
        ),
        sealed_products (
          id,
          name,
          set_name,
          product_type,
          image_url
        )
      `

      // ── Count total (para mostrar X/N) ────────────────────────────────────
      let countQ = supabase
        .from('inventory')
        .select(
          kpiActive ? `id, cards!inner(id${kpiEmbed})`
                    : needsCardFilter ? 'id, cards!inner(id)' : 'id',
          { count: 'exact', head: true }
        )
        .eq('store_id', STORE_ID)
      countQ = applyFilters(countQ)
      const { count: totalCount } = await countQ

      // Re-resolver sortDef después de determinar cardJoin
      const sortDef = sortCol ? SORT_MAP[sortCol] : null

      // ── Datos paginados ───────────────────────────────────────────────────
      const from = page * PAGE_SIZE
      const to   = from + PAGE_SIZE - 1

      let q = supabase
        .from('inventory')
        .select(selectFields)
        .eq('store_id', STORE_ID)
      q = applyFilters(q)

      // ── Ordenamiento — siempre server-side ───────────────────────────────
      const asc = sortDir !== 'desc'

      if (sortDef) {
        if (sortDef.foreignTable) {
          // Ordenar las filas PADRE (inventory) por una columna de cards (relación
          // to-one) requiere la sintaxis top-level: order=cards(col). El
          // `referencedTable` de supabase-js genera `cards.order=col`, que solo
          // ordena el embed y NO reordena el inventory → el sort por Set/Nombre/
          // N°/Idioma no hacía nada. Spelling explícito = orden global real.
          q = q.order(`cards(${sortDef.col})`, { ascending: asc, nullsFirst: false })
        } else {
          q = q.order(sortDef.col, { ascending: asc, nullsFirst: false })
        }
      }
      // Siempre agregar orden secundario por id para paginación estable
      q = q.order('id', { ascending: false })

      // Paginación siempre server-side
      q = q.range(from, to)

      const { data, error } = await q
      if (error) throw error

      const rows = (data ?? []).map(r => {
        const sealed = r.product_type === 'sealed' ? (r.sealed_products || {}) : null
        const c = r.cards
        // Para JP/CN mostramos el nombre en inglés (name_en) si existe; EN ya es inglés.
        const lang = (c?.language || 'en').toLowerCase()
        const isEn = lang === 'en'
        const nombreCarta = isEn
          ? (c?.name || c?.full_name || '')
          : (c?.name_en || c?.name || c?.full_name || '')
        return {
        inventory_id:      r.id,
        card_id:           r.cards?.id || null,
        // Tipo de producto
        product_type:      r.product_type || 'single',
        sealed_type:       sealed?.product_type || null,
        // Carta o Sellado
        nombre:            sealed ? (sealed.name || '') : nombreCarta,
        nombre_local:      sealed ? '' : (c?.name || ''),   // nombre original (JP/CN) por si se quiere mostrar
        set_name:          sealed ? (sealed.set_name || '') : (r.cards?.set_name || ''),
        numero:            r.cards?.card_number || '',
        idioma:            r.idioma || r.cards?.language || 'en',   // override de inventory si existe
        holo:              r.holo   || false,
        finish:            r.finish || 'normal',   // 'normal' | 'holofoil' | 'reverse'
        grade:             r.grade  || 'ungraded', // 'ungraded' | 'psa9' | 'psa10' | 'bgs10'
        image_url:         sealed ? (sealed.image_url || '') : (r.cards?.image_url || ''),
        // Inventario
        condicion:          r.condition || r.condicion || '',
        stock:              r.quantity ?? 1,
        price_usd:          r.price_usd,
        price_ars_blue:     r.price_ars_blue,
        price_ars_oficial:  r.price_ars_oficial,
        sale_price_ars:     r.sale_price_ars ?? null,
        precio_venta:       r.sale_price_ars ?? r.price_ars_blue,
        precios_fuentes:    r.precios_fuentes || {},
        precio_fuente_override: r.precio_fuente_override || null,
        status:             r.status || r.estado || '',
        // Reserva / comprador
        buyer_name:        r.buyer_name || r.comprador || '',
        buyer_contact:     r.buyer_contact || r.contacto || '',
        notes:             r.notas || r.sale_notes || '',
        reserved_at:       r.reserved_at || r.fecha_reserva || '',
        fecha_escaneada:   r.scanned_at || r.scan_date || r.updated_at || '',
        tags:              r.tags ?? [],
      }})

      return { rows, total: totalCount ?? 0, page, pageSize: PAGE_SIZE }
    },
    staleTime: 30_000,
    keepPreviousData: true,   // no parpadea al cambiar de página
  })
}

export { PAGE_SIZE }
