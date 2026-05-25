export const STORE_ID   = import.meta.env.VITE_STORE_ID
export const TENANT_ID  = import.meta.env.VITE_TENANT_ID

// Identificador de cliente — usado para cargar componentes/config específicos
// Valores: 'singles-ut' | 'jonat' | 'ayrton'
// Cada proyecto Vercel tiene su propio VITE_CLIENT_ID en las env vars
export const CLIENT_ID  = import.meta.env.VITE_CLIENT_ID ?? 'default'

// ── Feature flags ──────────────────────────────────────────────────────────
// Fuente de verdad: clientConfig.features en src/clients/{id}/config.js
// El VITE_PLAN actúa como fallback si el cliente no define un flag explícito.
//
// Para habilitar/deshabilitar una feature para un cliente:
//   → Editar src/clients/{id}/config.js → features.{flag}: true|false
//
// NUNCA modificar esta sección para ocultar features; hacerlo en el config del cliente.
// ─────────────────────────────────────────────────────────────────────────────
import { clientConfig as _ayrtonCfg   } from '../clients/ayrton/config'
import { clientConfig as _jonatCfg    } from '../clients/jonat/config'
import { clientConfig as _singlesUtCfg } from '../clients/singles-ut/config'

const _CLIENT_CONFIGS = {
  'ayrton':     _ayrtonCfg,
  'jonat':      _jonatCfg,
  'singles-ut': _singlesUtCfg,
}

const _clientFeatures = _CLIENT_CONFIGS[CLIENT_ID]?.features ?? {}
const _PLAN = import.meta.env.VITE_PLAN ?? 'basic'

// ── Lógica de resolución de features ─────────────────────────────────────
//
//  VITE_PLAN=pro  → "Modo Editor" — override total, ve TODAS las features
//                   (usar en Vercel Preview/dev para que el editor pruebe todo)
//
//  VITE_PLAN=basic → respeta el clientConfig del cliente
//                   (usar en Vercel Production para que cada cliente vea solo lo suyo)
//
//  Flujo de release:
//    1. Desarrollar en rama `dev` con VITE_PLAN=pro (editor ve todo)
//    2. Cuando querés que Ayrton vea una feature: editar ayrton/config.js → true
//    3. Mergear dev → main → Vercel Production se actualiza
// ─────────────────────────────────────────────────────────────────────────
const _feat = (key, clientDefault) => {
  if (_PLAN === 'pro') return true                          // editor: ve todo
  return key in _clientFeatures ? !!_clientFeatures[key] : clientDefault
}

export const FEATURES = {
  marketIntel: _feat('marketIntel', false),
  // Agregar nuevas features acá + en cada clientConfig que corresponda:
  // bulkImport:  _feat('bulkImport',  false),
  // priceAlerts: _feat('priceAlerts', false),
}

export const CONDICIONES = ['NM', 'LP', 'MP', 'HP', 'DMG']
export const CONDICION_LABELS = {
  NM:  'Near Mint',
  LP:  'Lightly Played',
  MP:  'Moderately Played',
  HP:  'Heavily Played',
  DMG: 'Damaged',
}

export const IDIOMAS = [
  { code: 'en', label: 'Inglés',    flag: '🇬🇧' },
  { code: 'ja', label: 'Japonés',   flag: '🇯🇵' },
  { code: 'zh', label: 'Chino',     flag: '🇨🇳' },
  { code: 'es', label: 'Español',   flag: '🇪🇸' },
  { code: 'fr', label: 'Francés',   flag: '🇫🇷' },
  { code: 'de', label: 'Alemán',    flag: '🇩🇪' },
  { code: 'pt', label: 'Portugués', flag: '🇧🇷' },
]

export const ESTADOS     = ['disponible', 'reservada', 'vendida']
export const CANALES     = ['Charly', 'Claims', 'Fuera de eventos']
export const HOLO_LEVELS = ['normal', 'holo', 'ultra', 'secret']

export const CANALES_VENTA = [
  { value: 'fuera_de_evento', label: '📍 Fuera de evento' },
  { value: 'instagram',       label: '📸 Instagram'       },
  { value: 'whatsapp',        label: '💬 WhatsApp'        },
  { value: 'claims',          label: '🃏 Claims'          },
  { value: 'charly',          label: '👤 Charly'          },
]

// Sets que tuvieron impresión de 1ª edición (WotC era)
export const FIRST_ED_SETS = [
  'Base Set', 'Jungle', 'Fossil', 'Base Set 2', 'Team Rocket',
  'Gym Heroes', 'Gym Challenge', 'Neo Genesis', 'Neo Discovery',
  'Neo Revelation', 'Neo Destiny',
]
