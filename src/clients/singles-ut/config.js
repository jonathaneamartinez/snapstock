/**
 * Configuración específica de Singles UT (Sebas, Melo & Mayra)
 * Importar vía: import { clientConfig } from '../../clients/singles-ut/config'
 */
export const clientConfig = {
  name:         'UT - LA',
  displayName:  'Sebas y Melo',
  ownerNames:   [],
  accentColor:  '#4680FF',    // azul por defecto
  logo:         null,         // null = initials fallback · string URL = avatar imagen
  features: {
    claims:     true,
    reservas:   true,
    ventas:     true,
    compras:    true,
    marketIntel: false,
  },
}
