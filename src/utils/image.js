/**
 * Resolve image URLs for display.
 *
 * Cases handled:
 * 1. Full URL: https://api.cardyn.net/profile/upload/xxx.jpg
 *    → In dev: strip domain, let Vite proxy it
 *    → In prod: use as-is
 *
 * 2. Relative path: /profile/upload/xxx.jpg
 *    → In dev: use as-is (Vite proxy handles it)
 *    → In prod: prepend https://api.cardyn.net
 *
 * 3. Bare filename: IMG_123.jpg
 *    → Always prepend https://api.cardyn.net/profile/upload/
 */

const IS_DEV   = import.meta.env.DEV
const API_HOST = 'https://api.cardyn.net'

export function resolveImg(url) {
  if (!url) return ''

  // Case 1: full URL
  if (url.startsWith('http')) {
    if (IS_DEV) {
      // Strip domain so Vite proxy handles CORS
      return url.replace(/^https?:\/\/[^/]+/, '')
    }
    return url
  }

  // Case 2: relative path starting with /
  if (url.startsWith('/')) {
    if (IS_DEV) return url  // Vite proxy handles /profile/, /files/ etc.
    return API_HOST + url
  }

  // Case 3: bare filename — no path prefix at all
  // e.g. "IMG_20260623_153812.jpg" → "/profile/upload/IMG_20260623_153812.jpg"
  const path = `/profile/upload/${url}`
  if (IS_DEV) return path
  return API_HOST + path
}
