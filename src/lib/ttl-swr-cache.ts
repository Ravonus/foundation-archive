/// Module-level TTL + stale-while-revalidate cache for server data
/// fetchers. Trades perfect freshness for drastically faster page
/// loads on read-heavy routes (landing page, archive index) where the
/// data changes slowly relative to how often it's requested.
///
/// Behavior per key:
///   - fresh (< ttlMs since last fetch): return cached synchronously.
///   - stale (ttlMs .. ttlMs + staleTtlMs): return cached, kick off a
///     background refresh. Subsequent fresh hits eventually replace.
///   - too stale / cold: await a fresh fetch.
///
/// Cache lives in memory, per process. Multi-worker deployments cache
/// independently — that's fine for landing pages; don't use this for
/// anything requiring strict consistency.

type CacheEntry<T> = {
  data: T;
  expiresAt: number;
  refreshing: boolean;
};

export type TtlSwrCacheOptions<TArgs extends unknown[]> = {
  /// How long a cached value is served without kicking a refresh.
  ttlMs: number;
  /// Window past `ttlMs` where we'll still return the stale value while
  /// a background fetch runs. Total time cache can be trusted =
  /// `ttlMs + staleTtlMs`.
  staleTtlMs: number;
  /// Optional: derive a cache key from the args. Defaults to one-per-
  /// fetcher (single shared slot).
  keyFn?: (...args: TArgs) => string;
};

export function createTtlSwrCache<TArgs extends unknown[], T>(
  fetcher: (...args: TArgs) => Promise<T>,
  options: TtlSwrCacheOptions<TArgs>,
): (...args: TArgs) => Promise<T> {
  const cache = new Map<string, CacheEntry<T>>();
  const inflight = new Map<string, Promise<T>>();
  const keyFn = options.keyFn ?? (() => "default");

  const doFetch = async (key: string, args: TArgs): Promise<T> => {
    const existing = inflight.get(key);
    if (existing) return existing;
    const promise = (async () => {
      try {
        const data = await fetcher(...args);
        cache.set(key, {
          data,
          expiresAt: Date.now() + options.ttlMs,
          refreshing: false,
        });
        return data;
      } finally {
        inflight.delete(key);
      }
    })();
    inflight.set(key, promise);
    return promise;
  };

  return async (...args: TArgs): Promise<T> => {
    const key = keyFn(...args);
    const now = Date.now();
    const cached = cache.get(key);

    if (cached && now < cached.expiresAt) {
      return cached.data;
    }

    if (cached && now < cached.expiresAt + options.staleTtlMs) {
      if (!cached.refreshing) {
        cached.refreshing = true;
        void doFetch(key, args).catch(() => {
          cached.refreshing = false;
        });
      }
      return cached.data;
    }

    return doFetch(key, args);
  };
}
