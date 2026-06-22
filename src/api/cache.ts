/**
 * Simple SWR (stale-while-revalidate) in-memory cache utility.
 *
 * Usage:
 *   const result = await swrFetch('orders:page1', () => fetchOrders(1), { onFresh: setRows })
 *
 * - Returns cached data instantly if < TTL (30s by default)
 * - Fires a background refresh and calls onFresh(freshData) when done
 * - Call invalidate(key) or invalidatePrefix(prefix) after mutations
 */

const CACHE_TTL_MS = 60_000  // 60 seconds — background refresh every 15s handles freshness

interface CacheEntry<T> {
  data: T
  ts: number
}

const store = new Map<string, CacheEntry<unknown>>()

/** Return cached value if still fresh, otherwise null */
export function getCacheEntry<T>(key: string): T | null {
  const entry = store.get(key) as CacheEntry<T> | undefined
  if (!entry) return null
  if (Date.now() - entry.ts > CACHE_TTL_MS) return null
  return entry.data
}

/** Write a value into the cache */
export function setCacheEntry<T>(key: string, data: T): void {
  store.set(key, { data, ts: Date.now() })
  // Prune entries older than 2× TTL to avoid unbounded growth
  if (store.size > 200) {
    const cutoff = Date.now() - CACHE_TTL_MS * 2
    for (const [k, v] of store.entries()) {
      if (v.ts < cutoff) store.delete(k)
    }
  }
}

/** Remove a single cache entry (call after mutations) */
export function invalidate(key: string): void {
  store.delete(key)
}

/** Remove all entries whose key starts with prefix */
export function invalidatePrefix(prefix: string): void {
  for (const k of store.keys()) {
    if (k.startsWith(prefix)) store.delete(k)
  }
}

/** Remove all cache entries */
export function invalidateAll(): void {
  store.clear()
}

export interface SwrOptions<T> {
  /** Called with fresh data after background revalidation completes */
  onFresh?: (data: T) => void
  /** Override the default TTL for this specific key (ms) */
  ttl?: number
}

/**
 * SWR fetch:
 * 1. If cached data exists and is fresh → return it immediately, then revalidate in background
 * 2. If no cached data → await the fetcher, cache result, return it
 */
export async function swrFetch<T>(
  key: string,
  fetcher: () => Promise<T>,
  options: SwrOptions<T> = {},
): Promise<T> {
  const { onFresh } = options
  const ttl = options.ttl ?? CACHE_TTL_MS

  const entry = store.get(key) as CacheEntry<T> | undefined
  const isFresh = entry && Date.now() - entry.ts < ttl

  if (isFresh) {
    // Return stale data immediately, revalidate in background
    if (onFresh) {
      fetcher()
        .then(fresh => {
          setCacheEntry(key, fresh)
          onFresh(fresh)
        })
        .catch(() => { /* background refresh failure is silent */ })
    }
    return entry!.data
  }

  // No fresh cache — fetch, cache, and return
  const data = await fetcher()
  setCacheEntry(key, data)
  return data
}
