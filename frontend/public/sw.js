/* Cobradía · service worker (D6, decision 135).
 *
 * What it does: make the app installable and open instantly. Hashed assets
 * (/assets/*) are cached for good; the app shell (index.html) is fetched
 * from the network and the last copy kept, so the app opens without signal
 * with a clear «Sin conexión» page instead of a browser error.
 *
 * What it does not do: cache the API. Every /api call goes to the network
 * and fails honestly when there is none; collecting without signal is a
 * later, more delicate step (the cash must never fork). */

const VERSION = 'v1'
const SHELL = `cobradia-shell-${VERSION}`
const ASSETS = `cobradia-assets-${VERSION}`
const OFFLINE_HTML = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sin conexión · Cobradía</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;font-family:system-ui,sans-serif;background:#f3eee3;color:#26302b;padding:24px;text-align:center}main{max-width:420px}h1{font-size:22px;margin:0 0 8px}p{color:#716b5e;line-height:1.5}button{margin-top:16px;padding:12px 20px;border:0;border-radius:10px;background:#0e6b4f;color:#fff;font-weight:600;font-size:15px}</style></head><body><main><h1>Sin conexión</h1><p>Cobradía necesita internet para cobrar y registrar. Cuando vuelva la señal, toca «Reintentar».</p><button onclick="location.reload()">Reintentar</button></main></body></html>`

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((cache) =>
        cache.put(
          '/__offline',
          new Response(OFFLINE_HTML, { headers: { 'Content-Type': 'text/html; charset=utf-8' } }),
        ),
      )
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => ![SHELL, ASSETS].includes(k)).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  if (url.pathname.startsWith('/api/')) return // never cached: money is live

  // Hashed build assets: cache first, forever (their name changes with the content).
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.open(ASSETS).then(async (cache) => {
        const hit = await cache.match(request)
        if (hit) return hit
        const response = await fetch(request)
        if (response.ok) cache.put(request, response.clone())
        return response
      }),
    )
    return
  }

  // The app shell: network first, the last copy if the network fails, the offline page last.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok)
            caches.open(SHELL).then((cache) => cache.put('/__shell', response.clone()))
          return response
        })
        .catch(async () => {
          const cache = await caches.open(SHELL)
          return (await cache.match('/__shell')) || (await cache.match('/__offline'))
        }),
    )
  }
})
