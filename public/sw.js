/* Service worker — PWA install + push notifications. */
self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting())
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request))
})

self.addEventListener('push', (event) => {
  let payload = {
    title: 'Литком М52',
    body: 'Заказ отгружен — можно забирать.',
    url: '/shop',
  }

  try {
    if (event.data) {
      payload = { ...payload, ...event.data.json() }
    }
  } catch {
    // keep defaults
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: '/icon-192-v4.png',
      badge: '/icon-192-v4.png',
      tag: 'litcom52-shipped',
      data: { url: payload.url || '/shop' },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const targetUrl = event.notification.data?.url || '/shop'
  const absolute = new URL(targetUrl, self.location.origin).href

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.startsWith(self.location.origin) && 'focus' in client) {
          return client.focus()
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(absolute)
      return undefined
    }),
  )
})
