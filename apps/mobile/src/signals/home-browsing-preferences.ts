import { DEFAULT_SIGNAL_FILTERS, type SignalFeedFilters, type SignalFeedView, type SignalRarity } from "./feed-filters";

export interface HomeBrowsingPreferences {
  version: 1;
  timelineBrowse?: boolean;
  view: SignalFeedView;
  filtersByView: Record<SignalFeedView, SignalFeedFilters>;
  startupProfile?: { sessionId: string; tier: "free" | "standard" | "barrel" | "bottled-in-bond"; homeState?: string };
  nationalByView?: Record<SignalFeedView, boolean>;
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
    const national = value.nationalByView;
    const nationalByView = typeof national?.market === "boolean" && typeof national?.community === "boolean" ? national : undefined;
    const candidate = value.startupProfile;
    const startupProfile = candidate && typeof candidate.sessionId === "string" && ["free", "standard", "barrel", "bottled-in-bond"].includes(candidate.tier)
      && (candidate.homeState === undefined || /^[A-Z]{2}$/.test(candidate.homeState)) ? candidate : undefined;
    return { version: 1, ...(value.timelineBrowse ? { timelineBrowse: true } : {}), view: value.view, filtersByView: { market, community }, ...(nationalByView ? { nationalByView } : {}), ...(startupProfile ? { startupProfile } : {}) };
  } catch {
    return null;
  }
}

export function serializeHomeBrowsingPreferences(value: HomeBrowsingPreferences) {
  return JSON.stringify(value);
}

// A returning member can restore the feed from local preferences while the
// profile refresh continues. First-time members still wait for their home state.
export async function resolveHomeStartup(savedRead: Promise<HomeBrowsingPreferences | null>, homeStateRead: Promise<string | undefined>) {
  const homeState = homeStateRead.catch(() => undefined);
  const saved = await savedRead.catch(() => null);
  return { saved, homeState: saved ? undefined : await homeState };
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
