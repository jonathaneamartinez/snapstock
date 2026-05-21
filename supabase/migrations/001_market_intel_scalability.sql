-- ============================================================
-- SNAPSTOCK — Market Intel + Scalability Foundation
-- Migration 001 — Mayo 2026
--
-- Tablas nuevas:
--   plans            → definición de tiers (basic/pro/enterprise)
--   market_signals   → eBay data + KPI por carta por día (global)
--   tenant_events    → audit trail de ciclo de vida de tenants
--   job_queue        → reemplaza crons ad-hoc con cola real
--
-- Alteraciones:
--   stores           → plan_tier, billing_email, locale, currency,
--                      timezone, feature_overrides, onboarded_at
-- ============================================================


-- ─────────────────────────────────────────────────────────────
-- 1. PLANS — definición de tiers de producto
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS plans (
  id              VARCHAR(20) PRIMARY KEY,          -- 'basic' | 'pro' | 'enterprise'
  name            VARCHAR(100) NOT NULL,
  price_usd       DECIMAL(8,2) NOT NULL DEFAULT 0,
  features        JSONB NOT NULL DEFAULT '{}',      -- {marketIntel: true, ebayKpi: true, ...}
  rate_limits     JSONB NOT NULL DEFAULT '{}',      -- {ebay_calls_per_day: 1000, ...}
  max_inventory   INT NOT NULL DEFAULT 500,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Insertar planes base
INSERT INTO plans (id, name, price_usd, features, rate_limits, max_inventory) VALUES
  ('basic', 'Básico', 35.00,
   '{"scanner": true, "whatsapp": true, "ventas": true, "compras": true,
     "claims": true, "deudas": true, "marketIntel": false, "ebayKpi": false,
     "priceAlerts": false, "evCalculator": false, "opportunitiesWidget": false}',
   '{"ebay_calls_per_day": 0, "whatsapp_messages_per_day": 200}',
   500),
  ('pro', 'Pro', 55.00,
   '{"scanner": true, "whatsapp": true, "ventas": true, "compras": true,
     "claims": true, "deudas": true, "marketIntel": true, "ebayKpi": true,
     "priceAlerts": true, "evCalculator": true, "opportunitiesWidget": true}',
   '{"ebay_calls_per_day": 1000, "whatsapp_messages_per_day": 500}',
   5000),
  ('enterprise', 'Enterprise', 120.00,
   '{"scanner": true, "whatsapp": true, "ventas": true, "compras": true,
     "claims": true, "deudas": true, "marketIntel": true, "ebayKpi": true,
     "priceAlerts": true, "evCalculator": true, "opportunitiesWidget": true,
     "apiAccess": true, "customBranding": true, "prioritySupport": true}',
   '{"ebay_calls_per_day": 5000, "whatsapp_messages_per_day": 2000}',
   50000)
ON CONFLICT (id) DO UPDATE SET
  features    = EXCLUDED.features,
  rate_limits = EXCLUDED.rate_limits,
  max_inventory = EXCLUDED.max_inventory;


-- ─────────────────────────────────────────────────────────────
-- 2. STORES — ampliar tabla existente para multi-tenant SaaS
-- ─────────────────────────────────────────────────────────────
ALTER TABLE stores
  ADD COLUMN IF NOT EXISTS plan_tier         VARCHAR(20)   NOT NULL DEFAULT 'basic'
                                             REFERENCES plans(id),
  ADD COLUMN IF NOT EXISTS billing_email     VARCHAR(200),
  ADD COLUMN IF NOT EXISTS locale            VARCHAR(10)   NOT NULL DEFAULT 'es-AR',
  ADD COLUMN IF NOT EXISTS currency          VARCHAR(3)    NOT NULL DEFAULT 'ARS',
  ADD COLUMN IF NOT EXISTS timezone          VARCHAR(50)   NOT NULL DEFAULT 'America/Argentina/Buenos_Aires',
  ADD COLUMN IF NOT EXISTS feature_overrides JSONB         NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS onboarded_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS is_active         BOOLEAN       NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notes             TEXT;         -- notas internas del admin

-- Marcar stores existentes como pro (ya son clientes pagos)
UPDATE stores SET plan_tier = 'pro', onboarded_at = NOW()
WHERE id IN (
  'a0c5e828-5dce-4a03-8b69-fa52a5096c34',  -- Ayrton TCG
  '9bd85bd6-1b22-42e6-a070-862b63f37820',  -- Jonat TCG
  'bffc0b0a-1214-4396-ae0e-f796783b7029'   -- Singles UT
);

CREATE INDEX IF NOT EXISTS idx_stores_plan_tier ON stores(plan_tier);
CREATE INDEX IF NOT EXISTS idx_stores_active    ON stores(is_active) WHERE is_active = true;


