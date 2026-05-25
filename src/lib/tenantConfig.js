/**
 * tenantConfig.js
 * ─────────────────────────────────────────────────────────────
 * Carga la configuración específica del tenant actual.
 *
 * Cada tenant tiene su carpeta en src/clients/{clientId}/config.js
 * con: name, ownerNames, accentColor, logo, features (overrides).
 *
 * El CLIENT_ID se inyecta en build time via VITE_CLIENT_ID.
 *
 * Uso:
 *   import { tenantConfig, getTenantFeature } from '../lib/tenantConfig'
 *   const name = tenantConfig.name
 *   const hasMarket = getTenantFeature('marketIntel')
 */

import { CLIENT_ID } from '../constants'
import { FEATURES_ALL } from './featureGate'

// ── Carga dinámica de configs de cliente ──────────────────────────────────────
// Usamos import estático para cada cliente conocido (Vite no soporta dynamic
// import() con variables en build time para todos los bundlers)

let _clientConfig = null

try {
  if (CLIENT_ID === 'ayrton') {
    const m = await import('../clients/ayrton/config.js').catch(() => null)
    _clientConfig = m?.clientConfig ?? null
  } else if (CLIENT_ID === 'jonat') {
    const m = await import('../clients/jonat/config.js').catch(() => null)
    _clientConfig = m?.clientConfig ?? null
  } else if (CLIENT_ID === 'singles-ut') {
    const m = await import('../clients/singles-ut/config.js').catch(() => null)
    _clientConfig = m?.clientConfig ?? null
  }
} catch {
  // En SSR o entornos que no soportan top-level await, ignoramos
}

// Config por defecto si no se encontró el cliente
const _defaults = {
  name:         'SnapStock',
  ownerNames:   [],
  accentColor:  '#4680FF',
  logo:         null,
  features:     {},
}

export const tenantConfig = _clientConfig ?? _defaults

/**
 * Devuelve si un feature está habilitado, considerando:
 * 1. Plan features (base)
 * 2. Client config feature overrides
 *
 * @param {string} featureName
 * @returns {boolean}
 */
export function getTenantFeature(featureName) {
  // Override explícito del cliente toma prioridad
  if (tenantConfig.features && featureName in tenantConfig.features) {
    return Boolean(tenantConfig.features[featureName])
  }
  // Fallback al plan
  return FEATURES_ALL[featureName] === true
}

/**
 * Devuelve el color de acento del tenant (para branding).
 */
export const ACCENT_COLOR = tenantConfig.accentColor ?? '#4680FF'

/**
 * Devuelve el nombre del tenant.
 */
export const TENANT_NAME = tenantConfig.name ?? 'SnapStock'
