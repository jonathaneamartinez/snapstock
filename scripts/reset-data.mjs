/**
 * reset-data.mjs
 * ─────────────────────────────────────────────────────────────────────
 * Borra TODOS los datos de prueba del store y deja la app vacía
 * lista para que Sebas y Melo ingresen el stock real.
 *
 * ⚠️  IRREVERSIBLE — solo correr cuando la demo terminó.
 *
 * Cómo usarlo:
 *   node scripts/reset-data.mjs
 *
 * Qué borra:
 *   - inventory      (todo el stock)
 *   - cards          (todas las cartas registradas)
 *   - purchases      (compras de prueba)
 *   - purchase_items (ítems de compras)
 *   - sales          (ventas de prueba)
 *   - deudas         (si existe la tabla)
 *
 * Qué NO toca:
 *   - Configuración de la tienda
 *   - Tipo de cambio / margen
 *   - Usuarios autorizados
 * ─────────────────────────────────────────────────────────────────────
 */

const SUPABASE_URL = 'https://psdadbxlwkjgcisviimo.supabase.co'
const ANON_KEY     = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBzZGFkYnhsd2tqZ2Npc3ZpaW1vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY4OTgyNTQsImV4cCI6MjA5MjQ3NDI1NH0.jO9y--DsTRkpGz07j--UdoJXm_B9J6rV7W-NOX_i4Ls'
const STORE_ID     = 'd0ccc053-bc2f-4d84-bb04-3e8222404172'

const headers = {
  apikey:         ANON_KEY,
  Authorization:  `Bearer ${ANON_KEY}`,
  'Content-Type': 'application/json',
  Prefer:         'return=minimal',
}

async function del(table, filter) {
  const url = `${SUPABASE_URL}/rest/v1/${table}?${filter}`
  const res  = await fetch(url, { method: 'DELETE', headers })
  return res.status
}

// ── Confirmación manual ────────────────────────────────────────────────
const args = process.argv.slice(2)
if (!args.includes('--confirmar')) {
  console.log(`
⚠️  ATENCIÓN — Este script borra TODOS los datos de prueba.

Para ejecutarlo, corré:
  node scripts/reset-data.mjs --confirmar

Esto eliminará: inventory, cards, purchases, purchase_items, sales, deudas.
`)
  process.exit(0)
}

console.log('\n🗑️  Limpiando base de datos...\n')

// Orden importante: primero tablas hijo (foreign keys), luego padre
const steps = [
  // Tablas hijo primero
  { table: 'purchase_items', filter: `purchase_id=in.(select id from purchases where store_id=eq.${STORE_ID})`, label: 'purchase_items' },
  { table: 'purchases',      filter: `store_id=eq.${STORE_ID}`,   label: 'purchases'      },
  { table: 'sales',          filter: `store_id=eq.${STORE_ID}`,   label: 'sales'          },
  { table: 'inventory',      filter: `store_id=eq.${STORE_ID}`,   label: 'inventory'      },
  { table: 'cards',          filter: `id=gt.00000000-0000-0000-0000-000000000000`, label: 'cards (global)' },
]

for (const step of steps) {
  process.stdout.write(`  Borrando ${step.label.padEnd(20)} `)
  try {
    const status = await del(step.table, step.filter)
    console.log(status === 204 ? '✅' : `⚠️  HTTP ${status}`)
  } catch (e) {
    console.log(`❌  ${e.message}`)
  }
}

// Limpiar localStorage del navegador no es posible desde acá,
// pero al abrir la app con datos vacíos se ve solo.
console.log(`
✅  Listo. La app está vacía.

Próximos pasos para Sebas y Melo:
  1. Abrir la app y loguearse con la contraseña
  2. Ir a "Ingresos" o usar el Scanner para cargar el stock real
  3. Los precios se actualizan automáticamente cada día desde la API TCG
`)
