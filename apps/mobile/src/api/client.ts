import type {
  MemberAlertsResponse,
  MemberPreferences,
  MemberPreferencesPatch,
  MemberProfile,
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
    listSignals({ view, limit = 30, cursor, fresh = false, rarities = [], state, freshness, bottle }: { view?: "all" | "market" | "community"; limit?: number; cursor?: string | null; fresh?: boolean; rarities?: SignalRarity[]; state?: string; freshness?: SignalFreshness; bottle?: string } = {}) {
      const params = new URLSearchParams({ limit: String(limit) });
      if (view && view !== "all") params.set("view", view);
      if (cursor) params.set("cursor", cursor);
      const normalizedRarities = [...new Set(rarities)].sort();
      if (normalizedRarities.length) params.set("tiers", normalizedRarities.join(","));
      const normalizedState = state?.trim().toUpperCase();
      if (normalizedState) params.set("state", normalizedState);
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
    getMemberPreferences({ fresh = false }: { fresh?: boolean } = {}) {
      return request<MemberPreferences>("/api/user/preferences", { fresh });
    },
    updateMemberPreferences(patch: MemberPreferencesPatch) {
      return request<MemberPreferences>("/api/user/preferences", { method: "POST", body: patch });
    },
    getMemberAlerts({ fresh = false }: { fresh?: boolean } = {}) {
      return request<MemberAlertsResponse>("/api/alerts", { fresh });
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
