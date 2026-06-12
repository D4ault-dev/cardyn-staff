import { BASE_URL } from '../api/client'

const isDev = typeof window !== 'undefined' && window.location.hostname === 'localhost'

/**
 * Resolve an image URL so it loads correctly in both dev and production.
 *
 * Dev (localhost:5173):
 *   - Returns a relative /files/... path so Vite proxy handles it
 *     (avoids CORS issues with direct browser requests to api.cardyn.net)
 *
 * Production (Electron):
 *   - Returns absolute https://api.cardyn.net/files/... URL
 *
 * Path rewrites:
 *   /profile/upload/... → /files/upload/...  (public endpoint, no auth needed)
 *   /files/...          → kept as-is
 *   http://localhost/.. → host replaced with api.cardyn.net
 */
export function resolveUrl(url: string | null | undefined): string {
  if (!url) return ''

  let resolved = url

  // Replace any local/dev host with the production API host
  if (resolved.startsWith('http://localhost') ||
      resolved.startsWith('http://127.0.0.1') ||
      resolved.startsWith('http://192.168') ||
      resolved.startsWith('http://10.')) {
    resolved = resolved.replace(/^https?:\/\/[^/]+/, isDev ? '' : (BASE_URL || 'https://api.cardyn.net'))
  }

  // Strip the production host in dev so it goes through the Vite proxy
  if (isDev && (resolved.startsWith('https://api.cardyn.net') || resolved.startsWith('http://api.cardyn.net'))) {
    resolved = resolved.replace(/^https?:\/\/api\.cardyn\.net/, '')
  }

  // Rewrite /profile/ → /files/ (public static file endpoint)
  resolved = resolved.replace('/profile/', '/files/')

  // In production: prepend base URL for relative paths
  if (!isDev && resolved.startsWith('/')) {
    const base = BASE_URL || 'https://api.cardyn.net'
    resolved = `${base}${resolved}`
  }

  return resolved
}
