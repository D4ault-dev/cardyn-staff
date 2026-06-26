/**
 * useAuthImg — resolves backend image URLs for Tauri (Windows + macOS).
 *
 * Dev: strips origin → relative path → Vite proxy handles it
 * Production: returns full https://api.cardyn.net URL
 *
 * Cache busting: adds ?v=<timestamp> in production to bypass
 * Edge WebView2's stale HTTP cache (which served old 403 responses).
 * The bust token changes daily so images re-validate once per day.
 */

const IS_DEV = import.meta.env.DEV

// Daily cache buster — changes once per day so WebView2 re-fetches stale cached responses
const CACHE_BUST = Math.floor(Date.now() / (1000 * 60 * 60 * 24))

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

    // Production — return full URL with daily cache buster
    // This forces Edge WebView2 to re-fetch instead of serving old 403 from disk cache
    let fullUrl
    if (url.startsWith('https://api.cardyn.net')) {
      fullUrl = url
    } else if (url.startsWith('/')) {
      fullUrl = `https://api.cardyn.net${url}`
    } else {
      fullUrl = `https://api.cardyn.net/profile/upload/${url}`
    }

    // Add cache buster — avoids stale 403 cached by Edge WebView2
    const sep = fullUrl.includes('?') ? '&' : '?'
    return `${fullUrl}${sep}v=${CACHE_BUST}`
  }

  return { authImg }
}
