// Rovex's service worker: it exists for one job — showing an alert notification and
// landing a tap on the alert centre. No caching, no offline shell: the app is dynamic and a
// stale shell would be worse than none.

self.addEventListener('install', () => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(self.clients.claim());
});

const FALLBACK = { title: 'Rovex', body: 'An alert fired.', url: '/alerts' };

self.addEventListener('push', (event) => {
    let payload = FALLBACK;
    try {
        payload = { ...FALLBACK, ...(event.data ? event.data.json() : {}) };
    } catch {
        // A payload that is not ours (or not JSON): the fallback still tells the truth.
    }

    event.waitUntil(
        self.registration.showNotification(payload.title, {
            body: payload.body,
            icon: '/assets/images/logo.png',
            badge: '/assets/images/logo.png',
            // One tag per symbol would need the symbol here; a single tag keeps the tray tidy and
            // renotify still buzzes for a new firing.
            tag: 'openstock-alert',
            renotify: true,
            data: { url: payload.url || FALLBACK.url },
        }),
    );
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const target = new URL(event.notification.data?.url || FALLBACK.url, self.location.origin).href;

    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
            for (const client of clients) {
                // Reuse a tab we already own instead of piling up alert centres.
                if (client.url.startsWith(self.location.origin) && 'focus' in client) {
                    if ('navigate' in client) client.navigate(target);
                    return client.focus();
                }
            }
            return self.clients.openWindow(target);
        }),
    );
});
