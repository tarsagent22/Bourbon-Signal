import { DEFAULT_SIGNAL_FILTERS, type SignalFeedFilters, type SignalFeedView, type SignalRarity } from "./feed-filters";

export interface HomeBrowsingPreferences {
  version: 1;
  view: SignalFeedView;
  filtersByView: Record<SignalFeedView, SignalFeedFilters>;
}

const rarityValues = new Set<SignalRarity>(["limited", "allocated", "unicorn"]);
const pendingSaves = new Map<string, Promise<void>>();

export function homeBrowsingStorageKey(userId: string | null | undefined) {
  const owner = typeof userId === "string" ? userId.trim() : "";
  return owner && /^[A-Za-z0-9_-]+$/.test(owner) ? `bourbon-signal.home-browsing.${owner}` : "";
}

function parseFilters(value: unknown): SignalFeedFilters | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<SignalFeedFilters>;
  const state = typeof candidate.state === "string" ? candidate.state.trim().toUpperCase() : "";
  const area = typeof candidate.area === "string" ? candidate.area.replace(/\s+/g, " ").trim().slice(0, 120) : "";
  const bottle = typeof candidate.bottle === "string" ? candidate.bottle.replace(/\s+/g, " ").trim().slice(0, 100) : "";
  const rarities = Array.isArray(candidate.rarities) && candidate.rarities.every((rarity) => rarityValues.has(rarity as SignalRarity))
    ? [...new Set(candidate.rarities as SignalRarity[])]
    : null;
  const freshness = candidate.freshness === null || candidate.freshness === "24h" || candidate.freshness === "7d" || candidate.freshness === "30d"
    ? candidate.freshness
    : null;
  if ((state && !/^[A-Z]{2}$/.test(state)) || rarities === null || (candidate.freshness !== undefined && freshness === null && candidate.freshness !== null)) return null;
  return { ...DEFAULT_SIGNAL_FILTERS, state, area: state ? area : "", bottle, rarities, freshness };
}

export function parseHomeBrowsingPreferences(raw: string | null): HomeBrowsingPreferences | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<HomeBrowsingPreferences>;
    const market = parseFilters(value.filtersByView?.market);
    const community = parseFilters(value.filtersByView?.community);
    if (value.version !== 1 || (value.view !== "market" && value.view !== "community") || !market || !community) return null;
    return { version: 1, view: value.view, filtersByView: { market, community } };
  } catch {
    return null;
  }
}

export function serializeHomeBrowsingPreferences(value: HomeBrowsingPreferences) {
  return JSON.stringify(value);
}

export async function loadHomeBrowsingPreferences(storageKey: string) {
  if (!storageKey) return null;
  const SecureStore = await import("expo-secure-store");
  return parseHomeBrowsingPreferences(await SecureStore.getItemAsync(storageKey).catch(() => null));
}

export async function saveHomeBrowsingPreferences(storageKey: string, value: HomeBrowsingPreferences) {
  if (!storageKey) return;
  const previous = pendingSaves.get(storageKey) || Promise.resolve();
  const next = previous.catch(() => undefined).then(async () => {
    const SecureStore = await import("expo-secure-store");
    await SecureStore.setItemAsync(storageKey, serializeHomeBrowsingPreferences(value));
  });
  pendingSaves.set(storageKey, next);
  try { await next; }
  finally { if (pendingSaves.get(storageKey) === next) pendingSaves.delete(storageKey); }
}
