/**
 * useAuthImg — resolves backend image URLs for Tauri (Windows + macOS).
 *
 * Dev: strips origin → relative path → Vite proxy handles CORS + auth
 * Production: returns full https://api.cardyn.net URL.
 *   Server returns Access-Control-Allow-Origin: * so images load directly.
 *   Images are cached immutably by nginx (max-age=30d, immutable).
 */

const IS_DEV = import.meta.env.DEV

export function useAuthImg() {
  function authImg(url) {
    if (!url) return ''
    if (url.startsWith('blob:') || url.startsWith('data:')) return url

    if (IS_DEV) {
      // Dev — strip origin, let Vite proxy handle it
      if (url.startsWith('https://api.cardyn.net')) {
        return url.replace('https://api.cardyn.net', '')
      }
      if (url.startsWith('/')) return url
      return `/profile/upload/${url}`
    }

    // Production — return full URL, nginx serves with CORS headers + 30d immutable cache
    if (url.startsWith('https://api.cardyn.net')) return url
    if (url.startsWith('http')) return url
    if (url.startsWith('/')) return `https://api.cardyn.net${url}`
    // Has path separator — relative path
    if (url.includes('/')) return `https://api.cardyn.net/${url}`
    // Bare filename — assume profile upload
    return `https://api.cardyn.net/profile/upload/${url}`
  }

  return { authImg }
}
