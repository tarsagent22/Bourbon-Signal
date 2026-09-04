// Shared wire contract. Metadata remains the reader authority; every writer uses the member lease.
export interface WatchlistState { bottleNames: string[]; bottleKeys: string[]; version?: number }
export interface WatchlistMutation { bottleName: string; bottleKey?: string; watched: boolean }
export class WatchlistError extends Error {
  constructor(public code: string, public status: number, message: string) { super(message); }
}
export const watchlistKey = (value: string) => value.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
export function normalizeWatchlist(value: unknown): WatchlistState {
  const source = object(value);
  const strings = (v: unknown) => Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string') : [];
  // Never silently truncate a legacy list during a read or unrelated save.
  return { bottleNames: strings(source.bottleNames), bottleKeys: strings(source.bottleKeys), version: Number.isSafeInteger(source.version) && Number(source.version) >= 0 ? Number(source.version) : 0 };
}
function identities(value: WatchlistState) { return new Set([...value.bottleNames,...value.bottleKeys].map(watchlistKey).filter(Boolean)); }
export function applyWatchlistWrite(current: WatchlistState, replacement: unknown, mutation: unknown, limit: number | null): WatchlistState {
  if (replacement !== undefined && mutation !== undefined) throw new WatchlistError('watchlist_ambiguous_write',400,'Send a bottle change or a versioned replacement, not both.');
  let next: WatchlistState;
  if (mutation !== undefined) {
    const m = object(mutation);
    if (typeof m.bottleName !== 'string' || !m.bottleName.trim() || m.bottleName.length > 200 || typeof m.watched !== 'boolean' || (m.bottleKey !== undefined && (typeof m.bottleKey !== 'string' || m.bottleKey.length > 200 || !watchlistKey(m.bottleKey)))) throw new WatchlistError('watchlist_invalid_mutation',400,'A bottle name and explicit watched state are required.');
    const name = m.bottleName.trim(), key = watchlistKey(typeof m.bottleKey === 'string' ? m.bottleKey : name);
    if (!key) throw new WatchlistError('watchlist_invalid_mutation',400,'A valid bottle identity is required.');
    const target = new Set([watchlistKey(name),key]);
    if (m.watched) {
      const names = current.bottleNames.some(n=>target.has(watchlistKey(n))) ? current.bottleNames : [...current.bottleNames,name];
      const keys = current.bottleKeys.some(n=>target.has(watchlistKey(n))) ? current.bottleKeys : [...current.bottleKeys,key];
      next = {...current,bottleNames:names,bottleKeys:keys};
    } else next = {...current,bottleNames:current.bottleNames.filter(n=>!target.has(watchlistKey(n))),bottleKeys:current.bottleKeys.filter(n=>!target.has(watchlistKey(n)))};
  } else {
    const r = object(replacement);
    if (!Number.isSafeInteger(r.version) || Number(r.version) < 0) throw new WatchlistError('watchlist_version_required',409,'Refresh before replacing this watchlist.');
    if (r.version !== current.version) throw new WatchlistError('watchlist_version_conflict',409,'Your watchlist changed elsewhere. Refresh and review before saving.');
    if (![r.bottleNames,r.bottleKeys].every(a=>Array.isArray(a) && a.every(s=>typeof s==='string' && s.trim() && s.length<=200))) throw new WatchlistError('watchlist_invalid_replacement',400,'A complete watchlist is required.');
    next = normalizeWatchlist(r);
  }
  const before = identities(current), after = identities(next);
  const adds = [...after].some(k=>!before.has(k));
  if (adds && (after.size > 100 || (limit !== null && after.size > limit))) throw new WatchlistError('tracked_bottle_limit_reached',403,'This tracked-bottle selection exceeds your membership limit. Remove a bottle before adding another.');
  const changed = JSON.stringify([current.bottleNames,current.bottleKeys]) !== JSON.stringify([next.bottleNames,next.bottleKeys]);
  if (changed && current.version === Number.MAX_SAFE_INTEGER) throw new WatchlistError('watchlist_version_exhausted',503,'Watchlist storage is temporarily unavailable.');
  return {...next,version:(current.version || 0)+(changed?1:0)};
}
