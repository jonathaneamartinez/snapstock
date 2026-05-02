import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard, Package, TrendingUp, Users,
  ShoppingCart, PlusCircle, Settings, Scan,
} from 'lucide-react'

const NAV = [
  { to: '/dashboard', label: 'Dashboard',       icon: LayoutDashboard },
  { to: '/ingresos',  label: 'Nuevos ingresos', icon: PlusCircle      },
  { to: '/stock',     label: 'Stock de cartas', icon: Package         },
  { to: '/ventas',    label: 'Ventas del mes',  icon: TrendingUp      },
  { to: '/deudas',    label: 'Deudas activas',  icon: Users           },
  { to: '/compras',   label: 'Compras',         icon: ShoppingCart    },
  { to: '/settings',  label: 'Settings',        icon: Settings        },
]

export default function Sidebar() {
  return (
    <aside className="hidden lg:flex flex-col w-52 bg-white border-r border-gray-200 h-full fixed left-0 top-0 bottom-0 z-30">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-gray-100">
        <span className="font-extrabold text-blue-600 text-lg tracking-tight">⚡ Snap Stock</span>
        <p className="text-xs text-gray-400 mt-0.5">Singles UT</p>
      </div>

      {/* Nav items */}
      <nav className="flex-1 py-4 space-y-1 px-3 overflow-y-auto">
        {NAV.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to} to={to}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition
               ${isActive
                 ? 'bg-blue-50 text-blue-600'
                 : 'text-gray-600 hover:bg-gray-50'}`
            }
          >
            <Icon size={18} />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* Scanner (siempre al fondo) */}
      <div className="p-4 border-t border-gray-100">
        <NavLink
          to="/scanner"
          className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-bold
                     bg-blue-600 text-white hover:bg-blue-500 transition justify-center"
        >
          <Scan size={18} />
          Abrir Scanner
        </NavLink>
      </div>
    </aside>
  )
}
