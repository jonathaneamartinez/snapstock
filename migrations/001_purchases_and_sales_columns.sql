-- ============================================================
-- MIGRACIÓN 001: Tablas de Compras + columnas extras en Sales
-- Ejecutar en: Supabase > SQL Editor > New query
-- ============================================================

-- ─── 1. Nuevas columnas en sales ────────────────────────────
ALTER TABLE sales
  ADD COLUMN IF NOT EXISTS estado       text DEFAULT 'pendiente',
  ADD COLUMN IF NOT EXISTS inventory_id uuid REFERENCES inventory(id) ON DELETE SET NULL;

-- ─── 2. Tabla purchases ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS purchases (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id        uuid        NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  vendor_name     text        NOT NULL,
  purchased_at    date        NOT NULL DEFAULT CURRENT_DATE,
  total_usd       numeric(10,2),
  total_ars       numeric(12,2),
  payment_status  text        NOT NULL DEFAULT 'pagada',
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- ─── 3. Tabla purchase_items ─────────────────────────────────
CREATE TABLE IF NOT EXISTS purchase_items (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_id  uuid        NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
  card_id      uuid        REFERENCES cards(id) ON DELETE SET NULL,
  quantity     int         NOT NULL DEFAULT 1,
  condition    text        NOT NULL DEFAULT 'NM',
  price_usd    numeric(10,2),
  price_ars    numeric(12,2),
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- ─── 4. RLS purchases ────────────────────────────────────────
ALTER TABLE purchases ENABLE ROW LEVEL SECURITY;

-- Política de lectura (anon / service_role ven sólo su store)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'purchases' AND policyname = 'store_isolation'
  ) THEN
    CREATE POLICY store_isolation ON purchases
      USING (store_id = current_setting('app.store_id', true)::uuid);
  END IF;
END$$;

-- Política permisiva para la anon key (INSERT/SELECT sin set de GUC)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'purchases' AND policyname = 'anon_all'
  ) THEN
    CREATE POLICY anon_all ON purchases
      FOR ALL
      TO anon, authenticated
      USING (true)
      WITH CHECK (true);
  END IF;
END$$;

-- ─── 5. RLS purchase_items ────────────────────────────────────
ALTER TABLE purchase_items ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'purchase_items' AND policyname = 'anon_all'
  ) THEN
    CREATE POLICY anon_all ON purchase_items
      FOR ALL
      TO anon, authenticated
      USING (true)
      WITH CHECK (true);
  END IF;
END$$;

-- ─── 6. Índices útiles ────────────────────────────────────────
CREATE INDEX IF NOT EXISTS purchases_store_id_idx      ON purchases(store_id);
CREATE INDEX IF NOT EXISTS purchases_purchased_at_idx  ON purchases(purchased_at DESC);
CREATE INDEX IF NOT EXISTS purchase_items_purchase_idx ON purchase_items(purchase_id);
CREATE INDEX IF NOT EXISTS purchase_items_card_idx     ON purchase_items(card_id);
CREATE INDEX IF NOT EXISTS sales_inventory_id_idx      ON sales(inventory_id);
CREATE INDEX IF NOT EXISTS sales_estado_idx            ON sales(estado);
