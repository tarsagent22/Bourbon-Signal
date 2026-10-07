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
