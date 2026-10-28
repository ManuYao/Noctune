import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // 'prompt': the page decides when to switch to a new version (src/pwa/updateWatcher.ts): at once outside a room, with
      // a banner in a room (a reload there would cut the music and the place).
      registerType: 'prompt',
      manifest: {
        name: 'Noctune',
        short_name: 'Noctune',
        description: 'Écoute collective dans des rooms musicales',
        theme_color: '#0e0b1f',
        background_color: '#0e0b1f',
        display: 'standalone',
        orientation: 'any',
        lang: 'fr',
        id: '/',
        start_url: '/',
        scope: '/',
        categories: ['music', 'entertainment'],
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
        ],
      },
      workbox: {
        // The worker only serves the page shell: the API, the realtime connection and the health check always reach the
        // server (a navigation to /api/auth/export must download the file, not get index.html).
        navigateFallbackDenylist: [/^\/api\//, /^\/socket\.io\//, /^\/healthz/],
      },
    }),
  ],
  server: {
    // The accounts API and the realtime connection are the same server: forwarding both keeps the session cookie on
    // the site's own address (a cookie is only sent back to the address that set it).
    proxy: {
      '/socket.io': { target: 'http://localhost:3001', ws: true },
      '/api': { target: 'http://localhost:3001' },
    },
  },
})
