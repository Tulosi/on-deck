import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

/**
 * Rolling version: MAJOR, then the build number (the commit count on main, so it goes up by itself with every
 * push). Shown quietly on Settings as "v0.312, 23 Nov 2026" (commit date), with the commit hash on hover.
 * MAJOR stays 0 until the owner calls it 1.0.
 */
const MAJOR = 0

function appVersion() {
  const git = (cmd: string) => {
    try {
      return execSync(`git ${cmd}`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
    } catch {
      return ''
    }
  }
  return { build: `${MAJOR}.${git('rev-list --count HEAD') || '0'}`, date: git('log -1 --format=%cs'), sha: git('rev-parse --short HEAD') }
}

// GitHub Pages serves the site from /<repo-name>/. Override with VITE_BASE if the repo name changes.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const base = mode === 'production' ? (env.VITE_BASE ?? '/on-deck/') : '/'

  return {
    base,
    define: { __APP_VERSION__: JSON.stringify(appVersion()) },
    // Live updates aren't used: a small stand-in replaces supabase-js's realtime client (see src/lib/realtimeStub.ts).
    resolve: { alias: { '@supabase/realtime-js': fileURLToPath(new URL('./src/lib/realtimeStub.ts', import.meta.url)) } },
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        // 'prompt': a new version waits until you reload (src/lib/pwaUpdate.ts offers it with a toast), instead of the old
        // one hanging on until a second reload.
        registerType: 'prompt',
        includeAssets: ['icon.svg'],
        // Web Push: the generated service worker also loads the push handler (public/push-sw.js).
        workbox: { importScripts: ['push-sw.js'] },
        manifest: {
          name: 'On Deck',
          short_name: 'On Deck',
          description: 'The movies, shows, games and books you actually intend to get to.',
          theme_color: '#1e1812',
          background_color: '#1e1812',
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
