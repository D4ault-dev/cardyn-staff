import axios from 'axios'

// ── Base URL ──────────────────────────────────────────────────────────────────
const isDev = typeof window !== 'undefined' && window.location.hostname === 'localhost'
const CODE_BASE_URL = isDev ? '' : 'https://api.cardyn.net'
export let BASE_URL = isDev ? '' : (localStorage.getItem('cardyn_base_url') || 'https://api.cardyn.net')

export function setBaseUrl(url: string) {
  BASE_URL = url
  localStorage.setItem('cardyn_base_url', url)
  client.defaults.baseURL = url
}

// ── In-memory GET cache — deduplicates identical requests within 3s ──────────
const _cache = new Map<string, { data: any; ts: number }>()
const CACHE_TTL = 3000  // 3 seconds

function getCached(key: string) {
  const entry = _cache.get(key)
  if (entry && Date.now() - entry.ts < CACHE_TTL) return entry.data
  return null
}
function setCached(key: string, data: any) {
  _cache.set(key, { data, ts: Date.now() })
  // Auto-cleanup old entries
  if (_cache.size > 100) {
    const now = Date.now()
    for (const [k, v] of _cache.entries()) {
      if (now - v.ts > CACHE_TTL * 2) _cache.delete(k)
    }
  }
}

const client = axios.create({
  baseURL: BASE_URL,
  timeout: 12000,
  headers: { 'Content-Type': 'application/json' },
})

// ── Request interceptor — serve cached GET responses ─────────────────────────
client.interceptors.request.use(config => {
  if (config.method?.toLowerCase() === 'get' && config.url) {
    const key = config.url + JSON.stringify(config.params || {})
    const cached = getCached(key)
    if (cached) {
      // Return cached response by throwing a special "error" that the response interceptor catches
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

client.interceptors.response.use(
  res => {
    // Cache successful GET responses
    if (res.config.method?.toLowerCase() === 'get' && res.config.url) {
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
          // Return a fake response with cached data
          return Promise.resolve({ data: parsed.data, status: 200, headers: {}, config: err.config || {} })
        }
      } catch { /* not a cache cancel */ }
    }
    if (err.response?.status === 401) clearAuthToken()
    return Promise.reject(new Error(err.response?.data?.msg || err.message || 'Network error'))
  }
)

export default client
