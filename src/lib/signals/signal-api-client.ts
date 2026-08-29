import {
  SIGNAL_API_ERROR_VERSION,
  type SignalActionInput,
  type SignalActionResponse,
  type SignalApiErrorBody,
  type SignalCreateInput,
  type SignalCreateResponse,
  type SignalDetailResponse,
  type SignalHuntOutcome,
  type SignalHuntOutcomeResponse,
  type SignalMemberProfileResponse,
} from "./signal-api-contract.ts";
import type { CanonicalSignalFeed } from "./signal-contract.ts";

export interface SignalFeedPage extends CanonicalSignalFeed {
  nextCursor: string | null;
  hasMore: boolean;
}

export class SignalApiClientError extends Error {
  readonly code: string;
  readonly status: number;
  readonly retryable: boolean;

  constructor(input: { code: string; message: string; status: number; retryable?: boolean }) {
    super(input.message);
    this.name = "SignalApiClientError";
    this.code = input.code;
    this.status = input.status;
    this.retryable = input.retryable === true;
  }
}

type SignalFetch = (request: Request) => Promise<Response>;

export function createSignalApiClient({
  baseUrl,
  getToken,
  fetch: fetchRequest = (request) => globalThis.fetch(request),
  createIdempotencyKey = () => globalThis.crypto?.randomUUID?.() || `signal-${Date.now()}-${Math.random().toString(36).slice(2)}`,
}: {
  baseUrl: string;
  getToken?: () => Promise<string | null>;
  fetch?: SignalFetch;
  createIdempotencyKey?: () => string;
}) {
  const root = baseUrl.replace(/\/+$/, "");

  async function request<T>(path: string, init: RequestInit = {}) {
    const headers = new Headers(init.headers);
    headers.set("Accept", "application/json");
    const token = await getToken?.();
    if (token) headers.set("Authorization", `Bearer ${token}`);
    if (init.body !== undefined) headers.set("Content-Type", "application/json");
    const response = await fetchRequest(new Request(`${root}${path}`, { ...init, headers }));
    const payload = await response.json().catch(() => null) as T | SignalApiErrorBody | null;
    if (!response.ok) {
      const apiError = payload && typeof payload === "object" && "contractVersion" in payload && payload.contractVersion === SIGNAL_API_ERROR_VERSION
        ? (payload as SignalApiErrorBody).error
        : { code: "UPSTREAM_UNAVAILABLE", message: "Signal service is temporarily unavailable.", retryable: response.status >= 500 };
      throw new SignalApiClientError({ ...apiError, status: response.status });
    }
    if (!payload) throw new SignalApiClientError({ code: "UPSTREAM_UNAVAILABLE", message: "Signal service returned an empty response.", status: 503, retryable: true });
    return payload as T;
  }

  return {
    listSignals({ limit = 40, cursor }: { limit?: number; cursor?: string | null } = {}) {
      const params = new URLSearchParams({ limit: String(limit) });
      if (cursor) params.set("cursor", cursor);
      return request<SignalFeedPage>(`/api/v1/signals?${params.toString()}`);
    },
    getMemberProfile() {
      return request<SignalMemberProfileResponse>("/api/v1/me/profile");
    },
    getSignal(signalId: string) {
      return request<SignalDetailResponse>(`/api/v1/signals/${encodeURIComponent(signalId)}`);
    },
    getHuntOutcome(signalId: string) {
      return request<SignalHuntOutcomeResponse>(`/api/v1/signals/${encodeURIComponent(signalId)}/outcome`);
    },
    setHuntOutcome(signalId: string, outcome: SignalHuntOutcome | null) {
      return request<SignalHuntOutcomeResponse>(`/api/v1/signals/${encodeURIComponent(signalId)}/outcome`, {
        method: "POST",
        body: JSON.stringify({ outcome }),
      });
    },
    createSignal(input: SignalCreateInput, options: { idempotencyKey?: string } = {}) {
      return request<SignalCreateResponse>("/api/v1/signals", {
        method: "POST",
        headers: { "Idempotency-Key": options.idempotencyKey || createIdempotencyKey() },
        body: JSON.stringify(input),
      });
    },
    actOnSignal(signalId: string, input: SignalActionInput) {
      return request<SignalActionResponse>(`/api/v1/signals/${encodeURIComponent(signalId)}/actions`, {
        method: "POST",
        body: JSON.stringify(input),
      });
    },
  };
}
