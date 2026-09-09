import { parsePhotoRegistry, PHOTO_ORIGIN, type PhotoRegistry } from './registry';
export const PHOTO_REGISTRY_URL = `${PHOTO_ORIGIN}/bottle-photos/registry.v1.json`;
const CACHE_KEY = 'bottle-photo-registry.v1';
export type PhotoMetadataStorage = { getItem(key: string): Promise<string | null>; setItem(key: string, value: string): Promise<void> };
type PhotoFetch = (url: string, options: RequestInit) => Promise<{ ok: boolean; json(): Promise<unknown> }>;

// One lazy attempt per app instance, successful or not. No per-card request or
// image prefetch. A subsequent app launch revalidates even a persisted registry.
export function createPhotoRegistryCache({ storage, fetcher, timeoutMs = 5000 }: {
  storage: PhotoMetadataStorage; fetcher: PhotoFetch; timeoutMs?: number;
}) {
  let attempt: Promise<PhotoRegistry | undefined> | undefined;
  async function loadOnce() {
    let cached: PhotoRegistry | undefined;
    try {
      const stored = await storage.getItem(CACHE_KEY);
      if (stored && stored.length <= 2_000_000) cached = parsePhotoRegistry(JSON.parse(stored));
    } catch { /* Corrupt/unavailable public cache must not break the shelf. */ }
    const abort = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const timeout = new Promise<undefined>(resolve => {
        timer = setTimeout(() => { abort.abort(); resolve(undefined); }, timeoutMs);
      });
      const request = (async () => {
        const response = await fetcher(PHOTO_REGISTRY_URL, { credentials: 'omit', redirect: 'error', signal: abort.signal });
        return response.ok ? parsePhotoRegistry(await response.json()) : undefined;
      })();
      const fresh = await Promise.race([request, timeout]);
      if (fresh) {
        try { await storage.setItem(CACHE_KEY, JSON.stringify(fresh)); } catch { /* Network result remains usable. */ }
        return fresh;
      }
    } catch { /* Offline, invalid JSON, redirect, or HTTP failure: retain validated cache. */ }
    finally { clearTimeout(timer); }
    return cached;
  }
  return { load: () => (attempt ??= loadOnce()) };
}
