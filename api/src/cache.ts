/** Tiny TTL cache with a size cap; enough for a read-only catalog API. */
export class TtlCache<V> {
  private store = new Map<string, { value: V; expires: number }>();

  constructor(
    private readonly ttlMs: number,
    private readonly maxEntries = 500,
  ) {}

  get(key: string): V | undefined {
    const hit = this.store.get(key);
    if (!hit) return undefined;
    if (hit.expires < Date.now()) {
      this.store.delete(key);
      return undefined;
    }
    // refresh recency so the cap evicts the oldest, not the hottest, entry
    this.store.delete(key);
    this.store.set(key, hit);
    return hit.value;
  }

  set(key: string, value: V): void {
    if (this.store.size >= this.maxEntries) {
      const oldest = this.store.keys().next();
      if (!oldest.done) this.store.delete(oldest.value);
    }
    this.store.set(key, { value, expires: Date.now() + this.ttlMs });
  }

  clear(): void {
    this.store.clear();
  }
}

/** Wraps an async producer with the cache and reports whether it was a hit. */
export async function cached<T>(
  cache: TtlCache<T>,
  key: string,
  producer: () => Promise<T>,
): Promise<{ value: T; cached: boolean }> {
  const hit = cache.get(key);
  if (hit !== undefined) return { value: hit, cached: true };
  const value = await producer();
  cache.set(key, value);
  return { value, cached: false };
}
