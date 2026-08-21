import { normalizeDropSignal, normalizeMemberSightingSignal } from "./signal-contract.ts";
import {
  SIGNAL_API_ERROR_VERSION,
  SIGNAL_API_VERSION,
  legacySightingPayloadFromCreate,
  normalizeSignalCreateInput,
  signalIdParts,
  type SignalActionInput,
  type SignalApiErrorCode,
} from "./signal-api-contract.ts";
import type { MemberSighting } from "../sightings.ts";

export const PRIVATE_SIGNAL_API_HEADERS = {
  "Cache-Control": "private, no-store",
  "CDN-Cache-Control": "no-store",
  "Vercel-CDN-Cache-Control": "no-store",
  Vary: "Cookie, Authorization",
};

type RouteReader = (request: Request) => Promise<Response>;

function apiError(status: number, code: SignalApiErrorCode, message: string, retryable = false) {
  return Response.json({
    contractVersion: SIGNAL_API_ERROR_VERSION,
    error: { code, message, ...(retryable ? { retryable: true } : {}) },
  }, { status, headers: PRIVATE_SIGNAL_API_HEADERS });
}

export function signalApiError(status: number, code: SignalApiErrorCode, message: string, retryable = false) {
  return apiError(status, code, message, retryable);
}

function upstreamError(status: number, fallbackMessage?: string) {
  if (status === 400) return apiError(400, "INVALID_REQUEST", fallbackMessage || "The Signal request is invalid.");
  if (status === 401) return apiError(401, "UNAUTHORIZED", "Sign in to continue.");
  if (status === 403) return apiError(403, "FORBIDDEN", fallbackMessage || "Your membership does not include this action.");
  if (status === 404) return apiError(404, "SIGNAL_NOT_FOUND", fallbackMessage || "Signal not found.");
  if (status === 409) return apiError(409, "IDEMPOTENCY_CONFLICT", fallbackMessage || "This request conflicts with an earlier request.");
  if (status === 429) return apiError(429, "RATE_LIMITED", "Too many requests. Try again shortly.", true);
  return apiError(503, "UPSTREAM_UNAVAILABLE", "Signal service is temporarily unavailable.", true);
}

async function payloadOf(response: Response) {
  return await response.json().catch(() => ({})) as Record<string, unknown>;
}

