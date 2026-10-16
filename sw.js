/* VIVA Portal ― サービスワーカー
   - ページは「まずネットから、つながらなければ前に見たもの」を出す（いつも新しい内容が優先）
   - 一度も見ていないページで電波がないときは offline.html
   - 通知（プッシュ）を受け取って表示する
   作り直したときは VERSION の数字を上げると、古い保存分が消える */
const VERSION = 'viva-portal-1';
const SHELL = ['/portal.html', '/offline.html', '/style.css', '/script.js', '/live.js',
  '/server-icon.png', '/icons/icon-192.png', '/icons/badge-96.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;                 // 外のサイト（フォント・スキン画像など）はブラウザに任せる
  if (url.pathname.startsWith('/api/') || url.pathname === '/map' || url.pathname.startsWith('/map/')) return;

  e.respondWith(
    fetch(req).then((res) => {
      if (res.ok && res.type === 'basic') {
        const copy = res.clone();
        caches.open(VERSION).then((c) => c.put(req, copy));
      }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: req.mode === 'navigate' }).then((hit) =>
      hit || (req.mode === 'navigate' ? caches.match('/offline.html') : Response.error())))
  );
});

self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) { d = { body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'VIVA-MC', {
    body: d.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/badge-96.png',
    tag: d.tag || 'viva',
    renotify: true,
    data: { url: d.url || '/portal.html' }
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const target = new URL((e.notification.data && e.notification.data.url) || '/portal.html', location.origin).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    for (const c of list) {
      if (c.url.startsWith(location.origin) && 'focus' in c) {
        c.navigate(target);
        return c.focus();
      }
    }
    return self.clients.openWindow(target);
  }));
});
