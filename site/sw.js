/* PWA lifecycle: activate promptly without caching authenticated or dynamic responses. */
self.addEventListener('install', (event) => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : { body: event.data?.text() || '' }; } catch {}
  event.waitUntil(self.registration.showNotification(data.title || 'آکادمی وکالت', {
    body: data.body || 'یادآوری جدید دارید.',
    icon: '/assets/favicon.svg',
    badge: '/assets/favicon.svg',
    data: { url: data.url || '/#/deadlines' },
    dir: 'rtl', lang: 'fa', tag: 'mokhtari-calendar-reminder', renotify: true
  }));
});
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || '/#/deadlines', self.location.origin).href;
  event.waitUntil((async () => {
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of clients) {
      if (client.url.startsWith(self.location.origin)) {
        await client.focus();
        if (client.navigate) await client.navigate(target);
        return;
      }
    }
    if (self.clients.openWindow) await self.clients.openWindow(target);
  })());
});
