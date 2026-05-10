import { BASE_URL } from '../api/client'

/**
 * Resolve an image URL from the backend.
 *
 * Backend returns paths like:
 *   /profile/upload/2026/05/xxx.jpg  → rewrite to /files/upload/2026/05/xxx.jpg
 *   /files/xxx.jpg                   → prepend BASE_URL
 *   https://api.cardyn.net/...       → already absolute
 *   http://localhost:8080/...        → replace host with BASE_URL
 */
export function resolveUrl(url: string | null | undefined): string {
  if (!url) return ''

  let resolved = url

  // Replace any host with the correct API base
  if (resolved.startsWith('http://localhost') ||
      resolved.startsWith('http://127.0.0.1') ||
      resolved.startsWith('http://192.168') ||
      resolved.startsWith('http://10.')) {
    resolved = resolved.replace(/^https?:\/\/[^/]+/, BASE_URL || 'https://api.cardyn.net')
  }

  // Rewrite /profile/ → /files/ (public endpoint, no auth required)
  resolved = resolved.replace('/profile/', '/files/')

  // Prepend base URL for relative paths
  if (resolved.startsWith('/')) {
    const base = BASE_URL || 'https://api.cardyn.net'
    resolved = `${base}${resolved}`
  }

  return resolved
}
