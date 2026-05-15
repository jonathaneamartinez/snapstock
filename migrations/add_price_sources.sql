-- ============================================================
-- Migración: soporte multi-proveedor de precios
-- Ejecutar en Supabase → SQL Editor
-- ============================================================

-- 1. Proveedor de precio global por tienda
ALTER TABLE stores
  ADD COLUMN IF NOT EXISTS precio_fuente TEXT NOT NULL DEFAULT 'tcgplayer';
-- Valores posibles: 'tcgplayer' | 'cardmarket' | 'pricecharting'

-- 2. Precios de todos los proveedores por carta
ALTER TABLE inventory
  ADD COLUMN IF NOT EXISTS precios_fuentes JSONB DEFAULT '{}'::jsonb;
-- Formato: {"tcgplayer": {"usd": 12.5}, "cardmarket": {"eur": 10.2, "usd": 11.1}, "pricecharting": {"usd": 13.0}}

-- 3. Override individual por carta (NULL = usar el global)
ALTER TABLE inventory
  ADD COLUMN IF NOT EXISTS precio_fuente_override TEXT DEFAULT NULL;

-- Índice para queries por fuente
CREATE INDEX IF NOT EXISTS idx_inventory_precio_fuente
  ON inventory(precio_fuente_override)
  WHERE precio_fuente_override IS NOT NULL;
