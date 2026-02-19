/**
 * In-memory cache for Twitter engagement data (comments/quotes).
 * Cache expires after 1 hour (3600 seconds).
 * 
 * Structure: Map<`${tweetId}:${action}`, { handles: Set<string>, lastRefreshedAt: number, nextRefreshAt: number }>
 *
 * Handles are normalized so Twitter's case-insensitive handles match (e.g. BeraWallah === berawallah).
 */

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

/** Normalize handle for storage and lookup: strip @, trim, Unicode NFKC, lowercase. */
function normalizeHandleForLookup(handle: string): string {
  const s = handle.replace(/^@/, "").trim();
  return (s.normalize("NFKC") || s).toLowerCase();
}

type CacheEntry = {
  handles: Set<string>; // Normalized lowercase handles
  lastRefreshedAt: number; // Unix timestamp (ms)
  nextRefreshAt: number; // Unix timestamp (ms)
};

const cache = new Map<string, CacheEntry>();

/**
 * Get cache key for a tweet+action combination
 */
function getCacheKey(tweetId: string, action: "comment" | "quote"): string {
  return `${tweetId}:${action}`;
}

/**
 * Check if cache entry exists and is still valid
 */
export function isCacheValid(tweetId: string, action: "comment" | "quote"): boolean {
  const key = getCacheKey(tweetId, action);
  const entry = cache.get(key);
  if (!entry) return false;
  const now = Date.now();
  return now < entry.nextRefreshAt;
}

/**
 * Get cached handles for a tweet+action
 */
export function getCachedHandles(tweetId: string, action: "comment" | "quote"): Set<string> | null {
  const key = getCacheKey(tweetId, action);
  const entry = cache.get(key);
  if (!entry || !isCacheValid(tweetId, action)) return null;
  return entry.handles;
}

/**
 * Set cached handles for a tweet+action
 */
export function setCachedHandles(
  tweetId: string,
  action: "comment" | "quote",
  handles: string[]
): void {
  const key = getCacheKey(tweetId, action);
  const now = Date.now();
  cache.set(key, {
    handles: new Set(handles.map((h) => normalizeHandleForLookup(h))),
    lastRefreshedAt: now,
    nextRefreshAt: now + CACHE_TTL_MS,
  });
}

/**
 * Check if a handle exists in cache for tweet+action
 */
export function checkHandleInCache(
  tweetId: string,
  action: "comment" | "quote",
  handle: string
): boolean {
  const handles = getCachedHandles(tweetId, action);
  if (!handles) return false;
  const normalized = normalizeHandleForLookup(handle);
  return handles.has(normalized);
}

/**
 * Get cache status (lastRefreshedAt, nextRefreshAt) for a tweet+action
 */
export function getCacheStatus(
  tweetId: string,
  action: "comment" | "quote"
): { lastRefreshedAt: number | null; nextRefreshAt: number | null; isValid: boolean } {
  const key = getCacheKey(tweetId, action);
  const entry = cache.get(key);
  if (!entry) {
    return { lastRefreshedAt: null, nextRefreshAt: null, isValid: false };
  }
  const isValid = isCacheValid(tweetId, action);
  return {
    lastRefreshedAt: entry.lastRefreshedAt,
    nextRefreshAt: entry.nextRefreshAt,
    isValid,
  };
}

/**
 * Get cache status for all configured tweets
 */
export function getAllCacheStatus(tweetIds: string[]): Record<
  string,
  {
    comment: { lastRefreshedAt: number | null; nextRefreshAt: number | null; isValid: boolean };
    quote: { lastRefreshedAt: number | null; nextRefreshAt: number | null; isValid: boolean };
  }
> {
  const result: Record<
    string,
    {
      comment: { lastRefreshedAt: number | null; nextRefreshAt: number | null; isValid: boolean };
      quote: { lastRefreshedAt: number | null; nextRefreshAt: number | null; isValid: boolean };
    }
  > = {};

  for (const tweetId of tweetIds) {
    result[tweetId] = {
      comment: getCacheStatus(tweetId, "comment"),
      quote: getCacheStatus(tweetId, "quote"),
    };
  }

  return result;
}

/**
 * Clear expired cache entries (cleanup utility)
 */
export function clearExpiredCache(): void {
  const now = Date.now();
  for (const [key, entry] of cache.entries()) {
    if (now >= entry.nextRefreshAt) {
      cache.delete(key);
    }
  }
}
