/* Service worker — PWA install + push notifications (admin + customer). */
self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting())
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request))
})

function parsePushPayload(event) {
  const fallback = {
    title: 'Литком М52',
    body: 'Новое уведомление',
    badge: null,
    url: '/',
    tag: 'litcom52',
  }
  if (!event.data) return fallback
  try {
    return { ...fallback, ...event.data.json() }
  } catch {
    return fallback
  }
}

async function setBadgeCount(count) {
  if (count == null) return
  const value = Number(count) || 0
  if (value > 0 && 'setAppBadge' in self.navigator) {
    await self.navigator.setAppBadge(value)
    return
  }
  if ('clearAppBadge' in self.navigator) {
    await self.navigator.clearAppBadge()
  }
}

self.addEventListener('push', (event) => {
  const data = parsePushPayload(event)
  event.waitUntil(
    (async () => {
      await self.registration.showNotification(data.title, {
        body: data.body,
        icon: '/icon-192-v4.png',
        badge: '/icon-192-v4.png',
        tag: data.tag || 'litcom52',
        renotify: true,
        data: { url: data.url || '/' },
      })
      await setBadgeCount(data.badge)
    })(),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const targetUrl = event.notification.data?.url || '/'
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
