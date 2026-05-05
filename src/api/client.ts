import axios from 'axios'

// ── IMPORTANT: Update this when your IP changes ──────────────────────────────
const CODE_BASE_URL = 'http://74.48.115.175'

// User-saved override (set via ⚙ settings button) takes priority over code value
// But we ALWAYS clear stale cached IPs that don't match the current code value
const savedUrl = localStorage.getItem('tuka_base_url')
// If saved URL looks like a different subnet/IP than code, clear it
function isSameHost(a: string, b: string) {
  try { return new URL(a).hostname === new URL(b).hostname } catch { return false }
}
if (savedUrl && !isSameHost(savedUrl, CODE_BASE_URL)) {
  // Stale IP from old network — clear it so code value is used
  localStorage.removeItem('tuka_base_url')
}

export let BASE_URL = localStorage.getItem('tuka_base_url') || CODE_BASE_URL

export function setBaseUrl(url: string) {
  BASE_URL = url
  localStorage.setItem('tuka_base_url', url)
  client.defaults.baseURL = url
}

const client = axios.create({
  baseURL: BASE_URL,
  timeout: 12000,
  headers: { 'Content-Type': 'application/json' },
})

export function setAuthToken(token: string) {
  localStorage.setItem('tuka_staff_token', token)
  client.defaults.headers.common['Authorization'] = `Bearer ${token}`
}
export function clearAuthToken() {
  localStorage.removeItem('tuka_staff_token')
  delete client.defaults.headers.common['Authorization']
}
export function restoreToken() {
  const t = localStorage.getItem('tuka_staff_token')
  if (t) client.defaults.headers.common['Authorization'] = `Bearer ${t}`
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
