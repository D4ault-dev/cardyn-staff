/**
 * useAuthImg — resolves backend image URLs for Tauri (Windows + macOS).
 *
 * Dev: strips origin → relative path → Vite proxy handles CORS + auth
 * Production: fetches image via axios (which sets Authorization header)
 *   and returns a blob: URL — avoids CORS issues in Tauri WebView2 on Windows.
 *
 * Blob URLs are cached to avoid re-fetching the same image.
 */

import { ref } from 'vue'
import axios from 'axios'
import Cookies from 'js-cookie'

const IS_DEV = import.meta.env.DEV

// Cache: original URL → blob URL
const _blobCache = new Map()
// Track in-flight fetches to avoid duplicates
const _inflight = new Map()

function getToken() {
  return Cookies.get('staff_token') || ''
}

async function fetchBlob(url) {
  if (_blobCache.has(url)) return _blobCache.get(url)
  if (_inflight.has(url)) return _inflight.get(url)

  const promise = (async () => {
    try {
      const token = getToken()
      const res = await axios.get(url, {
        responseType: 'blob',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        timeout: 15000,
      })
      const blobUrl = URL.createObjectURL(res.data)
      _blobCache.set(url, blobUrl)
      return blobUrl
    } catch {
      return url // fallback to original URL if fetch fails
    } finally {
      _inflight.delete(url)
    }
  })()

  _inflight.set(url, promise)
  return promise
}

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

    // Production — return full URL (used as src initially)
    // For el-image, the URL will work because img-src allows https:
    // But for preview (lightbox) on Windows, we use the blob approach below
    if (url.startsWith('https://api.cardyn.net')) return url
    if (url.startsWith('/')) return `https://api.cardyn.net${url}`
    return url
  }

  // Reactive blob URL — use this for images that need to open in lightbox/preview
  // Usage: const { blobUrl, loadBlob } = useAuthImgBlob(url)
  function useReactiveBlob(rawUrl) {
    const blobUrl = ref(authImg(rawUrl))
    if (!IS_DEV && rawUrl && rawUrl.startsWith('https://')) {
      fetchBlob(rawUrl).then(b => { blobUrl.value = b })
    }
    return blobUrl
  }

  return { authImg, useReactiveBlob }
}

// Simple helper for non-reactive use — returns a promise
export async function resolveImgBlob(url) {
  if (!url) return ''
  if (url.startsWith('blob:') || url.startsWith('data:')) return url
  if (IS_DEV) {
    if (url.startsWith('https://api.cardyn.net')) return url.replace('https://api.cardyn.net', '')
    return url
  }
  return fetchBlob(url)
}
