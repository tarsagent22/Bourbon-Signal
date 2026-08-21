import type { MemberProfile, Signal, SignalFeedPage } from "./types";

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

export function createMobileApi({
  baseUrl = process.env.EXPO_PUBLIC_API_URL || "https://www.bourbonsignal.com",
  getToken,
  fetcher = fetch,
}: {
  baseUrl?: string;
  getToken: () => Promise<string | null>;
  fetcher?: typeof fetch;
}) {
  async function request<T>(path: string): Promise<T> {
    const token = await getToken();
    const headers = new Headers({ Accept: "application/json" });
    if (token) headers.set("Authorization", `Bearer ${token}`);
    const response = await fetcher(new Request(new URL(path, baseUrl), { headers }));
    const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
    if (!response.ok) {
      const error = (payload.error || {}) as Record<string, unknown>;
      throw new MobileApiError(
        typeof error.message === "string" ? error.message : "Bourbon Signal is temporarily unavailable.",
        response.status,
        typeof error.code === "string" ? error.code : "UNKNOWN_ERROR",
        error.retryable === true,
        payload.resetCursor === true,
      );
    }
    return payload as T;
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
  };
}
