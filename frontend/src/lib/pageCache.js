// Module-level cache — persists across route changes since JS modules are singletons.
// Stale-while-revalidate: pages show cached data instantly, then refresh in background.
const CACHE = new Map()
const TTL = 3 * 60 * 1000  // 3 minutes

export function getCached(key) {
  const e = CACHE.get(key)
  if (!e) return null
  if (Date.now() - e.ts > TTL) { CACHE.delete(key); return null }
  return e.data
}

export function setCached(key, data) {
  CACHE.set(key, { data, ts: Date.now() })
}
