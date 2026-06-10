import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { STORE_ID } from '../constants'

const PAGE_SIZE = 50

// Mapeo de key de columna UI → columna real en Supabase
// table: null → columna directa de inventory (sort server-side)
// table: 'cards' → columna de tabla relacionada (sort server-side via foreignTable)
const SORT_MAP = {
  nombre:       { col: 'name',              table: 'cards',    foreignTable: true  },
  set_name:     { col: 'set_name',          table: 'cards',    foreignTable: true  },
  numero:       { col: 'card_number',       table: 'cards',    foreignTable: true  },
  idioma:       { col: 'language',          table: 'cards',    foreignTable: true  },
  holo:         { col: 'is_holo',           table: 'cards',    foreignTable: true  },
  condicion:    { col: 'condition',         table: null                            },
  stock:        { col: 'quantity',          table: null                            },
  price_usd:    { col: 'price_usd',         table: null                            },
  _ars_ofic:    { col: 'price_ars_oficial', table: null                            },
  _ars_blue:    { col: 'price_ars_blue',    table: null                            },
  precio_venta: { col: 'price_ars_blue',    table: null                            },
  status:       { col: 'status',            table: null                            },
  buyer_name:   { col: 'buyer_name',        table: null                            },
}

export function useStock(filters = {}) {
  const { estado, busqueda, idioma, condicion, page = 0, sortCol, sortDir = 'asc' } = filters

  return useQuery({
    queryKey: ['stock', filters],
    queryFn: async () => {
      // Usamos cards!inner cuando hay filtros sobre cards O cuando el sort
      // es por una columna de cards (foreignTable sort requiere !inner)
      const sortDef0        = sortCol ? SORT_MAP[sortCol] : null
      const needsCardFilter = !!(busqueda || idioma || sortDef0?.foreignTable)
      const cardJoin        = needsCardFilter ? 'cards!inner' : 'cards'

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
          q = q.or(
            `name.ilike.%${term}%,set_name.ilike.%${term}%,card_number.ilike.%${term}%`,
            { referencedTable: 'cards' }
          )
        }

        return q
      }

      const selectFields = `
        id,
        quantity,
        condition,
        condicion,
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
        ${cardJoin} (
          id,
          name,
          full_name,
          set_name,
          card_number,
          image_url,
          language,
          is_holo,
          variant
        )
      `

      // ── Count total (para mostrar X/N) ────────────────────────────────────
      let countQ = supabase
        .from('inventory')
        .select(
          needsCardFilter ? 'id, cards!inner(id)' : 'id',
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
          // Columna de tabla relacionada → usar foreignTable en .order()
          q = q.order(sortDef.col, { referencedTable: 'cards', ascending: asc, nullsFirst: false })
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

      const rows = (data ?? []).map(r => ({
        inventory_id:      r.id,
        card_id:           r.cards?.id || null,
        // Carta
        nombre:            r.cards?.name || r.cards?.full_name || '',
        set_name:          r.cards?.set_name || '',
        numero:            r.cards?.card_number || '',
        idioma:            r.cards?.language || 'en',
        holo:              r.holo   || false,
        finish:            r.finish || 'normal',   // 'normal' | 'holofoil' | 'reverse'
        image_url:         r.cards?.image_url || '',
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
      }))

      return { rows, total: totalCount ?? 0, page, pageSize: PAGE_SIZE }
    },
    staleTime: 30_000,
    keepPreviousData: true,   // no parpadea al cambiar de página
  })
}

export { PAGE_SIZE }
