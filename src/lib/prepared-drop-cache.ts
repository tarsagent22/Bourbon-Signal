export function createPreparedDropCache<T>(maximumEntries = 4, ttlMs = 15_000) {
  const entries = new Map<string, { value: T; expiresAt: number }>();
  return {
    get(key: string, prepare: () => T, now = Date.now()): T {
      const hit = entries.get(key);
      if (hit && hit.expiresAt > now) return hit.value;
      const value = prepare();
      entries.delete(key);
      entries.set(key, { value, expiresAt: now + ttlMs });
      for (const [entryKey, entry] of entries) if (entry.expiresAt <= now) entries.delete(entryKey);
      while (entries.size > maximumEntries) entries.delete(entries.keys().next().value!);
      return value;
    },
  };
}

// One public preparation per immutable snapshot, with concurrent requests sharing
// the attempt. Expiry starts after preparation; errors never become cached success.
export function createAsyncPreparedDropCache<T>(ttlMs = 15_000, now = Date.now) {
  const entries = new Map<string, { promise: Promise<T>; expiresAt: number; pending: boolean }>();
  return {
    async get(key: string, prepare: () => Promise<T>) {
      const cached = entries.get(key);
      if (cached && (cached.pending || cached.expiresAt > now())) return { value: await cached.promise, hit: true };
      const entry = { promise: Promise.resolve().then(prepare), expiresAt: 0, pending: true };
      entries.delete(key); entries.set(key, entry);
      while (entries.size > 2) entries.delete(entries.keys().next().value!);
      try {
        const value = await entry.promise;
        entry.pending = false; entry.expiresAt = now() + ttlMs;
        return { value, hit: false };
      } catch (error) { if (entries.get(key) === entry) entries.delete(key); throw error; }
    },
  };
}
