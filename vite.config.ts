import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { execSync } from 'node:child_process'

/**
 * Rolling version: the build number is the commit count on main, so it goes up by itself with every push.
 * Shown quietly on Settings as "v312 · 23 Nov 2026" (commit date), with the commit hash on hover.
 */
function appVersion() {
  const git = (cmd: string) => {
    try {
      return execSync(`git ${cmd}`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
    } catch {
      return ''
    }
  }
  return { build: git('rev-list --count HEAD') || '0', date: git('log -1 --format=%cs'), sha: git('rev-parse --short HEAD') }
}

// GitHub Pages serves the site from /<repo-name>/. Override with VITE_BASE if the repo name changes.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const base = mode === 'production' ? (env.VITE_BASE ?? '/on-deck/') : '/'

  return {
    base,
    define: { __APP_VERSION__: JSON.stringify(appVersion()) },
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
