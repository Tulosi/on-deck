import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// GitHub Pages serves the site from /<repo-name>/. Override with VITE_BASE if the repo name changes.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const base = mode === 'production' ? (env.VITE_BASE ?? '/on-deck/') : '/'

  return {
    base,
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['icon.svg'],
        // Web Push: the generated service worker also loads the push handler (public/push-sw.js).
        workbox: { importScripts: ['push-sw.js'] },
        manifest: {
          name: 'On Deck',
          short_name: 'On Deck',
          description: 'The movies, shows, games and books you actually intend to get to.',
          theme_color: '#0c0b0a',
          background_color: '#0c0b0a',
          display: 'standalone',
          start_url: base,
          scope: base,
          icons: [
            { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
            { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          ],
        },
      }),
    ],
  }
})
