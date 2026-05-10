import axios from 'axios'

// ── Base URL ──────────────────────────────────────────────────────────────────
// Dev (localhost): empty string → Vite proxy handles routing to api.cardyn.net
// Production (built Electron): full URL
const isDev = typeof window !== 'undefined' && window.location.hostname === 'localhost'

// In dev, always use proxy (ignore any saved URL in localStorage)
// In prod, use saved URL or fall back to production server
export let BASE_URL = isDev ? '' : (localStorage.getItem('cardyn_base_url') || 'https://api.cardyn.net')

export function setBaseUrl(url: string) {
  BASE_URL = url
  localStorage.setItem('cardyn_base_url', url)
  client.defaults.baseURL = url
}

const client = axios.create({
  baseURL: BASE_URL,
  timeout: 12000,
  headers: { 'Content-Type': 'application/json' },
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
    const d = res.data
    if (d.code !== undefined && d.code !== 200) {
      if (d.code === 401) clearAuthToken()
      return Promise.reject(new Error(d.msg || 'Request failed'))
    }
    return res
  },
  err => {
    if (err.response?.status === 401) clearAuthToken()
    return Promise.reject(new Error(err.response?.data?.msg || err.message || 'Network error'))
  }
)

export default client
