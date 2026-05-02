import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import Layout   from './components/layout/Layout'
import Home     from './pages/Home'
import Stock    from './pages/Stock'
import Ventas   from './pages/Ventas'
import Deudas   from './pages/Deudas'
import Compras  from './pages/Compras'
import Ingresos from './pages/Ingresos'
import Settings from './pages/Settings'
import Scanner  from './pages/Scanner'

const qc = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
})

export default function App() {
  return (
    <QueryClientProvider client={qc}>
      <BrowserRouter>
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
          </Route>

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
