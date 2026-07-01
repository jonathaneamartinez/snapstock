# snapstock — dashboard admin (React) · CLAUDE.md

Dashboard admin de Snap Stock (stock, ventas, deudas, claims, compras, pokédex, settings, scanner).
Doc global: `../DOCUMENTACION_ACTUAL.md` y `../ARBOL_REPOS.md`.

## Stack / deploy
- React + Vite + **React Query** + Tailwind. Supabase con **anon key**.
- Deploy: push a `main` → **Vercel**, 1 proyecto por tienda (mismo código).
- Build: `npm run build`. **El proyecto es JSX/JavaScript, NO TypeScript.**

## Multi-tenant
- Se diferencia por env vars de Vercel: `VITE_STORE_ID`, `VITE_CLIENT_ID`, `VITE_PLAN` (`basic`|`pro`), `VITE_APP_PASS` (login = solo password), `VITE_SCANNER_URL` (= backend Railway).
- Config por cliente en `src/clients/<id>/config.js` + `src/constants/index.js` + `src/lib/tenantConfig.js`.
- Gating por plan (`pro` = market intel) en `src/lib/featureGate.js`.

## Mapa rápido
- **`hooks/useStock.js`** — stock paginado. **SORT server-side global** (todas las páginas): USD/ARS por `price_usd`, P.Venta por `sale_price_ars`, y columnas de `cards` por `order=cards(col)` (NO `referencedTable`).
- **`hooks/useMetricas.js`** — KPIs. ARS calculados **en vivo** = `price_usd × cotización` (no columnas `price_ars_*` viejas). "Total unidades" = `totalCartas` (SUM qty).
- **`hooks/useSettings.js`** — al guardar el margen dispara `POST {VITE_SCANNER_URL}/recompute-sale-prices` y refresca stock/claims/deudas/metricas.
- **`hooks/useDeudas.js`** — reservas (inventory `sale_price_ars`) + ventas-deuda (`sales.total_ars`). Reserva NO × cantidad.
- **`pages/Ingresos.jsx`** — Nuevos Ingresos, tabs `CARTA · NÚMERO · LINKS · SELLADO` con progressive disclosure. Piezas reutilizables `nombreField`/`setEditionField`/`qtyCondRow`. NO tocar la lógica de búsqueda (helpers arriba del componente).
- **`lib/catalogSearch.js`** — búsqueda en `cards`, **filtra por idioma** (`.eq('language', lang)`).
- **`components/ui/SetSelect.jsx`** — dropdown de sets por idioma (`lang`); soporta `disabled`.

## Gotchas
- Supabase JS v2: usar `referencedTable` (NO `foreignTable`). Para ordenar filas padre por columna de embed usar spelling `order=cards(col)`.
- `onClick={fn}` pasa el evento como arg; usar `onClick={() => fn()}` si `fn` tiene params con default.
- ARS se derivan del USD efectivo × cotización actual (las columnas `price_ars_*` quedan viejas).

## Reglas del dueño
- **Responder siempre en español.** Nunca borrar datos reales. Arreglos que perduren y convivan. Respetar precios manuales.
