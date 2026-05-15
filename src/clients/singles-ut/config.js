/**
 * Configuración específica de Singles UT (Sebas, Melo & Mayra)
 * Importar vía: import { clientConfig } from '../../clients/singles-ut/config'
 */
export const clientConfig = {
  name:         'Singles UT',
  ownerNames:   ['Sebas', 'Melody', 'Mayra'],
  accentColor:  '#4680FF',    // azul por defecto
  logo:         null,         // null = usa el logo genérico de SnapStock
  features: {
    claims:     true,
    reservas:   true,
    ventas:     true,
    compras:    true,
    marketIntel: false,
  },
}
