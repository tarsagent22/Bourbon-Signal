import {
  buildCanonicalSignalFeed,
  normalizeDropSignal,
  normalizeMemberSightingSignal,
  type CanonicalSignal,
  type SignalSourceStatus,
} from "./signal-contract.ts";
import type { MemberSighting } from "../sightings.ts";
import { encodeDropCursor } from "../drop-cursor.ts";
import { decodeSignalFeedCursor, encodeSignalFeedCursor } from "./signal-feed-cursor.ts";
import type { SignalFeedView } from "./signal-feed-cursor.ts";
import { SIGNAL_API_ERROR_VERSION } from "./signal-api-contract.ts";
import type { MarketSummary } from "./signal-market-summary.ts";

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
  snapshot?: string;
  hasMore?: boolean;
  resetCursor?: boolean;
  marketSummaries?: unknown;
};

type LegacySightingsPayload = {
  sightings?: MemberSighting[];
  totalSightings?: number;
  previewLimit?: number | null;
};

const SUPPORTED_QUERY_KEYS = new Set(["limit", "cursor", "view"]);

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

function sanitizedMarketSummaries(value: unknown): MarketSummary[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((candidate) => {
    if (!isRecord(candidate)) return [];
    const state = typeof candidate.state === "string" ? candidate.state.trim().toUpperCase() : "";
    const areaLabel = typeof candidate.areaLabel === "string" ? candidate.areaLabel.trim().slice(0, 80) : "";
    const signalCount = Number(candidate.signalCount);
    const bottleNames = Array.isArray(candidate.bottleNames)
      ? candidate.bottleNames.filter((name): name is string => typeof name === "string" && Boolean(name.trim())).map((name) => name.trim().slice(0, 140)).slice(0, 6)
      : [];
    return /^[A-Z]{2}$/.test(state) && areaLabel && Number.isSafeInteger(signalCount) && signalCount > 0
      ? [{ state, areaLabel, signalCount, bottleNames }]
      : [];
  }).slice(0, 12);
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

function sourceRequest(request: Request, path: string, options: { limit: number; offset?: number; cursor?: string | null; memberBoundary?: { createdAt: string; id: string } | null }) {
  const url = new URL(path, request.url);
  url.searchParams.set("limit", String(options.limit));
  if (options.cursor) url.searchParams.set("cursor", options.cursor);
  else if (options.offset) url.searchParams.set("offset", String(options.offset));
  if (path === "/api/drops") url.searchParams.set("signalOrder", "canonical");
  if (path === "/api/sightings") {
    url.searchParams.set("rewards", "0");
    if (options.memberBoundary) {
      url.searchParams.set("beforeCreatedAt", options.memberBoundary.createdAt);
      url.searchParams.set("beforeId", options.memberBoundary.id);
    }
  }
  return new Request(url, { headers: request.headers, method: "GET" });
}

function cursorError(status: 400 | 409, code: "INVALID_CURSOR" | "CURSOR_RESET_REQUIRED", message: string) {
  return Response.json({
    contractVersion: SIGNAL_API_ERROR_VERSION,
    error: { code, message, retryable: status === 409 },
    ...(status === 409 ? { resetCursor: true } : {}),
  }, { status, headers: PRIVATE_SIGNAL_HEADERS });
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

    const requestedView = url.searchParams.get("view");
    if (requestedView && !(["market", "community"] as string[]).includes(requestedView)) {
      return Response.json({ error: "view must be market or community" }, { status: 400, headers: PRIVATE_SIGNAL_HEADERS });
    }
    const view: SignalFeedView = requestedView === "market" || requestedView === "community" ? requestedView : "all";

    const rawLimit = url.searchParams.get("limit") || "40";
    const parsedLimit = Number(rawLimit);
    if (!Number.isInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > 100) {
      return Response.json({ error: "limit must be an integer from 1 to 100" }, { status: 400, headers: PRIVATE_SIGNAL_HEADERS });
    }

    const requestedCursor = url.searchParams.get("cursor");
    const cursor = requestedCursor ? decodeSignalFeedCursor(requestedCursor) : null;
    if (requestedCursor && !cursor) return cursorError(400, "INVALID_CURSOR", "Signal cursor is invalid.");
    if (cursor && cursor.view !== view) return cursorError(400, "INVALID_CURSOR", "Signal cursor does not match this feed view.");
    const dropsOffset = cursor?.dropsOffset || 0;
    const sourcePageSize = parsedLimit + 1;
    const dropCursor = cursor?.dropSnapshot
      ? encodeDropCursor({ snapshot: cursor.dropSnapshot, offset: dropsOffset })
      : null;

    const [dropsResult, sightingsResult] = await Promise.allSettled([
      view === "community"
        ? Promise.resolve(Response.json({ drops: [], total: 0, snapshot: "community-view", hasMore: false }))
        : getDrops(sourceRequest(request, "/api/drops", { limit: sourcePageSize, offset: dropsOffset, cursor: dropCursor })),
      view === "market"
        ? Promise.resolve(Response.json({ sightings: [], totalSightings: 0, previewLimit: null }))
        : getSightings(sourceRequest(request, "/api/sightings", { limit: sourcePageSize, memberBoundary: cursor?.memberBoundary || null })),
    ]);
    const dropsResponse = dropsResult.status === "fulfilled" ? dropsResult.value : unavailableResponse();
    const sightingsResponse = sightingsResult.status === "fulfilled" ? sightingsResult.value : unavailableResponse();
    const [dropsPayload, sightingsPayload] = await Promise.all([
      responsePayload<LegacyDropsPayload>(dropsResponse),
      responsePayload<LegacySightingsPayload>(sightingsResponse),
    ]);
    if (dropsResponse.status === 409 && dropsPayload.resetCursor) {
      return cursorError(409, "CURSOR_RESET_REQUIRED", "Signal data changed. Refresh the feed to continue.");
    }

    const dropsValid = validDropPayload(dropsPayload.drops);
    const sightingsValid = validSightingPayload(sightingsPayload.sightings);
    const rawDrops = dropsValid ? dropsPayload.drops! : [];
    const rawSightings = sightingsValid ? sightingsPayload.sightings! : [];
    const dropStatus = sourceStatus(dropsResponse, dropsValid);
    const memberStatus = sourceStatus(sightingsResponse, sightingsValid);
    const drops = dropStatus === "ready" && dropsValid ? rawDrops.map(normalizeDropSignal) : [];
    const visibleSightings = memberStatus === "ready" && sightingsValid ? rawSightings : [];
    const memberSignals = visibleSightings.map(normalizeMemberSightingSignal);
    const marketDetailsLocked = view !== "community" && Boolean(dropsPayload.requiresAccountForFullFeed);
    const selectedDrops = view === "community" || marketDetailsLocked ? [] : drops;
    const selectedMemberSignals = view === "market" ? [] : memberSignals;
    const combined = buildCanonicalSignalFeed({ drops: selectedDrops, memberSightings: selectedMemberSignals, dropStatus, memberStatus });
    const signals = combined.signals.slice(0, parsedLimit);
    const relevantSourceDegraded = view === "market"
      ? dropStatus === "unavailable"
      : view === "community"
        ? memberStatus === "unavailable"
        : dropStatus === "unavailable" || memberStatus === "unavailable";
    const relevantSourceReady = view === "market"
      ? dropStatus === "ready"
      : view === "community"
        ? memberStatus === "ready"
        : dropStatus === "ready" && memberStatus === "ready";
    const noUsableSource = view === "market"
      ? dropStatus !== "ready"
      : view === "community"
        ? memberStatus !== "ready"
        : dropStatus !== "ready" && memberStatus !== "ready";
    const status = noUsableSource && relevantSourceDegraded ? 503 : 200;
    const memberPreviewLocked = view !== "market" && memberStatus === "ready"
      && typeof sightingsPayload.previewLimit === "number"
      && Number(sightingsPayload.totalSightings || 0) > rawSightings.length;
    const consumed = returnedBySource(signals);
    const dropPreviewLocked = Boolean(dropsPayload.previewLocked) || Boolean(dropsPayload.requiresAccountForFullFeed);
    const accessPreviewLocked = view === "market"
      ? marketDetailsLocked
      : view === "community"
        ? memberPreviewLocked
        : dropPreviewLocked || memberPreviewLocked;
    const requiresAccountForFullFeed = view === "market"
      ? marketDetailsLocked
      : view === "community"
        ? memberPreviewLocked
        : Boolean(dropsPayload.requiresAccountForFullFeed) || memberPreviewLocked;
    const continuationLocked = accessPreviewLocked || requiresAccountForFullFeed;
    const dropsHaveMore = view !== "community" && dropStatus === "ready" && (Boolean(dropsPayload.hasMore) || drops.length > consumed.drops);
    const membersHaveMore = view !== "market" && memberStatus === "ready" && memberSignals.length > consumed.members;
    const selectedSourceHasMore = view === "market" ? dropsHaveMore : view === "community" ? membersHaveMore : dropsHaveMore || membersHaveMore;
    const hasMore = !continuationLocked && relevantSourceReady && signals.length > 0 && selectedSourceHasMore;
    let nextMemberBoundary = cursor?.memberBoundary || null;
    if (consumed.members > 0) {
      for (let index = signals.length - 1; index >= 0; index -= 1) {
        const signal = signals[index];
        if (signal.source.type !== "member") continue;
        const memberIndex = memberSignals.findIndex((memberSignal) => memberSignal.id === signal.id);
        const sighting = memberIndex >= 0 ? visibleSightings[memberIndex] : null;
        if (sighting) nextMemberBoundary = { createdAt: sighting.createdAt, id: sighting.id };
        break;
      }
    }
    const nextCursor = hasMore ? encodeSignalFeedCursor({
      view,
      dropsOffset: dropsOffset + consumed.drops,
      dropSnapshot: dropsPayload.snapshot || cursor?.dropSnapshot || null,
      memberBoundary: nextMemberBoundary,
    }) : null;

    return Response.json({
      ...combined,
      view,
      signals,
      marketSummaries: view === "market" && marketDetailsLocked ? sanitizedMarketSummaries(dropsPayload.marketSummaries) : [],
      total: signals.length,
      returnedBySource: consumed,
      nextCursor,
      hasMore,
      sourceTotals: {
        drops: view !== "community" && dropStatus === "ready" && Number.isFinite(dropsPayload.total) ? dropsPayload.total : null,
        members: view !== "market" && memberStatus === "ready" && Number.isFinite(sightingsPayload.totalSightings) ? sightingsPayload.totalSightings : null,
      },
      access: {
        previewLocked: accessPreviewLocked,
        requiresAccountForFullFeed,
        memberSignalsAvailable: view !== "market" && memberStatus === "ready",
        marketDetailsLocked,
      },
      degraded: relevantSourceDegraded,
      lastUpdated: newestTimestamp(
        ...(view === "community" ? [] : [dropsPayload.lastUpdated]),
        ...(view === "market" ? [] : memberSignals.map((signal) => signal.timing.displayAt)),
      ),
    }, { status, headers: PRIVATE_SIGNAL_HEADERS });
  };
}
