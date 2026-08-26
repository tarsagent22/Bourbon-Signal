import type {
  MemberAlertsResponse,
  MemberPreferences,
  MemberPreferencesPatch,
  MemberProfile,
  MemberProfilePatch,
  GeographySearchResponse,
  PushDeviceStatus,
  RadarBottleOption,
  BottleContributionResponse,
  ReferralSummary,
  SightingSubmission,
  SightingSubmissionResponse,
  Signal,
  SignalFeedPage,
  SignalPointsSummary,
} from "./types";
import type { SignalFreshness, SignalRarity } from "../signals/feed-filters";

export class MobileApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly retryable = false,
    readonly resetCursor = false,
    readonly requestId = "",
  ) {
    super(message);
    this.name = "MobileApiError";
  }
}

type RequestOptions = {
  method?: "GET" | "POST" | "PATCH";
  body?: unknown;
  headers?: Record<string, string>;
  fresh?: boolean;
};

function normalizeBottleOptions(rows: Array<Record<string, unknown>>, sortByName = false) {
  const unique = new Map<string, RadarBottleOption>();
  for (const raw of rows) {
    const name = [raw.canonicalName, raw.name, raw.bottle].find((value): value is string => typeof value === "string")?.trim() || "";
    if (!name) continue;
    const key = name.toLowerCase();
    const rawRarity = [raw.rarityTier, raw.tier, raw.nationalTier, raw.availability].find((value): value is string => typeof value === "string");
    const rarity = rawRarity === "unicorn" ? "unicorn" : rawRarity === "allocated" || rawRarity === "highly_allocated" ? "allocated" : rawRarity === "limited" || rawRarity === "seasonal" || rawRarity === "regional" ? "limited" : undefined;
    if (!unique.has(key)) unique.set(key, {
      id: typeof raw.id === "string" ? raw.id : key,
      name,
      rarity,
      aliases: Array.isArray(raw.aliases) ? raw.aliases.filter((value): value is string => typeof value === "string") : undefined,
      brand: typeof raw.brand === "string" ? raw.brand : undefined,
      producer: typeof raw.producer === "string" ? raw.producer : typeof raw.distillery === "string" ? raw.distillery : undefined,
      proof: typeof raw.proof === "number" && Number.isFinite(raw.proof) ? raw.proof : undefined,
      ageStatement: typeof raw.ageStatement === "string" || raw.ageStatement === null ? raw.ageStatement : undefined,
    });
  }
  const bottles = [...unique.values()];
  return sortByName ? bottles.sort((left, right) => left.name.localeCompare(right.name)) : bottles;
}

const BOTTLE_CATALOG_SUCCESS_TTL_MS = 5 * 60 * 1000;
const MAX_BOTTLE_CATALOG_CACHE_ENTRIES = 8;
const bottleCatalogCache = new Map<string, { expiresAt: number; promise: Promise<RadarBottleOption[]> }>();

function cacheBottleCatalog(key: string, entry: { expiresAt: number; promise: Promise<RadarBottleOption[]> }) {
  bottleCatalogCache.delete(key);
  bottleCatalogCache.set(key, entry);
  while (bottleCatalogCache.size > MAX_BOTTLE_CATALOG_CACHE_ENTRIES) {
    const oldestKey = bottleCatalogCache.keys().next().value;
    if (oldestKey === undefined) break;
    bottleCatalogCache.delete(oldestKey);
  }
}

