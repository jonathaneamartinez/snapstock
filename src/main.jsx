import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// ── Recuperación de chunks viejos (PWA) ─────────────────────────────────────
// Tras un deploy nuevo cambian los hashes de los .js. Si el navegador tiene una
// versión cacheada y pide un chunk que ya no existe, el import dinámico falla
// ("Failed to fetch dynamically imported module") y la pantalla queda en blanco.
// Solución: recargar UNA vez para traer el index + chunks frescos.
const RELOAD_FLAG = 'snapstock_chunk_reload'
function recoverFromChunkError() {
  if (sessionStorage.getItem(RELOAD_FLAG)) return   // ya recargamos → evitar loop
  sessionStorage.setItem(RELOAD_FLAG, String(Date.now()))
  window.location.reload()
}
const isChunkErr = (msg) =>
  /dynamically imported module|Importing a module script failed|Failed to fetch.*\.js|error loading dynamically imported/i.test(msg || '')
window.addEventListener('vite:preloadError', (e) => { e.preventDefault?.(); recoverFromChunkError() })
window.addEventListener('error', (e) => { if (isChunkErr(e?.message)) recoverFromChunkError() })
window.addEventListener('unhandledrejection', (e) => {
  if (isChunkErr(e?.reason?.message || String(e?.reason || ''))) recoverFromChunkError()
})
// Carga OK → limpiar el flag para permitir futuras recuperaciones
window.addEventListener('load', () => { setTimeout(() => sessionStorage.removeItem(RELOAD_FLAG), 4000) })

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
