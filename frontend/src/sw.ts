/// <reference lib="webworker" />
import { clientsClaim } from 'workbox-core'
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching'

declare let self: ServiceWorkerGlobalScope

type PushPayload = { title?: string; body?: string; url?: string }

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') void self.skipWaiting()
})

self.addEventListener('push', (event: PushEvent) => {
  let payload: PushPayload = { title: 'SOBOLO CHAT', body: 'Nouveau message', url: '/' }
  try {
    const t = event.data?.text()
    if (t) Object.assign(payload, JSON.parse(t) as PushPayload)
  } catch {
    /* garde les défauts */
  }
  const title = payload.title ?? 'SOBOLO CHAT'
  const body = payload.body ?? ''
  const url = payload.url && payload.url.startsWith('/') ? payload.url : '/'
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/icon.png',
      badge: '/icon.png',
      data: { url },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const raw = (event.notification.data as { url?: string } | undefined)?.url ?? '/'
  const targetUrl = new URL(raw, self.location.origin).href
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      for (const c of all) {
        if (!c.url.startsWith(self.location.origin) || !('focus' in c)) continue
        const client = c as WindowClient
        if ('navigate' in client && typeof client.navigate === 'function') {
          try {
            await client.navigate(targetUrl)
          } catch {
            /* ignore */
          }
        }
        await client.focus()
        return
      }
      await self.clients.openWindow(targetUrl)
    })(),
  )
})

self.addEventListener('activate', (e) => {
  e.waitUntil(clientsClaim())
})

// @ts-expect-error __WB_MANIFEST est injecté au build par vite-plugin-pwa (injectManifest)
precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()
