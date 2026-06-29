/**
 * Configuración específica de Jonat TCG
 * Importar vía: import { clientConfig } from '../../clients/jonat/config'
 */
export const clientConfig = {
  name:         'Jonathan',
  displayName:  'Jonathan',
  ownerNames:   [],
  accentColor:  '#4680FF',
  logo:         null,
  features: {
    claims:      true,
    reservas:    true,
    ventas:      true,
    compras:     true,
    marketIntel: true,   // plan Pro
  },
}
