export const STORE_ID  = import.meta.env.VITE_STORE_ID
export const TENANT_ID = import.meta.env.VITE_TENANT_ID

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
  { code: 'es', label: 'Español',   flag: '🇪🇸' },
  { code: 'ja', label: 'Japonés',   flag: '🇯🇵' },
  { code: 'fr', label: 'Francés',   flag: '🇫🇷' },
  { code: 'de', label: 'Alemán',    flag: '🇩🇪' },
  { code: 'pt', label: 'Portugués', flag: '🇧🇷' },
]

export const ESTADOS     = ['disponible', 'reservada', 'vendida']
export const CANALES     = ['Charly', 'Claims', 'Fuera de eventos']
export const HOLO_LEVELS = ['normal', 'holo', 'ultra', 'secret']
