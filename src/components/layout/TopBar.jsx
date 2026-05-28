import { useLocation, NavLink } from 'react-router-dom'
import { Menu, Scan, Bell } from 'lucide-react'
import { useI18n } from '../../lib/i18n'
import { useDarkMode } from '../../hooks/useDarkMode'

const TITLE_KEYS = {
  '/dashboard': 'title_dashboard',
  '/stock':     'title_stock',
  '/ventas':    'title_ventas',
  '/deudas':    'title_deudas',
  '/compras':   'title_compras',
  '/ingresos':  'title_ingresos',
  '/settings':  'title_settings',
  '/pokedex':   'title_pokedex',
}

export default function TopBar({ onMenuToggle }) {
  const { pathname } = useLocation()
  const { t, lang, setLang } = useI18n()
  const { dark, toggle: toggleDark } = useDarkMode()

  const titleKey = TITLE_KEYS[pathname]
  const title = titleKey ? t(titleKey) : 'Snap Stock'

  return (
    <header className="h-14 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800
                       flex items-center px-4 gap-3 sticky top-0 z-20">
      {/* Hamburger (mobile) */}
      <button onClick={onMenuToggle} className="lg:hidden text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 p-1">
        <Menu size={22} />
      </button>

      <h1 className="font-bold text-gray-800 dark:text-gray-100 flex-1">{title}</h1>

      {/* Lang toggle */}
      <button
        onClick={() => setLang(lang === 'es' ? 'en' : 'es')}
        title={lang === 'es' ? 'Switch to English' : 'Cambiar a Español'}
        className="w-8 h-8 flex items-center justify-center rounded-xl text-base
                   hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
      >
        {lang === 'es' ? '🇦🇷' : '🇺🇸'}
      </button>

      {/* Dark mode toggle */}
      <button
        onClick={toggleDark}
        title={dark ? 'Modo claro' : 'Modo oscuro'}
        className="w-8 h-8 flex items-center justify-center rounded-xl text-base
                   hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
      >
        {dark ? '☀️' : '🌙'}
      </button>

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
        title={t('scanner_mobile_only')}
        className="hidden lg:flex items-center gap-1.5 px-3 py-1.5
                   bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500 text-sm rounded-xl cursor-not-allowed"
      >
        <Scan size={16} /> Scanner
      </button>

      <button className="text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 p-1">
        <Bell size={20} />
      </button>
    </header>
  )
}
