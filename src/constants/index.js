export const STORE_ID   = import.meta.env.VITE_STORE_ID
export const TENANT_ID  = import.meta.env.VITE_TENANT_ID

// Identificador de cliente — usado para cargar componentes/config específicos
// Valores: 'singles-ut' | 'jonat' | 'ayrton'
// Cada proyecto Vercel tiene su propio VITE_CLIENT_ID en las env vars
export const CLIENT_ID  = import.meta.env.VITE_CLIENT_ID ?? 'default'

// Feature flags por plan
// VITE_PLAN=pro  → habilita Market Intel (historial de precios, trending, EV)
// VITE_PLAN=basic (o sin definir) → solo features base
const PLAN = import.meta.env.VITE_PLAN ?? 'basic'
export const FEATURES = {
  marketIntel: PLAN === 'pro',
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
