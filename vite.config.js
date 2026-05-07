import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  server: {
    // En dev mode, redirige /api/* al deployment de Vercel (donde sí existe la serverless function)
    // Así el proxy de imágenes funciona igual que en producción.
    proxy: {
      '/api': {
        target: 'https://snapstock-wheat.vercel.app',
        changeOrigin: true,
        secure: true,
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Vite 8 / rolldown requiere manualChunks como función
        manualChunks(id) {
          if (id.includes('node_modules/recharts') || id.includes('node_modules/d3'))
            return 'vendor-charts'
          if (id.includes('node_modules/framer-motion'))
            return 'vendor-motion'
          if (id.includes('node_modules/@supabase'))
            return 'vendor-supabase'
          if (id.includes('node_modules/@tanstack'))
            return 'vendor-query'
          if (id.includes('node_modules/date-fns'))
            return 'vendor-dates'
          if (
            id.includes('node_modules/react/') ||
            id.includes('node_modules/react-dom/') ||
            id.includes('node_modules/react-router') ||
            id.includes('node_modules/react-is/')
          ) return 'vendor-react'
        },
      },
    },
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/icon-192.png', 'icons/icon-512.png'],
      manifest: {
        name: 'Snap Stock',
        short_name: 'SnapStock',
        description: 'Gestión de stock para cartas Pokémon TCG',
        theme_color: '#3B6BF5',
        background_color: '#0f0f1a',
        display: 'standalone',
        start_url: '/scanner',
        orientation: 'portrait',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
    }),
  ],
})
