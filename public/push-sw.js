// Web Push handler, loaded into the generated service worker (vite.config.ts → workbox.importScripts).
// Payload (sent by the `daily` Edge Function): { title, body, url, tag }.
/* eslint-env serviceworker */

self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { body: event.data ? event.data.text() : '' }
  }
  const scope = self.registration.scope
  event.waitUntil(
    self.registration.showNotification(data.title || 'On Deck', {
      body: data.body || '',
      tag: data.tag || undefined,
      icon: new URL('icon-192.png', scope).href,
      badge: new URL('icon-192.png', scope).href,
      data: { url: new URL(data.url || '', scope).href },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || self.registration.scope
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      for (const client of windows) {
        if (client.url.startsWith(self.registration.scope) && 'focus' in client) {
          await client.focus()
          if ('navigate' in client) await client.navigate(url)
          return
        }
      }
      await self.clients.openWindow(url)
    })(),
  )
})
