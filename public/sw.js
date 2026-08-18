/* Recipe Keeper service worker.
   App shell is cached so the library works with no connection at all.
   Recipe data itself lives in IndexedDB and never depends on the network.
   The service worker also captures the Web Share Target POST so a screenshot
   shared from another app opens straight into photo import. */

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
    await Promise.all(keys.filter((k) => k !== CACHE && k !== 'shared-media').map((k) => caches.delete(k)))
    await self.clients.claim()
  })())
})

self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') self.skipWaiting()
})

async function handleShareTarget(req, url) {
  const base = url.origin + url.pathname.replace(/share-target$/, '')
  try {
    const form = await req.formData()
    const images = form.getAll('image').filter((f) => f && typeof f !== 'string' && f.size > 0)
    if (images.length) {
      const cache = await caches.open('shared-media')
      for (const k of await cache.keys()) {
        if (k.url.includes('__shared_img_')) await cache.delete(k)
      }
      let i = 0
      for (const file of images) {
        await cache.put(base + '__shared_img_' + i, new Response(file, { headers: { 'content-type': file.type || 'image/jpeg' } }))
        i++
      }
      return Response.redirect(base + '#/import?shared=photo', 303)
    }
    const title = form.get('title') || ''
    const text = form.get('text') || ''
    const link = form.get('url') || ''
    const qs = new URLSearchParams()
    if (title) qs.set('title', title)
    if (text) qs.set('text', text)
    if (link) qs.set('url', link)
    const q = qs.toString()
    return Response.redirect(base + (q ? '?' + q : ''), 303)
  } catch {
    return Response.redirect(base, 303)
  }
}

self.addEventListener('fetch', (event) => {
  const req = event.request

  let url
  try { url = new URL(req.url) } catch { return }
  if (url.origin !== self.location.origin) return

  // Web Share Target (POST): stash any shared image, then hand off to the app.
  if (req.method === 'POST' && url.pathname.endsWith('/share-target')) {
    event.respondWith(handleShareTarget(req, url))
    return
  }

  if (req.method !== 'GET') return

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
