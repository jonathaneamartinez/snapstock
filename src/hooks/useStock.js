import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { STORE_ID } from '../constants'

const PAGE_SIZE = 100

// Mapeo de key de columna UI → columna real en Supabase (y tabla si es foreign)
const SORT_MAP = {
  nombre:       { col: 'name',              table: 'cards'     },
  set_name:     { col: 'set_name',          table: 'cards'     },
  numero:       { col: 'card_number',       table: 'cards'     },
  idioma:       { col: 'language',          table: 'cards'     },
  holo:         { col: 'is_holo',           table: 'cards'     },
  condicion:    { col: 'condition',         table: null        },
  stock:        { col: 'quantity',          table: null        },
  price_usd:    { col: 'price_usd',         table: null        },
  _ars_ofic:    { col: 'price_ars_oficial', table: null        },
  _ars_blue:    { col: 'price_ars_blue',    table: null        },
  precio_venta: { col: 'price_ars_blue',    table: null        },
  status:       { col: 'status',            table: null        },
  buyer_name:   { col: 'buyer_name',        table: null        },
}

export function useStock(filters = {}) {
  const { estado, busqueda, idioma, condicion, page = 0, sortCol, sortDir = 'asc' } = filters

  return useQuery({
    queryKey: ['stock', filters],
    queryFn: async () => {
      // ── Construcción base del query ──────────────────────────────────────
      const buildQuery = (q) => {
        if (estado)    q = q.or(`status.eq.${estado},estado.eq.${estado}`)
        if (condicion) q = q.or(`condition.eq.${condicion},condicion.eq.${condicion}`)
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
        cards (
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
        .select('id', { count: 'exact', head: true })
        .eq('store_id', STORE_ID)
      countQ = buildQuery(countQ)
      const { count: totalCount } = await countQ

      // ── Datos paginados ───────────────────────────────────────────────────
      const from = page * PAGE_SIZE
      const to   = from + PAGE_SIZE - 1

      let q = supabase
        .from('inventory')
        .select(selectFields)
        .eq('store_id', STORE_ID)
      q = buildQuery(q)

      // ── Ordenamiento ─────────────────────────────────────────────────────
      const sortDef       = sortCol ? SORT_MAP[sortCol] : null
      const isForeignSort = sortDef?.table != null   // columna en tabla cards

      if (sortDef && !isForeignSort) {
        // Sort server-side sólo para columnas directas de inventory
        const asc = sortDir !== 'desc'
        q = q.order(sortDef.col, { ascending: asc, nullsFirst: false })
        q = q.order('id', { ascending: false })
      } else {
        // Sin sort explícito o foreign sort → más recientes primero
        q = q.order('id', { ascending: false })
      }

      // Paginación: para foreign sort traemos TODO y paginamos client-side
      if (!isForeignSort) {
        q = q.range(from, to)
      }

      const { data, error } = await q
      if (error) throw error

      let rows = (data ?? []).map(r => ({
        inventory_id:      r.id,
        card_id:           r.cards?.id || null,
        // Carta
        nombre:            r.cards?.name || r.cards?.full_name || '',
        set_name:          r.cards?.set_name || '',
        numero:            r.cards?.card_number || '',
        idioma:            r.cards?.language || 'en',
        holo:              r.cards?.is_holo || false,
        image_url:         r.cards?.image_url || '',
        // Inventario
        condicion:         r.condition || r.condicion || '',
        stock:             r.quantity ?? 1,
        price_usd:         r.price_usd,
        price_ars_blue:    r.price_ars_blue,
        price_ars_oficial: r.price_ars_oficial,
        precio_venta:      r.price_ars_blue,
        status:            r.status || r.estado || '',
        // Reserva / comprador
        buyer_name:        r.buyer_name || r.comprador || '',
        buyer_contact:     r.buyer_contact || r.contacto || '',
        notes:             r.notas || r.sale_notes || '',
        reserved_at:       r.reserved_at || r.fecha_reserva || '',
        fecha_escaneada:   r.scanned_at || r.scan_date || r.updated_at || '',
      }))

      // Filtros client-side (búsqueda de texto e idioma)
      if (idioma)   rows = rows.filter(r => r.idioma === idioma)
      if (busqueda) rows = rows.filter(r =>
        r.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
        r.set_name.toLowerCase().includes(busqueda.toLowerCase())
      )

      // Sort + paginación client-side cuando la columna pertenece a `cards`
      if (isForeignSort && sortDef) {
        const asc   = sortDir !== 'desc'
        const field = sortCol   // 'nombre', 'set_name', 'numero', 'idioma', 'holo'
        rows.sort((a, b) => {
          const va = (a[field] ?? '').toString().toLowerCase()
          const vb = (b[field] ?? '').toString().toLowerCase()
          if (va < vb) return asc ? -1 :  1
          if (va > vb) return asc ?  1 : -1
          return 0
        })
        const total = rows.length
        const sliced = rows.slice(from, from + PAGE_SIZE)
        return { rows: sliced, total, page, pageSize: PAGE_SIZE }
      }

      return { rows, total: totalCount ?? 0, page, pageSize: PAGE_SIZE }
    },
    staleTime: 30_000,
    keepPreviousData: true,   // no parpadea al cambiar de página
  })
}

export { PAGE_SIZE }