function forwardedRequest(request: Request, path: string, method: "GET" | "POST" | "PATCH", body?: unknown) {
  const headers = new Headers(request.headers);
  if (body !== undefined) headers.set("Content-Type", "application/json");
  return new Request(new URL(path, request.url), {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

function validIdempotencyKey(value: string | null) {
  const key = String(value || "").trim();
  return /^[A-Za-z0-9._:-]{8,120}$/.test(key) ? key : null;
}

function isMemberSighting(value: unknown): value is MemberSighting {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  return typeof item.id === "string" && typeof item.bottleName === "string" && typeof item.storeId === "string"
    && typeof item.storeName === "string" && typeof item.storeAddress === "string" && typeof item.createdAt === "string";
}

export function createSignalCreateHandler({ createSighting }: { createSighting: RouteReader }) {
  return async function handleSignalCreate(request: Request) {
    const idempotencyKey = validIdempotencyKey(request.headers.get("Idempotency-Key"));
    if (!idempotencyKey) return apiError(400, "IDEMPOTENCY_KEY_REQUIRED", "A valid Idempotency-Key header is required.");
    const parsed = normalizeSignalCreateInput(await request.json().catch(() => null));
    if (parsed.ok === false) return apiError(400, parsed.error.code, parsed.error.message);
    const legacyResponse = await createSighting(forwardedRequest(request, "/api/sightings", "POST", legacySightingPayloadFromCreate(parsed.value)));
    const legacyPayload = await payloadOf(legacyResponse);
    if (!legacyResponse.ok) return upstreamError(legacyResponse.status, typeof legacyPayload.error === "string" ? legacyPayload.error : undefined);
    if (!isMemberSighting(legacyPayload.sighting)) return apiError(503, "UPSTREAM_UNAVAILABLE", "Signal save completed without a readable Signal.", true);
    const created = legacyPayload.created !== false;
    return Response.json({
      contractVersion: SIGNAL_API_VERSION,
      created,
      duplicate: legacyPayload.duplicate === true || !created,
      signal: normalizeMemberSightingSignal(legacyPayload.sighting),
    }, { status: created ? 201 : 200, headers: PRIVATE_SIGNAL_API_HEADERS });
  };
}

export function createSignalDetailHandler({ getDrops, getSightings }: { getDrops: RouteReader; getSightings: RouteReader }) {
  return async function handleSignalDetail(request: Request, signalId: string) {
    const parts = signalIdParts(signalId);
    if (!parts) return apiError(400, "INVALID_REQUEST", "Signal ID is invalid.");
    const memberSource = parts.source === "member";
    const path = memberSource
      ? `/api/sightings?sightingId=${encodeURIComponent(parts.rawId)}&rewards=0`
      : `/api/drops?signalId=${encodeURIComponent(parts.rawId)}&signalSource=${encodeURIComponent(parts.source)}&limit=1`;
    const sourceResponse = await (memberSource ? getSightings : getDrops)(forwardedRequest(request, path, "GET"));
    const sourcePayload = await payloadOf(sourceResponse);
    if (!sourceResponse.ok) return upstreamError(sourceResponse.status);
    const signal = memberSource
      ? (Array.isArray(sourcePayload.sightings) ? sourcePayload.sightings : [])
        .filter(isMemberSighting)
        .map(normalizeMemberSightingSignal)
        .find((candidate) => candidate.id === signalId)
      : (Array.isArray(sourcePayload.drops) ? sourcePayload.drops : [])
        .filter((candidate): candidate is Record<string, unknown> => Boolean(candidate && typeof candidate === "object" && !Array.isArray(candidate)))
        .map(normalizeDropSignal)
        .find((candidate) => candidate.id === signalId);
    if (!signal) return apiError(404, "SIGNAL_NOT_FOUND", "Signal not found.");
    return Response.json({ contractVersion: SIGNAL_API_VERSION, signal }, { headers: PRIVATE_SIGNAL_API_HEADERS });
  };
}

function actionVote(action: SignalActionInput["action"]) {
  return action === "helpful" || action === "confirm" ? "up" as const : "down" as const;
}

function parseAction(value: unknown): SignalActionInput["action"] | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const action = (value as Record<string, unknown>).action;
  return action === "helpful" || action === "confirm" || action === "correct" || action === "no_longer_there" ? action : null;
}

export function createSignalActionHandler({ updateSighting }: { updateSighting: RouteReader }) {
  return async function handleSignalAction(request: Request, signalId: string) {
    const parts = signalIdParts(signalId);
    if (!parts) return apiError(400, "INVALID_REQUEST", "Signal ID is invalid.");
    if (parts.source !== "member") return apiError(409, "ACTION_NOT_AVAILABLE", "This action is not available for that Signal source.");
    const action = parseAction(await request.json().catch(() => null));
    if (!action) return apiError(400, "INVALID_REQUEST", "Action must be helpful, confirm, correct, or no_longer_there.");
    const vote = actionVote(action);
    const legacyResponse = await updateSighting(forwardedRequest(request, "/api/sightings", "PATCH", { sightingId: parts.rawId, vote, active: true }));
    const legacyPayload = await payloadOf(legacyResponse);
    if (!legacyResponse.ok) return upstreamError(legacyResponse.status, typeof legacyPayload.error === "string" ? legacyPayload.error : undefined);
    if (!isMemberSighting(legacyPayload.sighting)) return apiError(503, "UPSTREAM_UNAVAILABLE", "Signal action completed without a readable Signal.", true);
    return Response.json({
      contractVersion: SIGNAL_API_VERSION,
      signal: normalizeMemberSightingSignal(legacyPayload.sighting),
      action: { type: action, active: legacyPayload.sighting.myVote === vote },
    }, { headers: PRIVATE_SIGNAL_API_HEADERS });
  };
}
