import axios from 'axios'
import Cookies from 'js-cookie'
import { ElMessage } from 'element-plus'

const TOKEN_KEY = 'staff_token'

export function getToken() { return Cookies.get(TOKEN_KEY) }
export function setToken(t) { Cookies.set(TOKEN_KEY, t, { expires: 7 }) }
export function removeToken() { Cookies.remove(TOKEN_KEY) }

// ── Short-lived GET cache — same pattern as admin panel ───────────────────────
// Deduplicates identical requests within session — makes page switches instant
const _cache = new Map()
const CACHE_TTL = 60_000          // 1 min default
const CACHE_TTL_LONG = 300_000    // 5 min for static data (countries, config)

// Never cache real-time endpoints
const NO_CACHE = ['/tuka/chat/poll/', '/tuka/chat/messages/', '/tuka/chat/admin/sessions', '/tuka/staff/heartbeat', '/tuka/staff/online', '/tuka/chat/admin/new-sessions', '/tuka/staff/dashboard-poll']
const noCache = (url) => NO_CACHE.some(p => url.includes(p))

// Long-cache static endpoints
const LONG_CACHE = ['/tuka/country/', '/tuka/currency/', '/tuka/cardCategory/']
const isLongCache = (url) => LONG_CACHE.some(p => url.includes(p))

function getCached(key) {
  const e = _cache.get(key)
  if (!e) return null
  const ttl = isLongCache(key) ? CACHE_TTL_LONG : CACHE_TTL
  if (Date.now() - e.ts < ttl) return e.data
  return null
}
function setCached(key, data) {
  _cache.set(key, { data, ts: Date.now() })
  if (_cache.size > 100) {
    const now = Date.now()
    for (const [k, v] of _cache.entries()) {
      const ttl = isLongCache(k) ? CACHE_TTL_LONG : CACHE_TTL
      if (now - v.ts > ttl * 2) _cache.delete(k)
    }
  }
}

export function clearCache(urlSubstr) {
  if (!urlSubstr) { _cache.clear(); return }
  for (const k of _cache.keys()) {
    if (k.includes(urlSubstr)) _cache.delete(k)
  }
}

// ── In-flight deduplication — prevents duplicate concurrent requests ──────────
const _inflight = new Map()

const instance = axios.create({
  // In dev: empty baseURL — Vite proxy handles routing to api.cardyn.net (avoids CORS)
  // In production: direct URL — Tauri production builds use tauri://localhost origin
  // The backend allows tauri://localhost in CORS since it's a trusted desktop client
  baseURL: import.meta.env.VITE_APP_BASE_API || '',
  timeout: 15000,
})

instance.interceptors.request.use(config => {
  const token = getToken()
  if (token) config.headers['Authorization'] = 'Bearer ' + token
  return config
})

instance.interceptors.response.use(
  res => {
    // Cache successful GET responses
    if (res.config.method?.toLowerCase() === 'get' && res.config.url && !noCache(res.config.url)) {
      const key = res.config.url + JSON.stringify(res.config.params || {})
      setCached(key, res.data)
    }
    const d = res.data
    if (d.code !== undefined && d.code !== 200) {
      if (d.code === 401) {
        removeToken()
        // Dispatch event — router listener in App.vue handles the redirect
        window.dispatchEvent(new CustomEvent('auth:logout'))
      }
      return Promise.reject(new Error(d.msg || 'Request failed'))
    }
    return res.data
  },
  err => {
    const status = err.response?.status
    if (status === 401) {
      removeToken()
      window.dispatchEvent(new CustomEvent('auth:logout'))
    }
    const msg = err.response?.data?.msg || err.message || 'Network error'
    // Don't show error toast for network timeouts on background polls
    if (!err.config?.url?.includes('poll') && !err.config?.url?.includes('heartbeat')) {
      ElMessage.error(msg)
    }
    return Promise.reject(new Error(msg))
  }
)

// ── Wrap GET with cache + deduplication ───────────────────────────────────────
const _origGet = instance.get.bind(instance)
instance.get = function(url, config) {
  if (noCache(url)) return _origGet(url, config)

  const key = url + JSON.stringify(config?.params || {})

  // Return cached data immediately
  const cached = getCached(key)
  if (cached) return Promise.resolve(cached)

  // Deduplicate in-flight requests
  const existing = _inflight.get(key)
  if (existing) return existing

  const promise = _origGet(url, config).finally(() => _inflight.delete(key))
  _inflight.set(key, promise)
  return promise
}

// ── Main request function — matches admin panel's request() signature ─────────
function request(config) {
  const method = (config.method || 'get').toLowerCase()
  if (method === 'get') {
    return instance.get(config.url, { params: config.params, headers: config.headers })
  }
  // For FormData, do NOT pass headers — let axios set Content-Type with correct boundary
  const opts = config.headers ? { headers: config.headers } : {}
  return instance[method](config.url, config.data, opts)
}

export default request
