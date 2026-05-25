/**
 * featureGate.js
 * ─────────────────────────────────────────────────────────────
 * Sistema de feature flags granular para SnapStock multi-tenant.
 *
 * Jerarquía de resolución (mayor prioridad último):
 *   1. Plan tier (VITE_PLAN env var) → define features base
 *   2. Client config (clients/{client}/config.js) → overrides por tenant
 *   3. VITE_FEATURE_* env vars → overrides de deploy (emergencia / A/B)
 *
 * Uso:
 *   import { isFeatureEnabled } from '../lib/featureGate'
 *   if (isFeatureEnabled('marketIntel')) { ... }
 *
 * Features disponibles:
 *   scanner            — Scanner por cámara (OCR + pHash)
 *   whatsapp           — Agente WhatsApp con IA
 *   ventas             — Registro de ventas
 *   compras            — Registro de compras
 *   claims             — Sistema de claims
 *   deudas             — Gestión de deudas/reservas
 *   marketIntel        — Módulo Market Intelligence (plan Pro)
 *   ebayKpi            — KPI VOID + eBay supply data (plan Pro)
 *   priceAlerts        — Alertas de precio configurables (plan Pro)
 *   evCalculator       — Calculadora EV por sobre (plan Pro)
 *   opportunitiesWidget — Widget de oportunidades en Home (plan Pro)
 *   apiAccess          — Acceso a API REST externa (plan Enterprise)
 *   customBranding     — Branding personalizado (plan Enterprise)
 *   prioritySupport    — Soporte prioritario (plan Enterprise)
 */

// ── Definición de planes ──────────────────────────────────────────────────────

const PLAN_FEATURES = {
  basic: {
    scanner:             true,
    whatsapp:            true,
    ventas:              true,
    compras:             true,
    claims:              true,
    deudas:              true,
    marketIntel:         false,
    ebayKpi:             false,
    priceAlerts:         false,
    evCalculator:        false,
    opportunitiesWidget: false,
    apiAccess:           false,
    customBranding:      false,
    prioritySupport:     false,
  },
  pro: {
    scanner:             true,
    whatsapp:            true,
    ventas:              true,
    compras:             true,
    claims:              true,
    deudas:              true,
    marketIntel:         true,
    ebayKpi:             true,
    priceAlerts:         true,
    evCalculator:        true,
    opportunitiesWidget: true,
    apiAccess:           false,
    customBranding:      false,
    prioritySupport:     false,
  },
  enterprise: {
    scanner:             true,
    whatsapp:            true,
    ventas:              true,
    compras:             true,
    claims:              true,
    deudas:              true,
    marketIntel:         true,
    ebayKpi:             true,
    priceAlerts:         true,
    evCalculator:        true,
    opportunitiesWidget: true,
    apiAccess:           true,
    customBranding:      true,
    prioritySupport:     true,
  },
}

// ── Resolver features ─────────────────────────────────────────────────────────

const PLAN = import.meta.env.VITE_PLAN ?? 'basic'

// Base features del plan
const _base = PLAN_FEATURES[PLAN] ?? PLAN_FEATURES.basic

// Overrides de deploy via VITE_FEATURE_* (ej. VITE_FEATURE_MARKET_INTEL=true)
const _envOverrides = {}
for (const [key, base] of Object.entries(_base)) {
  const envKey = `VITE_FEATURE_${key.replace(/([A-Z])/g, '_$1').toUpperCase()}`
  const envVal = import.meta.env[envKey]
  if (envVal === 'true')  _envOverrides[key] = true
  if (envVal === 'false') _envOverrides[key] = false
}

// Features finales resueltas
const _resolved = { ..._base, ..._envOverrides }

/**
 * Verifica si un feature está habilitado para este tenant/deploy.
 *
 * @param {string} featureName — nombre del feature (camelCase)
 * @returns {boolean}
 */
export function isFeatureEnabled(featureName) {
  return _resolved[featureName] === true
}

/**
 * Devuelve todas las features resueltas.
 * Equivalente al objeto FEATURES en constants/index.js pero más completo.
 */
export const FEATURES_ALL = Object.freeze({ ..._resolved })

/**
 * Plan actual del tenant.
 * @returns {'basic'|'pro'|'enterprise'}
 */
export const CURRENT_PLAN = PLAN

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Devuelve true si el plan actual es pro o superior.
 */
export const isPro        = PLAN === 'pro' || PLAN === 'enterprise'

/**
 * Devuelve true si el plan actual es enterprise.
 */
export const isEnterprise = PLAN === 'enterprise'
