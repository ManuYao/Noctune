import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Noctune',
        short_name: 'Noctune',
        description: 'Écoute collective dans des rooms musicales',
        theme_color: '#0e0b1f',
        background_color: '#0e0b1f',
        display: 'standalone',
        icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
      },
    }),
  ],
  server: {
    proxy: { '/socket.io': { target: 'http://localhost:3001', ws: true } },
  },
})
