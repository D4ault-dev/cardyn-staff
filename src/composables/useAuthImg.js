/**
 * useAuthImg — resolves backend image URLs.
 *
 * In dev (Vite proxy, port 1420):
 *   Converts https://api.cardyn.net/profile/... → /profile/...
 *   The browser requests /profile/... from localhost:1420, Vite proxy forwards
 *   it to api.cardyn.net with Origin: admin.cardyn.net — no CORS issue.
 *   /profile/** is permitAll on the backend so no auth token needed.
 *
 * In production (Tauri):
 *   Returns the full https://api.cardyn.net/... URL.
 *   Backend has permitAll for /profile/** so no auth needed.
 */

const IS_DEV = import.meta.env.DEV

export function useAuthImg() {
  function authImg(url) {
    if (!url) return ''
    if (url.startsWith('blob:') || url.startsWith('data:')) return url

    // Full URL from backend API — strip to relative path in dev
    if (url.startsWith('https://api.cardyn.net')) {
      return IS_DEV ? url.replace('https://api.cardyn.net', '') : url
    }

    // Already a relative path
    if (url.startsWith('/')) return url

    // Bare filename — assume profile upload path
    return `/profile/upload/${url}`
  }

  return { authImg }
}
