// Compound — push-only service worker. It exists so the installed PWA can show
// the rest-timer notification when Compound is backgrounded or closed (iOS
// suspends the page's own JS). It deliberately does NOT cache the app: the
// sync protocol assumes one atomic index.html, and a caching SW could serve
// stale bytes. Registered on demand when the athlete enables rest-timer alerts.
self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });

self.addEventListener('push', function (e) {
  var data = {};
  try { data = e.data ? e.data.json() : {}; } catch (err) { data = { body: e.data && e.data.text() }; }
  var title = data.title || 'Time to hit it 💪';
  var opts = {
    body: data.body || '',
    tag: data.tag || 'rest',
    renotify: true,
    vibrate: [120, 60, 120],
    data: { url: data.url || self.registration.scope },
  };
  e.waitUntil(self.registration.showNotification(title, opts));
});

self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  var url = (e.notification.data && e.notification.data.url) || self.registration.scope;
  e.waitUntil((async function () {
    var wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (var i = 0; i < wins.length; i++) { if ('focus' in wins[i]) { try { await wins[i].focus(); } catch (x) {} return; } }
    if (self.clients.openWindow) return self.clients.openWindow(url);
  })());
});
