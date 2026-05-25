import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import Layout      from './components/layout/Layout'
import LockScreen  from './components/auth/LockScreen'
import { useAuth } from './hooks/useAuth'
import { I18nProvider } from './lib/i18n'

/* ─── Lazy load de páginas ────────────────────────────────────────────────
   Cada página se descarga solo cuando el usuario navega a ella.
   Layout y Scanner son pequeños y se cargan siempre.
──────────────────────────────────────────────────────────────────────── */
const Home     = lazy(() => import('./pages/Home'))
const Stock    = lazy(() => import('./pages/Stock'))
const Ventas   = lazy(() => import('./pages/Ventas'))
const Deudas   = lazy(() => import('./pages/Deudas'))
const Compras  = lazy(() => import('./pages/Compras'))
const Ingresos = lazy(() => import('./pages/Ingresos'))
const Settings = lazy(() => import('./pages/Settings'))
const Scanner  = lazy(() => import('./pages/Scanner'))
const Claims   = lazy(() => import('./pages/Claims'))

/* ─── Spinner de carga de página ─────────────────────────────────────── */
function PageLoader() {
  return (
    <div className="flex items-center justify-center w-full h-full min-h-[60vh]">
      <div className="w-7 h-7 rounded-full border-[3px] border-blue-200 border-t-blue-500 animate-spin" />
    </div>
  )
}

const qc = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
})

function AuthGate({ children }) {
  const { authenticated, unlock } = useAuth()
  if (!authenticated) return <LockScreen onUnlock={unlock} />
  return children
}

export default function App() {
  return (
    <I18nProvider>
    <QueryClientProvider client={qc}>
      <BrowserRouter>
        <AuthGate>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            {/* Scanner — fullscreen, sin layout */}
            <Route path="/scanner" element={<Scanner />} />

            {/* Dashboard — con sidebar + topbar */}
            <Route element={<Layout />}>
              <Route index element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<Home />}     />
              <Route path="/stock"     element={<Stock />}    />
              <Route path="/ventas"    element={<Ventas />}   />
              <Route path="/deudas"    element={<Deudas />}   />
              <Route path="/compras"   element={<Compras />}  />
              <Route path="/ingresos"  element={<Ingresos />} />
              <Route path="/settings"  element={<Settings />} />
              <Route path="/claims"    element={<Claims />}   />
            </Route>

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </Suspense>
        </AuthGate>
      </BrowserRouter>
    </QueryClientProvider>
    </I18nProvider>
  )
}
