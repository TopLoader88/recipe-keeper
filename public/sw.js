/* Recipe Keeper service worker.
   App shell is cached so the library works with no connection at all.
   Recipe data itself lives in IndexedDB and never depends on the network. */

const CACHE = 'recipe-keeper-v1'
const SHELL = ['./', './index.html', './manifest.webmanifest']

self.addEventListener('install', (event) => {
  self.skipWaiting()
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL)).catch(() => {})
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys()
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    await self.clients.claim()
  })())
})

self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') self.skipWaiting()
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return

  let url
  try { url = new URL(req.url) } catch { return }
  if (url.origin !== self.location.origin) return

  // Navigations: network first, fall back to the cached shell when offline.
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        return await fetch(req)
      } catch {
        const cache = await caches.open(CACHE)
        return (await cache.match('./index.html')) || (await cache.match('./')) || Response.error()
      }
    })())
    return
  }

  // Static assets: serve from cache immediately, refresh in the background.
  event.respondWith((async () => {
    const cache = await caches.open(CACHE)
    const cached = await cache.match(req)
    const network = fetch(req)
      .then((res) => {
        if (res && res.ok && res.type === 'basic') cache.put(req, res.clone())
        return res
      })
      .catch(() => null)
    return cached || (await network) || Response.error()
  })())
})
