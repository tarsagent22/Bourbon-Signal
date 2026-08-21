import {
  buildCanonicalSignalFeed,
  normalizeDropSignal,
  normalizeMemberSightingSignal,
  type CanonicalSignal,
  type SignalSourceStatus,
} from "./signal-contract.ts";
import type { MemberSighting } from "../sightings.ts";

export const PRIVATE_SIGNAL_HEADERS = {
  "Cache-Control": "private, no-store",
  Vary: "Cookie, Authorization",
};

type SourceReader = (request: Request) => Promise<Response>;

type LegacyDropsPayload = {
  drops?: Array<Record<string, unknown>>;
  total?: number;
  previewLocked?: boolean;
  requiresAccountForFullFeed?: boolean;
  lastUpdated?: string;
};

type LegacySightingsPayload = {
  sightings?: MemberSighting[];
  totalSightings?: number;
  previewLimit?: number | null;
};

const SUPPORTED_QUERY_KEYS = new Set(["limit"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function hasText(record: Record<string, unknown>, keys: string[]) {
  return keys.some((key) => typeof record[key] === "string" && String(record[key]).trim());
}

function validDropPayload(value: unknown): value is Array<Record<string, unknown>> {
  return Array.isArray(value) && value.every((candidate) => isRecord(candidate)
    && hasText(candidate, ["id", "eventId", "canonical_id", "canonicalId"])
    && hasText(candidate, ["canonical_name", "canonicalName", "bottle_name", "bottleName", "bourbonName", "brand_name", "raw_name", "rawName"]));
}

function validSightingPayload(value: unknown): value is MemberSighting[] {
  return Array.isArray(value) && value.every((candidate) => isRecord(candidate)
    && hasText(candidate, ["id"])
    && hasText(candidate, ["bottleName"])
    && hasText(candidate, ["storeId"])
    && hasText(candidate, ["storeName"])
    && hasText(candidate, ["storeAddress"])
    && hasText(candidate, ["createdAt"])
    && hasText(candidate, ["source"])
    && ["bottleId", "storeCity", "storeState", "storeZip", "quantityEstimate", "notes"].every((key) => candidate[key] === undefined || typeof candidate[key] === "string")
    && (candidate.price === undefined || candidate.price === null || (typeof candidate.price === "number" && Number.isFinite(candidate.price)))
    && (candidate.upCount === undefined || (typeof candidate.upCount === "number" && Number.isFinite(candidate.upCount)))
    && (candidate.downCount === undefined || (typeof candidate.downCount === "number" && Number.isFinite(candidate.downCount)))
    && (candidate.sightingType === undefined || candidate.sightingType === "seen_in_store" || candidate.sightingType === "online_social"));
}

function sourceStatus(response: Response, validPayload: boolean): SignalSourceStatus {
  if (response.ok) return validPayload ? "ready" : "unavailable";
  if (response.status === 401 || response.status === 403) return "unauthorized";
  return "unavailable";
}

async function responsePayload<T>(response: Response): Promise<T> {
  return await response.json().catch(() => ({})) as T;
}

function unavailableResponse() {
  return new Response(null, { status: 503 });
}

function sourceRequest(request: Request, path: string, limit: number) {
  const url = new URL(path, request.url);
  for (const [key, value] of new URL(request.url).searchParams) {
    if (SUPPORTED_QUERY_KEYS.has(key)) url.searchParams.append(key, value);
  }
  url.searchParams.set("limit", String(limit));
  if (path === "/api/sightings") url.searchParams.set("rewards", "0");
  return new Request(url, { headers: request.headers, method: "GET" });
}


function newestTimestamp(...values: Array<string | undefined>) {
  return values
    .filter((value): value is string => Boolean(value && Number.isFinite(Date.parse(value))))
    .sort((left, right) => Date.parse(right) - Date.parse(left))[0] || "";
}

function returnedBySource(signals: CanonicalSignal[]) {
  return signals.reduce((counts, signal) => {
    if (signal.source.type === "member") counts.members += 1;
    else counts.drops += 1;
    return counts;
  }, { drops: 0, members: 0 });
}

export function createSignalFeedHandler({ getDrops, getSightings }: { getDrops: SourceReader; getSightings: SourceReader }) {
  return async function handleSignalFeed(request: Request) {
    const url = new URL(request.url);
    const unsupported = [...url.searchParams.keys()].filter((key) => !SUPPORTED_QUERY_KEYS.has(key));
    if (unsupported.length > 0) {
      return Response.json({
        error: `Unsupported Signal v1 query parameter${unsupported.length === 1 ? "" : "s"}: ${unsupported.join(", ")}`,
        supported: [...SUPPORTED_QUERY_KEYS],
      }, { status: 400, headers: PRIVATE_SIGNAL_HEADERS });
    }

    const rawLimit = url.searchParams.get("limit") || "40";
    const parsedLimit = Number(rawLimit);
    if (!Number.isInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > 100) {
      return Response.json({ error: "limit must be an integer from 1 to 100" }, { status: 400, headers: PRIVATE_SIGNAL_HEADERS });
    }

    const [dropsResult, sightingsResult] = await Promise.allSettled([
      getDrops(sourceRequest(request, "/api/drops", parsedLimit)),
      getSightings(sourceRequest(request, "/api/sightings", parsedLimit)),
    ]);
    const dropsResponse = dropsResult.status === "fulfilled" ? dropsResult.value : unavailableResponse();
    const sightingsResponse = sightingsResult.status === "fulfilled" ? sightingsResult.value : unavailableResponse();
    const [dropsPayload, sightingsPayload] = await Promise.all([
      responsePayload<LegacyDropsPayload>(dropsResponse),
      responsePayload<LegacySightingsPayload>(sightingsResponse),
    ]);

    const rawDrops = dropsPayload.drops;
    const rawSightings = sightingsPayload.sightings;
    const dropsValid = validDropPayload(rawDrops);
    const sightingsValid = validSightingPayload(rawSightings);
    const dropStatus = sourceStatus(dropsResponse, dropsValid);
    const memberStatus = sourceStatus(sightingsResponse, sightingsValid);
    const drops = dropStatus === "ready" && dropsValid
      ? rawDrops.map(normalizeDropSignal)
      : [];
    const visibleSightings = memberStatus === "ready" && sightingsValid ? rawSightings : [];
    const memberSignals = visibleSightings.map(normalizeMemberSightingSignal);
    const combined = buildCanonicalSignalFeed({ drops, memberSightings: memberSignals, dropStatus, memberStatus });
    const signals = combined.signals.slice(0, parsedLimit);
    const noReadySource = dropStatus !== "ready" && memberStatus !== "ready";
    const status = noReadySource && (dropStatus === "unavailable" || memberStatus === "unavailable") ? 503 : 200;
    const memberPreviewLocked = memberStatus === "ready"
      && typeof sightingsPayload.previewLimit === "number"
      && Number(sightingsPayload.totalSightings || 0) > visibleSightings.length;

    return Response.json({
      ...combined,
      signals,
      total: signals.length,
      returnedBySource: returnedBySource(signals),
      sourceTotals: {
        drops: dropStatus === "ready" && Number.isFinite(dropsPayload.total) ? dropsPayload.total : null,
        members: memberStatus === "ready" && Number.isFinite(sightingsPayload.totalSightings) ? sightingsPayload.totalSightings : null,
      },
      access: {
        previewLocked: Boolean(dropsPayload.previewLocked)
          || memberPreviewLocked,
        requiresAccountForFullFeed: Boolean(dropsPayload.requiresAccountForFullFeed)
          || memberPreviewLocked,
        memberSignalsAvailable: memberStatus === "ready",
      },
      degraded: dropStatus === "unavailable" || memberStatus === "unavailable",
      lastUpdated: newestTimestamp(
        dropsPayload.lastUpdated,
        ...memberSignals.map((signal) => signal.timing.displayAt),
      ),
    }, { status, headers: PRIVATE_SIGNAL_HEADERS });
  };
}
