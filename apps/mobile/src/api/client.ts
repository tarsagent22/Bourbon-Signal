import { uploadClientBlob, type ClientBlobUploadResult } from "./blob-upload";
import { validApiResponse } from "./response-validation";
import type {
  MemberAlertsResponse,
  MemberPreferences,
  MemberPreferencesPatch,
  MemberProfile,
  MemberProfilePatch,
  MembershipTrialEligibility,
  GeographySearchResponse,
  HuntOutcome,
  HuntOutcomeResponse,
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

// A consumer may stop waiting without cancelling an attempt shared by other screens.
function consume<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(new MobileApiError("Request cancelled.", 0, "REQUEST_CANCELLED"));
    if (signal.aborted) abort();
    else signal.addEventListener("abort", abort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
}

type RequestOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH";
  body?: unknown;
  headers?: Record<string, string>;
  fresh?: boolean;
  signal?: AbortSignal;
};

type BlobUploader = (
  pathname: string,
  body: Blob,
  options: {
    access: "public";
    contentType: "image/jpeg";
    handleUploadUrl: string;
    clientPayload: string;
    headers: { Authorization: string };
    multipart: boolean;
  },
) => Promise<ClientBlobUploadResult>;

const defaultBlobUploader: BlobUploader = (pathname, body, options) => uploadClientBlob({
  pathname,
  body,
  handleUploadUrl: options.handleUploadUrl,
  clientPayload: options.clientPayload,
  authorization: options.headers.Authorization,
});

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseReferralSummary(payload: unknown): ReferralSummary {
  if (!isRecord(payload) || !isRecord(payload.program) || !isRecord(payload.program.pointsByTier) || !isRecord(payload.referrals)) {
    throw new MobileApiError("Referral rules are temporarily unavailable.", 502, "INVALID_REFERRAL_PROGRAM", true);
  }
  const program = payload.program;
  const pointsByTier = program.pointsByTier as Record<string, unknown>;
  const referrals = payload.referrals;
  const pointKeys = ["free", "standard", "barrel", "bottled-in-bond"] as const;
  const referralKeys = ["total", "free", "standard", "barrel", "founder"] as const;
  const validCount = (value: unknown) => typeof value === "number" && Number.isInteger(value) && value >= 0;
  const valid = typeof payload.code === "string"
    && typeof payload.referralLink === "string"
    && validCount(payload.referralPoints)
    && validCount(program.freeAwardLimit)
    && typeof program.upgradeAwardsDifferenceOnly === "boolean"
    && pointKeys.every((key) => validCount(pointsByTier[key]))
    && referralKeys.every((key) => validCount(referrals[key]));
  if (!valid) throw new MobileApiError("Referral rules are temporarily unavailable.", 502, "INVALID_REFERRAL_PROGRAM", true);
  return {
    code: payload.code as string,
    referralLink: payload.referralLink as string,
    referralPoints: payload.referralPoints as number,
    founderGlassesEarned: validCount(payload.founderGlassesEarned) ? payload.founderGlassesEarned as number : 0,
    founderGlassesAwaitingAddress: validCount(payload.founderGlassesAwaitingAddress) ? payload.founderGlassesAwaitingAddress as number : 0,
    program: payload.program as ReferralSummary["program"],
    referrals: payload.referrals as ReferralSummary["referrals"],
  };
}

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
  blobUploader = defaultBlobUploader,
  readCooldownMs = 10_000,
  requestTimeoutMs = 15_000,
  maxReadCacheEntries = 64,
  now = Date.now,
}: {
  baseUrl?: string;
  getToken: () => Promise<string | null>;
  fetcher?: typeof fetch;
  blobUploader?: BlobUploader;
  readCooldownMs?: number;
  requestTimeoutMs?: number;
  maxReadCacheEntries?: number;
  now?: () => number;
}) {
  const recentReads = new Map<string, { expiresAt: number; promise: Promise<unknown> }>();
  let currentToken: string | null | undefined;
  const cacheLimit = Math.max(1, Math.min(256, maxReadCacheEntries));
  function pruneReads() {
    for (const [key, entry] of recentReads) if (entry.expiresAt <= now()) recentReads.delete(key);
    while (recentReads.size > cacheLimit) recentReads.delete(recentReads.keys().next().value!);
  }
  async function bounded<T>(work: (signal: AbortSignal) => Promise<T>): Promise<T> {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(new MobileApiError("The request timed out. Please retry.", 408, "REQUEST_TIMEOUT", true));
        controller.abort();
      }, Math.max(1, requestTimeoutMs));
    });
    try { return await Promise.race([work(controller.signal), timeout]); }
    finally { clearTimeout(timer!); }
  }

  async function performRequest<T>(path: string, options: RequestOptions = {}, suppliedToken?: string | null): Promise<T> {
    return bounded(async (signal) => {
    const token = suppliedToken === undefined ? await getToken() : suppliedToken;
    const headers = new Headers({ Accept: "application/json", ...options.headers });
    if (token) headers.set("Authorization", `Bearer ${token}`);
    if (options.body !== undefined) headers.set("Content-Type", "application/json");
    const response = await fetcher(new Request(new URL(path, baseUrl), {
      method: options.method || "GET",
      signal,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    })).catch(() => { throw new MobileApiError("Unable to connect. Check your connection and retry.", 0, "NETWORK_ERROR", true); });
    const raw: unknown = await response.json().catch(() => null);
    const payload = isRecord(raw) ? raw : {};
    if (!response.ok) {
      const structured = payload.error && typeof payload.error === "object" ? payload.error as Record<string, unknown> : null;
      const scalarMessage = typeof payload.error === "string" ? payload.error : null;
      throw new MobileApiError(
        (scalarMessage || (typeof structured?.message === "string" ? structured.message : "Bourbon Signal is temporarily unavailable.")).replace(/[\u0000-\u001f]/g, " ").slice(0, 240),
        response.status,
        typeof structured?.code === "string" ? structured.code : typeof payload.code === "string" ? payload.code : "UNKNOWN_ERROR",
        structured?.retryable === true,
        payload.resetCursor === true,
        typeof structured?.requestId === "string" ? structured.requestId : "",
      );
    }
    if (!validApiResponse(path, raw)) throw new MobileApiError("The server returned an invalid response. Please retry.", 502, "INVALID_RESPONSE", true);
    return raw as T;
    });
  }

  async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const token = await bounded(() => getToken());
    if (token !== currentToken) { recentReads.clear(); currentToken = token; }
    pruneReads();
    if (options.method && options.method !== "GET") {
      const payload = await performRequest<T>(path, options, token);
      for (const key of recentReads.keys()) {
        if (key.endsWith(` ${path}`)) recentReads.delete(key);
      }
      return payload;
    }
    const key = `GET ${path}`;
    const time = now();
    const recent = recentReads.get(key);
    if (!options.fresh && recent && recent.expiresAt > time) {
      recentReads.delete(key); recentReads.set(key, recent);
      return consume(recent.promise as Promise<T>, options.signal);
    }
    const promise = performRequest<T>(path, options, token);
    recentReads.set(key, { expiresAt: time + readCooldownMs, promise });
    pruneReads();
    void promise.catch((error) => {
      if (error instanceof MobileApiError && error.code === "REQUEST_TIMEOUT" && recentReads.get(key)?.promise === promise) recentReads.delete(key);
    });
    return consume(promise, options.signal);
  }

  return {
    clearReadCache() { recentReads.clear(); currentToken = undefined; },
    readCacheInfo() { pruneReads(); return { size: recentReads.size, keys: [...recentReads.keys()] }; },
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
    getHuntOutcome(id: string) {
      return request<HuntOutcomeResponse>(`/api/v1/signals/${encodeURIComponent(id)}/outcome`, { fresh: true });
    },
    setHuntOutcome(id: string, outcome: HuntOutcome | null) {
      return request<HuntOutcomeResponse>(`/api/v1/signals/${encodeURIComponent(id)}/outcome`, { method: "PUT", body: { outcome } });
    },
    getMemberProfile({ fresh = false, signal }: { fresh?: boolean; signal?: AbortSignal } = {}) {
      return request<MemberProfile>("/api/v1/me/profile", { fresh, signal });
    },
    updateMemberProfile(patch: MemberProfilePatch) {
      return request<MemberProfile>("/api/v1/me/profile", { method: "PATCH", body: patch });
    },
    getMembershipTrialEligibility({ fresh = false }: { fresh?: boolean } = {}) {
      return request<MembershipTrialEligibility>("/api/membership-trial", { fresh });
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
    getMemberPreferences({ fresh = false, signal }: { fresh?: boolean; signal?: AbortSignal } = {}) {
      return request<MemberPreferences>("/api/user/preferences", { fresh, signal });
    },
    updateMemberPreferences(patch: MemberPreferencesPatch) {
      return request<MemberPreferences>("/api/user/preferences", { method: "POST", body: patch });
    },
    getMemberAlerts({ fresh = false, signal }: { fresh?: boolean; signal?: AbortSignal } = {}) {
      return request<MemberAlertsResponse>("/api/alerts", { fresh, signal });
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
    async listBottleCatalog({ fresh = false, signal }: { fresh?: boolean; signal?: AbortSignal } = {}) {
      const cacheKey = baseUrl.replace(/\/+$/, "");
      const cached = bottleCatalogCache.get(cacheKey);
      if (!fresh && cached && (cached.expiresAt === 0 || cached.expiresAt > Date.now())) return consume(cached.promise, signal);
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
      return consume(loading, signal);
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
    async getReferralSummary({ fresh = false }: { fresh?: boolean } = {}) {
      return parseReferralSummary(await request<unknown>("/api/referrals/me", { fresh }));
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
    async uploadSightingPhoto(sightingId: string, file: Blob, timestamp = Date.now()) {
      if (!/^sighting_[-_a-zA-Z0-9]{1,150}$/.test(sightingId)) {
        throw new MobileApiError("The saved sighting could not be matched to this photo.", 400, "INVALID_SIGHTING_ID");
      }
      const token = await bounded(() => getToken());
      if (!token) throw new MobileApiError("Your session could not be verified. Return to Signals and retry.", 401, "UNAUTHORIZED");
      return bounded(() => blobUploader(`sighting-proofs/${sightingId}/${timestamp}.jpg`, file, {
        access: "public",
        contentType: "image/jpeg",
        handleUploadUrl: new URL("/api/sightings/photo", baseUrl).toString(),
        clientPayload: JSON.stringify({ sightingId }),
        headers: { Authorization: `Bearer ${token}` },
        multipart: file.size > 4 * 1024 * 1024,
      }));
    },
    attachSightingPhoto(sightingId: string, blob: { url?: string; pathname: string }) {
      return request<{ ok: true; photoProof: { url: string; pathname: string; uploadedAt: string; status: "verified_public" } }>("/api/sightings/photo", {
        method: "PATCH",
        body: { sightingId, blob },
      });
    },

  };
}
