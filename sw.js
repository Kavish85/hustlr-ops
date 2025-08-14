const VERSION = 'v1.0.0';
const APP_SHELL = ['index.html','styles.css','app.js','manifest.webmanifest','offline.html']
const APP_CACHE = `app-${VERSION}`;
const DATA_CACHE = 'data-cache';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(APP_CACHE).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.map(k => (k !== APP_CACHE && k !== DATA_CACHE) ? caches.delete(k) : null)))
  );
  self.clients.claim();
});

// Runtime: JSON uses stale-while-revalidate, everything else cache-first
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.pathname.startsWith('/data/')) {
    event.respondWith(swr(event.request));
  } else if (APP_SHELL.includes(url.pathname) || url.origin === self.location.origin) {
    event.respondWith(cacheFirst(event.request));
  }
});

async function swr(req){
  const cache = await caches.open(DATA_CACHE);
  const cached = await cache.match(req);
  const network = fetch(req).then(async res => {
    if(res.ok){
      await cache.put(req, res.clone());
      // Tell page there is new data
      const clients = await self.clients.matchAll({includeUncontrolled:true});
      clients.forEach(c => c.postMessage({type:'NEW_DATA'}));
    }
    return res;
  }).catch(()=>null);
  return cached || network || caches.match('/offline.html');
}

async function cacheFirst(req){
  const cached = await caches.match(req);
  return cached || fetch(req).catch(()=>caches.match('/offline.html'));
}

// Optional: notifications when app is open (not push)
self.addEventListener('message', (e)=>{
  if(e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : { title: 'Hustlr', body: 'New digest available' };
  event.waitUntil(self.registration.showNotification(data.title, {
    body: data.body,
    icon: '/icons/h-192.png',
    badge: '/icons/h-192.png'
  }));
});
