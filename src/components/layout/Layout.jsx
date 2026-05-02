import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import TopBar from './TopBar'

export default function Layout() {
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <div className="min-h-screen bg-[#F7F8FC] font-['DM_Sans',sans-serif]">
      {/* Overlay mobile — cierra el sidebar al tocar afuera */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-20 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <Sidebar open={mobileOpen} onClose={() => setMobileOpen(false)} />

      {/* Contenido principal */}
      <div className="lg:pl-52 flex flex-col min-h-screen">
        <TopBar onMenuToggle={() => setMobileOpen(o => !o)} />
        <main className="flex-1 p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
