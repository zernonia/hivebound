/*
 * Hivebound service worker: lets the game install to a home screen and open offline.
 *
 * - App shell ('/', manifest, icons) is precached on install.
 * - Hashed build files (/_nuxt/…) never change once built, so they're cache-first and stored
 *   the first time they're fetched.
 * - Pages are network-first, so a new deploy shows up right away; offline falls back to the
 *   cached '/'.
 * Only same-origin GETs are ever cached. Bump VERSION to drop every old cache on activate.
 */
const VERSION = 'v2'
const CACHE = `hivebound-${VERSION}`
const SHELL = [
  '/',
  '/manifest.webmanifest',
  '/icon.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-512.png',
  '/icons/apple-touch-icon.png',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      // Skip the HTTP cache so the shell matches the build this worker came with.
      .then(cache => cache.addAll(SHELL.map(url => new Request(url, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('hivebound-') && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

/** Browsers refuse redirected responses for navigations, so store a clean copy. */
async function clean(res) {
  if (!res.redirected) return res
  return new Response(await res.blob(), { status: res.status, statusText: res.statusText, headers: res.headers })
}

async function cacheFirst(req) {
  const hit = await caches.match(req)
  if (hit) return hit
  const res = await fetch(req)
  if (res.ok) {
    const cache = await caches.open(CACHE)
    cache.put(req, res.clone())
  }
  return res
}

async function networkFirst(req, fallbackUrl, storeAs) {
  try {
    const res = await fetch(req)
    if (res.ok && res.type === 'basic') {
      const cache = await caches.open(CACHE)
      cache.put(storeAs || req, (await clean(res.clone())))
    }
    return res
  }
  catch (err) {
    const hit = (await caches.match(storeAs || req)) || (fallbackUrl && (await caches.match(fallbackUrl)))
    if (hit) return hit
    throw err
  }
}

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  // Fonts and anything else off-site go straight to the network, untouched.
  if (url.origin !== self.location.origin) return

  const isPage = req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html')
  if (isPage) {
    // The game is one page: keep the latest copy of '/' as the offline fallback.
    const storeAs = url.pathname === '/' ? '/' : undefined
    event.respondWith(networkFirst(req, '/', storeAs))
    return
  }
  // Nuxt's build manifest (/_nuxt/builds/…) is how it notices a new deploy: never pin it.
  if (url.pathname.startsWith('/_nuxt/builds/')) {
    event.respondWith(networkFirst(req))
    return
  }
  if (url.pathname.startsWith('/_nuxt/')) {
    event.respondWith(cacheFirst(req))
    return
  }
  // Everything else (icons, manifest…): fresh when online, cached copy when not.
  event.respondWith(networkFirst(req))
})