export function createMobileApi({
  baseUrl = process.env.EXPO_PUBLIC_API_URL || "https://www.bourbonsignal.com",
  getToken,
  fetcher = fetch,
  readCooldownMs = 10_000,
}: {
  baseUrl?: string;
  getToken: () => Promise<string | null>;
  fetcher?: typeof fetch;
  readCooldownMs?: number;
}) {
  const recentReads = new Map<string, { expiresAt: number; promise: Promise<unknown> }>();

  async function performRequest<T>(path: string, options: RequestOptions = {}, suppliedToken?: string | null): Promise<T> {
    const token = suppliedToken === undefined ? await getToken() : suppliedToken;
    const headers = new Headers({ Accept: "application/json", ...options.headers });
    if (token) headers.set("Authorization", `Bearer ${token}`);
    if (options.body !== undefined) headers.set("Content-Type", "application/json");
    const response = await fetcher(new Request(new URL(path, baseUrl), {
      method: options.method || "GET",
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    }));
    const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
    if (!response.ok) {
      const structured = payload.error && typeof payload.error === "object" ? payload.error as Record<string, unknown> : null;
      const scalarMessage = typeof payload.error === "string" ? payload.error : null;
      throw new MobileApiError(
        scalarMessage || (typeof structured?.message === "string" ? structured.message : "Bourbon Signal is temporarily unavailable."),
        response.status,
        typeof structured?.code === "string" ? structured.code : typeof payload.code === "string" ? payload.code : "UNKNOWN_ERROR",
        structured?.retryable === true,
        payload.resetCursor === true,
        typeof structured?.requestId === "string" ? structured.requestId : "",
      );
    }
    return payload as T;
  }

  async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const token = await getToken();
    if (options.method && options.method !== "GET") {
      const payload = await performRequest<T>(path, options, token);
      for (const key of recentReads.keys()) {
        if (key.endsWith(` ${path}`)) recentReads.delete(key);
      }
      return payload;
    }
    const key = `GET ${token || "anonymous"} ${path}`;
    const now = Date.now();
    const recent = recentReads.get(key);
    if (!options.fresh && recent && recent.expiresAt > now) return recent.promise as Promise<T>;
    const promise = performRequest<T>(path, options, token);
    recentReads.set(key, { expiresAt: now + readCooldownMs, promise });
    return promise;
  }

  return {
    listSignals({ view, limit = 30, cursor, fresh = false, rarities = [], state, area, freshness, bottle }: { view?: "all" | "market" | "community"; limit?: number; cursor?: string | null; fresh?: boolean; rarities?: SignalRarity[]; state?: string; area?: string; freshness?: SignalFreshness; bottle?: string } = {}) {
      const params = new URLSearchParams({ limit: String(limit) });
      if (view && view !== "all") params.set("view", view);
      if (cursor) params.set("cursor", cursor);
      const normalizedRarities = [...new Set(rarities)].sort();
      if (normalizedRarities.length) params.set("tiers", normalizedRarities.join(","));
      const normalizedState = state?.trim().toUpperCase();
      if (normalizedState) params.set("state", normalizedState);
      const normalizedArea = area?.replace(/\s+/g, " ").trim();
      if (normalizedState && normalizedArea) params.set("area", normalizedArea);
      if (freshness) params.set("freshness", freshness);
      const normalizedBottle = bottle?.replace(/\s+/g, " ").trim();
      if (normalizedBottle) params.set("bottle", normalizedBottle);
      return request<SignalFeedPage>(`/api/v1/signals?${params.toString()}`, { fresh });
    },
    getSignal(id: string) {
      return request<{ contractVersion: "bourbon-signal/mobile-api@1"; signal: Signal }>(`/api/v1/signals/${encodeURIComponent(id)}`);
    },
    getMemberProfile({ fresh = false }: { fresh?: boolean } = {}) {
      return request<MemberProfile>("/api/v1/me/profile", { fresh });
    },
    updateMemberProfile(patch: MemberProfilePatch) {
      return request<MemberProfile>("/api/v1/me/profile", { method: "PATCH", body: patch });
    },
    async getSignalAreaOptions(state: string) {
      const stateCode = state.trim().toUpperCase();
      if (!/^[A-Z]{2}$/.test(stateCode)) return [];
      const payload = await request<{ stores?: Array<{ city?: unknown; state?: unknown }> }>(`/api/stores?state=${encodeURIComponent(stateCode)}`, { fresh: true });
      const cities = (payload.stores || []).flatMap((store) => {
        const city = typeof store.city === "string" ? store.city.replace(/\s+/g, " ").trim() : "";
        return city ? [city] : [];
      });
      const unique = new Map<string, { value: string; label: string }>();
      for (const city of cities) {
        const key = city.toLowerCase();
        if (!unique.has(key)) unique.set(key, { value: city, label: city });
      }
      return [...unique.values()].sort((left, right) => left.label.localeCompare(right.label));
    },
    getMemberPreferences({ fresh = false }: { fresh?: boolean } = {}) {
      return request<MemberPreferences>("/api/user/preferences", { fresh });
    },
    updateMemberPreferences(patch: MemberPreferencesPatch) {
      return request<MemberPreferences>("/api/user/preferences", { method: "POST", body: patch });
    },
    getMemberAlerts({ fresh = false }: { fresh?: boolean } = {}) {
      return request<MemberAlertsResponse>("/api/alerts", { fresh });
    },
    updateMemberAlert(action: "mark_read" | "mark_all_read" | "archive", alertId?: string) {
      return request<MemberAlertsResponse>("/api/alerts", { method: "PATCH", body: { action, ...(alertId ? { alertId } : {}) } });
    },
    async listRadarBottles({ fresh = false, query = "", limit = 30 }: { fresh?: boolean; query?: string; limit?: number } = {}) {
      const normalizedQuery = query.replace(/\s+/g, " ").trim();
      const params = new URLSearchParams();
      if (normalizedQuery) {
        params.set("query", normalizedQuery);
        params.set("limit", String(Math.max(1, Math.min(30, Math.floor(limit)))));
      }
      const path = `/api/bottles${params.size ? `?${params.toString()}` : ""}`;
      const payload = await request<{ bottles?: Array<Record<string, unknown>> }>(path, { fresh });
      return normalizeBottleOptions(payload.bottles || [], !normalizedQuery);
    },
    async listBottleCatalog({ fresh = false }: { fresh?: boolean } = {}) {
      const cacheKey = baseUrl.replace(/\/+$/, "");
      const cached = bottleCatalogCache.get(cacheKey);
      if (!fresh && cached && (cached.expiresAt === 0 || cached.expiresAt > Date.now())) return cached.promise;
      if (cached && cached.expiresAt > 0 && cached.expiresAt <= Date.now()) bottleCatalogCache.delete(cacheKey);

      let loading: Promise<RadarBottleOption[]>;
      loading = request<{ bottles?: Array<Record<string, unknown>> }>("/api/bottle-catalog", { fresh: true })
        .then((payload) => normalizeBottleOptions(payload.bottles || [], true))
        .then((bottles) => {
          if (bottleCatalogCache.get(cacheKey)?.promise === loading) {
            cacheBottleCatalog(cacheKey, { expiresAt: Date.now() + BOTTLE_CATALOG_SUCCESS_TTL_MS, promise: Promise.resolve(bottles) });
          }
          return bottles;
        })
        .catch((error: unknown) => {
          if (bottleCatalogCache.get(cacheKey)?.promise === loading) bottleCatalogCache.delete(cacheKey);
          throw error;
        });
      cacheBottleCatalog(cacheKey, { expiresAt: 0, promise: loading });
      return loading;
    },
    submitBottleContribution(payload: { rawName: string; source: "collection"; context?: Record<string, unknown> }, idempotencyKey?: string) {
      return request<BottleContributionResponse>("/api/bottle-contributions", {
        method: "POST",
        body: payload,
        ...(idempotencyKey ? { headers: { "Idempotency-Key": idempotencyKey } } : {}),
      });
    },
    getPushDeviceStatus(deviceId?: string, { fresh = false }: { fresh?: boolean } = {}) {
      const suffix = deviceId ? `?deviceId=${encodeURIComponent(deviceId)}` : "";
      return request<PushDeviceStatus>(`/api/v1/me/push-devices${suffix}`, { fresh });
    },
    registerPushDevice(payload: { deviceId: string; expoPushToken: string; platform: "ios" | "android" }) {
      return request<PushDeviceStatus>("/api/v1/me/push-devices", { method: "POST", body: { action: "register", ...payload } });
    },
    disablePushDevice(deviceId: string) {
      return request<PushDeviceStatus>("/api/v1/me/push-devices", { method: "POST", body: { action: "disable", deviceId } });
    },
    searchMonitoringGeography({ state, levels = ["state", "county", "city", "board", "store"], query = "", limit = 25, offset = 0, fresh = false }: { state?: string; levels?: Array<"state" | "county" | "city" | "board" | "store">; query?: string; limit?: number; offset?: number; fresh?: boolean } = {}) {
      const params = new URLSearchParams({ levels: levels.join(","), query, limit: String(limit), offset: String(offset) });
      if (state) params.set("state", state.trim().toUpperCase());
      return request<GeographySearchResponse>(`/api/v1/geography?${params.toString()}`, { fresh });
    },
    getReferralSummary({ fresh = false }: { fresh?: boolean } = {}) {
      return request<ReferralSummary>("/api/referrals/me", { fresh });
    },
    getSignalPoints({ fresh = false }: { fresh?: boolean } = {}) {
      return request<SignalPointsSummary>("/api/signal-points", { fresh });
    },
    submitSighting(payload: SightingSubmission, idempotencyKey: string) {
      return request<SightingSubmissionResponse>("/api/sightings", {
        method: "POST",
        body: payload,
        headers: { "Idempotency-Key": idempotencyKey },
      });
    },
  };
}
