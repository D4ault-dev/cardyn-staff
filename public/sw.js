// Service Worker for offline support
const CACHE_NAME = 'cardyn-staff-v2.5.5'
const RUNTIME_CACHE = 'cardyn-runtime'

// Assets to cache on install
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
]

// Install - precache core assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE_ASSETS))
      .then(() => self.skipWaiting())
  )
})

// Activate - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames
          .filter(name => name !== CACHE_NAME && name !== RUNTIME_CACHE)
          .map(name => caches.delete(name))
      )
    }).then(() => self.clients.claim())
  )
})

// Fetch - network first, fallback to cache for offline support
self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  // Skip non-GET requests
  if (request.method !== 'GET') return

  // Skip chrome-extension and other protocols
  if (!url.protocol.startsWith('http')) return

  // API requests - network first, cache fallback
  if (url.pathname.startsWith('/tuka') || url.pathname.startsWith('/getInfo')) {
    event.respondWith(
      fetch(request)
        .then(response => {
          // Cache successful API responses for offline access
          if (response.ok) {
            const responseClone = response.clone()
            caches.open(RUNTIME_CACHE).then(cache => {
              cache.put(request, responseClone)
            })
          }
          return response
        })
        .catch(() => {
          // Network failed - try cache
          return caches.match(request).then(cached => {
            if (cached) return cached
            // Return offline response
            return new Response(
              JSON.stringify({ code: 503, msg: 'Offline - using cached data' }),
              { status: 503, headers: { 'Content-Type': 'application/json' } }
            )
          })
        })
    )
    return
  }

  // Static assets - cache first, network fallback
  event.respondWith(
    caches.match(request).then(cached => {
      return cached || fetch(request).then(response => {
        // Cache static assets
        if (response.ok && (
          url.pathname.endsWith('.js') ||
          url.pathname.endsWith('.css') ||
          url.pathname.endsWith('.png') ||
          url.pathname.endsWith('.jpg') ||
          url.pathname.endsWith('.svg')
        )) {
          const responseClone = response.clone()
          caches.open(CACHE_NAME).then(cache => {
            cache.put(request, responseClone)
          })
        }
        return response
      })
    })
  )
})
