import axios from 'axios'

// ── Base URL ──────────────────────────────────────────────────────────────────
const isDev = typeof window !== 'undefined' && window.location.hostname === 'localhost'
export let BASE_URL = isDev ? '' : (localStorage.getItem('cardyn_base_url') || 'https://api.cardyn.net')

export function setBaseUrl(url: string) {
  BASE_URL = url
  localStorage.setItem('cardyn_base_url', url)
  client.defaults.baseURL = url
}

// ── Short-lived GET cache — deduplicates identical requests within 30s ────────
// NOTE: Real-time endpoints (poll, chat messages) are excluded — see CACHE_EXCLUDE
const _cache = new Map<string, { data: any; ts: number }>()
const CACHE_TTL = 30_000  // 30 seconds — fast panel, avoids redundant refetches

// Endpoints that must NEVER be cached — they are real-time pollers
const CACHE_EXCLUDE = [
  '/tuka/chat/poll/',
  '/tuka/chat/messages/',
  '/tuka/chat/admin/sessions',
  '/tuka/chat/admin/new-sessions',
  '/tuka/chat/admin/dashboard-poll',
  '/tuka/staff/heartbeat',
  '/tuka/staff/online',
]

function isExcluded(url: string): boolean {
  return CACHE_EXCLUDE.some(prefix => url.includes(prefix))
}

function getCached(key: string) {
  const entry = _cache.get(key)
  if (entry && Date.now() - entry.ts < CACHE_TTL) return entry.data
  return null
}
function setCached(key: string, data: any) {
  _cache.set(key, { data, ts: Date.now() })
  if (_cache.size > 100) {
    const now = Date.now()
    for (const [k, v] of _cache.entries()) {
      if (now - v.ts > CACHE_TTL * 2) _cache.delete(k)
    }
  }
}

/** Clear all axios-level GET cache entries whose URL contains a given substring */
export function clearClientCacheByUrl(urlSubstring: string): void {
  for (const k of _cache.keys()) {
    if (k.includes(urlSubstring)) _cache.delete(k)
  }
}

/** Clear the entire axios-level GET cache (call after any mutation) */
export function clearClientCache(): void {
  _cache.clear()
}

// ── In-flight request deduplication ──────────────────────────────────────────
// Maps a request key → the in-flight Promise so concurrent identical GET
// requests share a single network call instead of firing duplicates.
const _inflight = new Map<string, Promise<any>>()

// ── Axios instance ────────────────────────────────────────────────────────────
const client = axios.create({
  baseURL: BASE_URL,
  timeout: 10000,  // 10s — appropriate for a staff panel
  headers: { 'Content-Type': 'application/json' },
})

// ── Request interceptor — serve cached GET responses ─────────────────────────
client.interceptors.request.use(config => {
  if (config.method?.toLowerCase() === 'get' && config.url && !isExcluded(config.url)) {
    const key = config.url + JSON.stringify(config.params || {})
    const cached = getCached(key)
    if (cached) {
      const source = axios.CancelToken.source()
      config.cancelToken = source.token
      source.cancel(JSON.stringify({ __cached: true, data: cached }))
    }
  }
  return config
})

export function setAuthToken(token: string) {
  localStorage.setItem('cardyn_staff_token', token)
  client.defaults.headers.common['Authorization'] = `Bearer ${token}`
}
export function clearAuthToken() {
  localStorage.removeItem('cardyn_staff_token')
  delete client.defaults.headers.common['Authorization']
}
export function restoreToken() {
  const t = localStorage.getItem('cardyn_staff_token')
    || localStorage.getItem('tuka_staff_token')
  if (t) {
    client.defaults.headers.common['Authorization'] = `Bearer ${t}`
    if (localStorage.getItem('tuka_staff_token')) {
      localStorage.setItem('cardyn_staff_token', t)
      localStorage.removeItem('tuka_staff_token')
    }
  }
  return t
}

// ── Response interceptor ──────────────────────────────────────────────────────
client.interceptors.response.use(
  res => {
    // Cache successful GET responses — but never cache real-time endpoints
    if (res.config.method?.toLowerCase() === 'get' && res.config.url && !isExcluded(res.config.url)) {
      const key = res.config.url + JSON.stringify(res.config.params || {})
      setCached(key, res.data)
    }
    const d = res.data
    if (d.code !== undefined && d.code !== 200) {
      if (d.code === 401) clearAuthToken()
      return Promise.reject(new Error(d.msg || 'Request failed'))
    }
    return res
  },
  err => {
    // Handle cached response (cancel token trick)
    if (axios.isCancel(err)) {
      try {
        const parsed = JSON.parse(err.message)
        if (parsed.__cached) {
          return Promise.resolve({ data: parsed.data, status: 200, headers: {}, config: err.config || {} })
        }
      } catch { /* not a cache cancel */ }
    }
    if (err.response?.status === 401) clearAuthToken()
    return Promise.reject(new Error(err.response?.data?.msg || err.message || 'Network error'))
  }
)

// ── Retry helper — retries once on network error with 500ms delay ─────────────
function delay(ms: number) {
  return new Promise<void>(resolve => setTimeout(resolve, ms))
}

function isNetworkError(err: any): boolean {
  // Network errors have no response (timeout, DNS failure, connection refused)
  return !err.response && err.message !== 'canceled'
}

/**
 * Wraps client.get with:
 * 1. Request deduplication — concurrent identical GETs share one promise
 * 2. Retry once on network error with 500ms delay
 */
const originalGet = client.get.bind(client)
client.get = function dedupedGet(url: string, config?: any): any {
  // Never deduplicate real-time poll endpoints — each tick must fire independently
  if (isExcluded(url)) {
    return originalGet(url, config)
      .catch(async (err: any) => {
        if (isNetworkError(err)) { await delay(500); return originalGet(url, config) }
        throw err
      })
  }

  const key = url + JSON.stringify(config?.params || {})

  // Return existing in-flight promise if one exists
  const existing = _inflight.get(key)
  if (existing) return existing

  const promise = originalGet(url, config)
    .catch(async (err: any) => {
      // Retry once on network error
      if (isNetworkError(err)) {
        await delay(500)
        return originalGet(url, config)
      }
      throw err
    })
    .finally(() => {
      _inflight.delete(key)
    })

  _inflight.set(key, promise)
  return promise
} as typeof client.get

export default client

// ── Auto-restore token on module load ────────────────────────────────────────
// This ensures the Authorization header is set immediately when the app starts,
// before any React effects run. Critical for Electron where localStorage persists.
restoreToken()
