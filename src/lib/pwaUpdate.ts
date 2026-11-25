import { registerSW } from 'virtual:pwa-register'
import { toast } from './toast'

const HOUR = 60 * 60_000

/**
 * Keeps the installed app current. The service worker serves the app from its cache, so a new version used to show
 * only after a second reload. Now, once a new version has downloaded, a toast offers "Reload", which switches to it
 * straight away. It's an offer rather than a forced reload, so nothing you're typing is lost.
 *
 * Checks for a new version when the app opens, every hour, and whenever you come back to the tab. If another toast
 * pushes the offer away, it comes back the next time you return to the tab.
 */
export function watchForUpdates() {
  if (!('serviceWorker' in navigator)) return
  let ready = false
  const offer = () =>
    toast({
      message: 'A new version of On Deck is ready',
      action: { label: 'Reload', onClick: () => void update(true) },
      duration: 60_000,
    })
  const update = registerSW({
    onNeedRefresh() {
      ready = true
      offer()
    },
    onRegisteredSW(_url, reg) {
      if (!reg) return
      setInterval(() => void reg.update(), HOUR)
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState !== 'visible') return
        if (ready) offer()
        else void reg.update()
      })
    },
  })
}
