/**
 * Configuración específica de Kardia (tienda personal de Jonathan)
 * Importar vía: import { clientConfig } from '../../clients/kardia/config'
 */
export const clientConfig = {
  name:         'Kardia',
  displayName:  'Kardia',
  ownerNames:   ['Jonathan'],
  accentColor:  '#ec4899',   // rosa
  logo:         null,
  features: {
    claims:      true,
    reservas:    true,
    ventas:      true,
    compras:     true,
    marketIntel: true,   // plan Pro
  },
}
