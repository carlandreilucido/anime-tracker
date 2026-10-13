import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['logo.png', 'offline.html'],
      manifest: {
        id: '/',
        name: 'Kitsu',
        short_name: 'Kitsu',
        description: 'A personal anime watchlist and progress tracker.',
        theme_color: '#0B0D14',
        background_color: '#0B0D14',
        display: 'standalone',
        orientation: 'any',
        start_url: '/',
        scope: '/',
        icons: [
          { src: '/pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/rest\//, /^\/auth\//, /^\/functions\//, /^\/storage\//],
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webp,jpg,jpeg,woff2}'],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.origin !== self.location.origin,
            handler: 'NetworkOnly',
          },
          {
            urlPattern: ({ url }) => url.origin === self.location.origin && /\.(?:js|css|png|svg|webp|woff2)$/.test(url.pathname),
            handler: 'CacheFirst',
            options: { cacheName: 'kitsu-static-assets', expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 30 } },
          },
        ],
      },
    }),
  ],
})
