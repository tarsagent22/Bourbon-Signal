import type {
  MemberAlertsResponse,
  MemberPreferences,
  MemberProfile,
  SightingSubmission,
  SightingSubmissionResponse,
  Signal,
  SignalFeedPage,
  SignalPointsSummary,
} from "./types";

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

  async function performRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const token = await getToken();
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

  function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    if (options.method && options.method !== "GET") return performRequest<T>(path, options);
    const key = `GET ${path}`;
    const now = Date.now();
    const recent = recentReads.get(key);
    if (recent && recent.expiresAt > now) return recent.promise as Promise<T>;
    const promise = performRequest<T>(path, options);
    recentReads.set(key, { expiresAt: now + readCooldownMs, promise });
    return promise;
  }

  return {
    listSignals({ limit = 30, cursor }: { limit?: number; cursor?: string | null } = {}) {
      const params = new URLSearchParams({ limit: String(limit) });
      if (cursor) params.set("cursor", cursor);
      return request<SignalFeedPage>(`/api/v1/signals?${params.toString()}`);
    },
    getSignal(id: string) {
      return request<{ contractVersion: "bourbon-signal/mobile-api@1"; signal: Signal }>(`/api/v1/signals/${encodeURIComponent(id)}`);
    },
    getMemberProfile() {
      return request<MemberProfile>("/api/v1/me/profile");
    },
    getMemberPreferences() {
      return request<MemberPreferences>("/api/user/preferences");
    },
    getMemberAlerts() {
      return request<MemberAlertsResponse>("/api/alerts");
    },
    getSignalPoints() {
      return request<SignalPointsSummary>("/api/signal-points");
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
