import { NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, Package, TrendingUp, Users,
  ShoppingCart, PlusCircle, Settings, Scan, X, Layers,
} from 'lucide-react'
import { useI18n }     from '../../lib/i18n'
import { STORE_CONFIG } from '../../constants'
import StoreProfile     from './StoreProfile'

export default function Sidebar({ open, onClose }) {
  const navigate = useNavigate()
  const { t } = useI18n()

  const NAV = [
    { to: '/dashboard', labelKey: 'nav_dashboard', icon: LayoutDashboard },
    { to: '/ingresos',  labelKey: 'nav_ingresos',  icon: PlusCircle      },
    { to: '/stock',     labelKey: 'nav_stock',     icon: Package         },
    { to: '/ventas',    labelKey: 'nav_ventas',    icon: TrendingUp      },
    { to: '/deudas',    labelKey: 'nav_deudas',    icon: Users           },
    { to: '/compras',   labelKey: 'nav_compras',   icon: ShoppingCart    },
    { to: '/claims',    labelKey: 'nav_claims',    icon: Layers          },
    { to: '/settings',  labelKey: 'nav_settings',  icon: Settings        },
  ]

  const handleScanner = () => {
    onClose?.()
    navigate('/scanner')
  }

  return (
    <aside className={`
      flex flex-col w-64 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800
      fixed left-0 top-0 bottom-0 z-30 h-full
      transition-transform duration-300 ease-in-out
      ${open ? 'translate-x-0' : '-translate-x-full'}
      lg:translate-x-0 lg:w-52
    `}>

      {/* ── Brand + botón cerrar mobile ───────────────────────────── */}
      <div className="px-5 pt-5 pb-3 flex items-center justify-between">
        <span className="font-extrabold text-blue-600 text-lg tracking-tight">
          {t('app_name')}
        </span>
        <button
          onClick={onClose}
          className="lg:hidden text-gray-400 dark:text-gray-500
                     hover:text-gray-700 dark:hover:text-gray-300 p-1"
        >
          <X size={20} />
        </button>
      </div>

      {/* ── Perfil de la tienda ───────────────────────────────────── */}
      <StoreProfile
        logo={STORE_CONFIG.logo}
        displayName={STORE_CONFIG.displayName}
        name={STORE_CONFIG.name}
        ownerNames={STORE_CONFIG.ownerNames}
      />

      {/* ── Separador + etiqueta de sección ──────────────────────── */}
      <p className="px-5 pt-3 pb-1 text-[10px] font-semibold text-gray-400
                    dark:text-gray-600 uppercase tracking-widest">
        {t('nav_section_label')}
      </p>

      {/* ── Nav items ────────────────────────────────────────────── */}
      <nav className="flex-1 py-1 space-y-0.5 px-3 overflow-y-auto">
        {NAV.map(({ to, labelKey, icon: Icon }) => (
          <NavLink
            key={to} to={to}
            onClick={onClose}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition
               ${isActive
                 ? 'bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400'
                 : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'}`
            }
          >
            <Icon size={18} />
            {t(labelKey)}
          </NavLink>
        ))}
      </nav>

      {/* ── Scanner al fondo ─────────────────────────────────────── */}
      <div className="p-4 border-t border-gray-100 dark:border-gray-800">
        <button
          onClick={handleScanner}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-bold
                     bg-blue-600 text-white hover:bg-blue-500 transition justify-center"
        >
          <Scan size={18} />
          {t('nav_scanner')}
        </button>
      </div>
    </aside>
  )
}
