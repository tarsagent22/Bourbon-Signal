import type { SignalFeedFilters, SignalFeedView } from './feed-filters';
import type { SignalFeedPage } from '../api/types';
import { validApiResponse } from '../api/response-validation';
export interface FeedCacheStorage { read(owner: string): Promise<string | null>; write(owner: string, raw: string | null): Promise<void> }
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
type Entry = { scope: string; savedAt: number; page: SignalFeedPage };
export function feedCacheScope(view: SignalFeedView, filters: SignalFeedFilters) {
  return JSON.stringify([view, filters.state, filters.area, filters.freshness, filters.bottle, [...filters.rarities].sort()]);
}
export function createHomeFeedCache(storage: FeedCacheStorage, now = Date.now) {
  const memory = new Map<string, Entry[]>();
  const writes = new Map<string, Promise<void>>();
  const generations = new Map<string, number>();
  const validOwner = (owner: string) => /^[A-Za-z0-9_-]+$/.test(owner);
  const valid = (entry: Entry) => entry && typeof entry.scope === 'string' && Number.isFinite(entry.savedAt)
    && entry.savedAt <= now() && now() - entry.savedAt < MAX_AGE_MS
    && validApiResponse('/api/v1/signals', entry.page) && entry.page.signals.length <= 30;
  const peek = (owner: string, scope: string) => memory.get(owner)?.find(entry => entry.scope === scope && valid(entry))?.page || null;
  function persist(owner: string, raw: string | null) {
    const next = (writes.get(owner) || Promise.resolve()).catch(() => undefined).then(() => storage.write(owner, raw));
    writes.set(owner, next);
    void next.finally(() => { if (writes.get(owner) === next) writes.delete(owner); }).catch(() => undefined);
    return next;
  }
  return {
    peek,
    async load(owner: string, scope: string) {
      if (!validOwner(owner)) return null;
      if (memory.has(owner)) return peek(owner, scope);
      const generation = generations.get(owner) || 0;
      await writes.get(owner)?.catch(() => undefined);
      try {
        const raw = await storage.read(owner);
        if (!raw || raw.length > 750_000 || generation !== (generations.get(owner) || 0)) return null;
        const parsed = JSON.parse(raw);
        if (parsed.version !== 1 || !Array.isArray(parsed.entries) || parsed.entries.length > 8) return null;
        if (!memory.has(owner)) memory.set(owner, parsed.entries.filter(valid));
        return peek(owner, scope);
      } catch { return null; }
    },
    save(owner: string, scope: string, page: SignalFeedPage) {
      if (!validOwner(owner) || !validApiResponse('/api/v1/signals', page) || page.degraded) return Promise.resolve();
      if (page.access.marketDetailsLocked) {
        generations.set(owner, (generations.get(owner) || 0) + 1);
        memory.delete(owner);
        return persist(owner, null);
      }
      const entry = { scope, savedAt: now(), page: { ...page, signals: page.signals.slice(0, 30) } };
      const previous = (memory.get(owner) || []).filter(item => item.scope !== scope && valid(item));
      const entries = (page.signals.length ? [entry, ...previous] : previous).slice(0, 8);
      memory.set(owner, entries);
      return persist(owner, JSON.stringify({ version: 1, entries }));
    },
    clear(owner: string) {
      if (!validOwner(owner)) return Promise.resolve();
      generations.set(owner, (generations.get(owner) || 0) + 1);
      memory.delete(owner);
      return persist(owner, null);
    },
  };
}
const fileStorage: FeedCacheStorage = {
  async read(owner) {
    const fs = await import('expo-file-system/legacy');
    if (!fs.cacheDirectory) return null;
    return fs.readAsStringAsync(`${fs.cacheDirectory}home-feed-${owner}.json`).catch(() => null);
  },
  async write(owner, raw) {
    const fs = await import('expo-file-system/legacy');
    if (!fs.cacheDirectory) return;
    const path = `${fs.cacheDirectory}home-feed-${owner}.json`;
    if (raw === null) await fs.deleteAsync(path, { idempotent: true });
    else await fs.writeAsStringAsync(path, raw);
  },
};
export const homeFeedCache = createHomeFeedCache(fileStorage);
