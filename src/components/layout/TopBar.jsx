import { useState } from 'react'
import { useLocation, NavLink } from 'react-router-dom'
import { Menu, Scan, Bell } from 'lucide-react'

const TITLES = {
  '/dashboard': 'Dashboard',
  '/stock':     'Stock de cartas',
  '/ventas':    'Ventas del mes',
  '/deudas':    'Deudas activas',
  '/compras':   'Compras',
  '/ingresos':  'Nuevos ingresos',
  '/settings':  'Settings',
}

export default function TopBar({ onMenuToggle }) {
  const { pathname } = useLocation()
  const title = TITLES[pathname] ?? 'Snap Stock'

  return (
    <header className="h-14 bg-white border-b border-gray-200 flex items-center px-4 gap-4 sticky top-0 z-20">
      {/* Hamburger (mobile) */}
      <button onClick={onMenuToggle} className="lg:hidden text-gray-500 hover:text-gray-800 p-1">
        <Menu size={22} />
      </button>

      <h1 className="font-bold text-gray-800 flex-1">{title}</h1>

      {/* Scanner — solo en mobile */}
      <NavLink
        to="/scanner"
        className="lg:hidden flex items-center gap-1.5 px-3 py-1.5 bg-blue-600
                   text-white text-sm font-semibold rounded-xl"
      >
        <Scan size={16} /> Scanner
      </NavLink>

      {/* Scanner deshabilitado en desktop */}
      <button
        disabled
        title="Solo disponible desde el celular"
        className="hidden lg:flex items-center gap-1.5 px-3 py-1.5
                   bg-gray-100 text-gray-400 text-sm rounded-xl cursor-not-allowed"
      >
        <Scan size={16} /> Scanner
      </button>

      <button className="text-gray-400 hover:text-gray-700 p-1">
        <Bell size={20} />
      </button>
    </header>
  )
}
