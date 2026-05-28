/**
 * Configuración específica de Ayrton TCG (Ayrton & Agustín)
 * Importar vía: import { clientConfig } from '../../clients/ayrton/config'
 */
export const clientConfig = {
  name:         'Ayrton TCG',
  displayName:  'Ayrton & Agus',
  ownerNames:   ['Ayrton', 'Agustín'],
  accentColor:  '#4680FF',
  logo:         null,
  features: {
    claims:      true,
    reservas:    true,
    ventas:      true,
    compras:     true,
    marketIntel: false,  // deshabilitado — se activa cuando se les presente la feature
  },
}