-- ─────────────────────────────────────────────────────────────
-- 3. MARKET_SIGNALS — eBay data + KPI diario por carta
--    GLOBAL (no por store): una carta tiene el mismo precio
--    de mercado para todos los tenants → ahorra API quota
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS market_signals (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id               UUID        NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  snapshot_date         DATE        NOT NULL DEFAULT CURRENT_DATE,

  -- ── Fuente de datos ──────────────────────────────────────
  data_source           VARCHAR(20) NOT NULL DEFAULT 'ebay',   -- 'ebay' | 'estimated' | 'pricecharting'
  ebay_query            TEXT,                                   -- query exacta usada en eBay

  -- ── Supply (eBay active listings) ────────────────────────
  active_listings       INT,
  new_listings_24h      INT,          -- vs snapshot anterior
  avg_listing_price_usd DECIMAL(10,2),
  min_listing_price_usd DECIMAL(10,2),
  max_listing_price_usd DECIMAL(10,2),
  price_stddev_usd      DECIMAL(10,2),

  -- ── Demand (derivado de price_history + eBay) ────────────
  price_change_7d_pct   DECIMAL(8,4),   -- % cambio en 7 días (de price_history)
  price_change_30d_pct  DECIMAL(8,4),   -- % cambio en 30 días
  sold_price_usd        DECIMAL(10,2),  -- precio sold (de pricecharting si disponible)

  -- ── Métricas derivadas ───────────────────────────────────
  demand_pressure       DECIMAL(6,4),   -- estimado 0-1 (sold/active)
  supply_saturation     DECIMAL(6,4),   -- listings actuales vs baseline 30d (1=normal, >1=saturado)
  liquidity_score       DECIMAL(6,2),   -- 0-100: qué tan fácil es vender
  volatility_score      DECIMAL(6,2),   -- 0-100: estabilidad de precio (100=muy estable)

  -- ── KPI compuesto VOID ───────────────────────────────────
  kpi_score             DECIMAL(6,2),   -- 0-100 (score final)
  kpi_state             VARCHAR(20),    -- subida_sana|explotada|mercado_frio|saturada|normal|sin_datos
  kpi_demand_component  DECIMAL(6,2),   -- 0-100 (aporte del componente demanda)
  kpi_liquidity_component DECIMAL(6,2),
  kpi_trend_component   DECIMAL(6,2),
  kpi_supply_component  DECIMAL(6,2),
  kpi_volatility_component DECIMAL(6,2),
  kpi_volume_component  DECIMAL(6,2),

  -- ── Meta ─────────────────────────────────────────────────
  computed_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (card_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_market_signals_card_date
  ON market_signals(card_id, snapshot_date DESC);

CREATE INDEX IF NOT EXISTS idx_market_signals_kpi_state
  ON market_signals(kpi_state, snapshot_date DESC)
  WHERE kpi_score IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_market_signals_kpi_score
  ON market_signals(kpi_score DESC, snapshot_date DESC)
  WHERE kpi_score IS NOT NULL;

-- View: KPI más reciente por carta
CREATE OR REPLACE VIEW market_signals_latest AS
  SELECT DISTINCT ON (card_id)
    ms.*
  FROM market_signals ms
  ORDER BY card_id, snapshot_date DESC;


-- ─────────────────────────────────────────────────────────────
-- 4. TENANT_EVENTS — audit trail del ciclo de vida
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tenant_events (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id    UUID        NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  event_type  VARCHAR(50) NOT NULL,   -- 'created'|'upgraded'|'downgraded'|'churned'|'activated'|'suspended'
  from_plan   VARCHAR(20),
  to_plan     VARCHAR(20),
  actor       VARCHAR(100),           -- 'admin'|'system'|email del admin
  metadata    JSONB        NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tenant_events_store
  ON tenant_events(store_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_tenant_events_type
  ON tenant_events(event_type, created_at DESC);


-- ─────────────────────────────────────────────────────────────
-- 5. JOB_QUEUE — reemplaza crons ad-hoc con cola robusta
--    Railway ejecuta cron_market.py que lee esta tabla
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS job_queue (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type      VARCHAR(50) NOT NULL,  -- 'fetch_ebay'|'compute_kpi'|'fetch_prices'|'send_alert'|'fetch_pull_rates'
  payload       JSONB       NOT NULL DEFAULT '{}',
  status        VARCHAR(20) NOT NULL DEFAULT 'pending',  -- pending|running|done|failed|skipped
  priority      INT         NOT NULL DEFAULT 5,          -- 1=highest, 10=lowest
  attempts      INT         NOT NULL DEFAULT 0,
  max_attempts  INT         NOT NULL DEFAULT 3,
  scheduled_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at    TIMESTAMPTZ,
  completed_at  TIMESTAMPTZ,
  duration_ms   INT,
  error_message TEXT,
  result        JSONB,                                   -- resumen del resultado
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_job_queue_pending
  ON job_queue(priority ASC, scheduled_at ASC)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_job_queue_type_status
  ON job_queue(job_type, status, created_at DESC);

-- Función helper para encolar un job (evita duplicados del mismo tipo en el día)
CREATE OR REPLACE FUNCTION enqueue_job(
  p_job_type    VARCHAR,
  p_payload     JSONB DEFAULT '{}',
  p_priority    INT   DEFAULT 5,
  p_dedupe_window INTERVAL DEFAULT INTERVAL '1 hour'
) RETURNS UUID AS $$
DECLARE
  v_id UUID;
BEGIN
  -- No encolar si ya existe uno pendiente/running del mismo tipo reciente
  IF EXISTS (
    SELECT 1 FROM job_queue
    WHERE job_type = p_job_type
      AND status IN ('pending', 'running')
      AND created_at > NOW() - p_dedupe_window
  ) THEN
    RETURN NULL;
  END IF;

  INSERT INTO job_queue (job_type, payload, priority)
  VALUES (p_job_type, p_payload, p_priority)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$ LANGUAGE plpgsql;


-- ─────────────────────────────────────────────────────────────
-- 6. PRICE_ALERTS — ampliar tabla existente
--    (si no existe la creamos, si existe solo alteramos)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS price_alerts (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id        UUID        NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  card_id         UUID        NOT NULL REFERENCES cards(id)  ON DELETE CASCADE,
  alert_type      VARCHAR(20) NOT NULL DEFAULT 'price_change',  -- 'price_change'|'kpi_state_change'|'opportunity'
  threshold_pct   DECIMAL(6,2),    -- % de variación para disparar (price_change)
  threshold_kpi   INT,             -- score mínimo para disparar (kpi)
  kpi_states      TEXT[],          -- estados que disparan ('subida_sana', 'explotada')
  window_days     INT NOT NULL DEFAULT 7,
  notify_push     BOOLEAN NOT NULL DEFAULT true,
  notify_whatsapp BOOLEAN NOT NULL DEFAULT false,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  last_triggered  TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE price_alerts
  ADD COLUMN IF NOT EXISTS alert_type      VARCHAR(20)  DEFAULT 'price_change',
  ADD COLUMN IF NOT EXISTS threshold_kpi   INT,
  ADD COLUMN IF NOT EXISTS kpi_states      TEXT[],
  ADD COLUMN IF NOT EXISTS notify_push     BOOLEAN      DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_whatsapp BOOLEAN      DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_active       BOOLEAN      DEFAULT true,
  ADD COLUMN IF NOT EXISTS last_triggered  TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_price_alerts_store
  ON price_alerts(store_id) WHERE is_active = true;


-- ─────────────────────────────────────────────────────────────
-- 7. ROW LEVEL SECURITY — asegurar aislamiento multi-tenant
--    (activar RLS en todas las tablas con store_id)
-- ─────────────────────────────────────────────────────────────

-- market_signals NO tiene store_id (es global) → sin RLS
-- Las demás tablas ya tienen RLS o no lo necesitan

-- Habilitar RLS en price_alerts si no está
ALTER TABLE price_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS price_alerts_store_isolation ON price_alerts;
CREATE POLICY price_alerts_store_isolation ON price_alerts
  USING (store_id::text = current_setting('app.store_id', true));

-- tenant_events: solo el store puede ver sus propios eventos
ALTER TABLE tenant_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_events_store_isolation ON tenant_events;
CREATE POLICY tenant_events_store_isolation ON tenant_events
  USING (store_id::text = current_setting('app.store_id', true));


-- ─────────────────────────────────────────────────────────────
-- 8. FUNCTIONS útiles
-- ─────────────────────────────────────────────────────────────

-- Obtener el KPI más reciente de un card_id
CREATE OR REPLACE FUNCTION get_latest_kpi(p_card_id UUID)
RETURNS TABLE(
  kpi_score DECIMAL,
  kpi_state VARCHAR,
  snapshot_date DATE,
  price_change_7d_pct DECIMAL,
  active_listings INT,
  demand_pressure DECIMAL
) AS $$
  SELECT
    ms.kpi_score, ms.kpi_state, ms.snapshot_date,
    ms.price_change_7d_pct, ms.active_listings, ms.demand_pressure
  FROM market_signals ms
  WHERE ms.card_id = p_card_id
    AND ms.kpi_score IS NOT NULL
  ORDER BY ms.snapshot_date DESC
  LIMIT 1;
$$ LANGUAGE sql STABLE;


-- Obtener top N oportunidades del inventario de un store
CREATE OR REPLACE FUNCTION get_inventory_opportunities(
  p_store_id  UUID,
  p_limit     INT DEFAULT 10,
  p_min_kpi   DECIMAL DEFAULT 60
)
RETURNS TABLE(
  inventory_id UUID,
  card_id      UUID,
  card_name    TEXT,
  kpi_score    DECIMAL,
  kpi_state    VARCHAR,
  price_usd    DECIMAL,
  quantity     INT,
  snapshot_date DATE
) AS $$
  SELECT
    i.id           AS inventory_id,
    i.card_id,
    c.name         AS card_name,
    ms.kpi_score,
    ms.kpi_state,
    i.price_usd,
    i.quantity,
    ms.snapshot_date
  FROM inventory i
  JOIN cards c ON c.id = i.card_id
  JOIN market_signals_latest ms ON ms.card_id = i.card_id
  WHERE i.store_id = p_store_id
    AND i.status = 'disponible'
    AND i.quantity > 0
    AND ms.kpi_score >= p_min_kpi
  ORDER BY ms.kpi_score DESC
  LIMIT p_limit;
$$ LANGUAGE sql STABLE;
