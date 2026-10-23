import { dropFeedSearchMatches } from "@/lib/signals/feed-search";
import { unstable_cache } from "next/cache";
import { packPublicFeed, unpackPublicFeed } from "@/lib/public-feed-pack";
import { createPreparedDropCache, createAsyncPreparedDropCache } from "@/lib/prepared-drop-cache";
import { getServerEntitlements } from "@/lib/server-entitlements";
import { getEntitlements } from "@/lib/entitlements";
import { authorizeEngineFeedVerification, ENGINE_FEED_VERIFICATION_HEADER, engineFeedCountPayload } from "@/lib/engine-feed-verification";
import { authorizePilotReceipt, PILOT_RECEIPT_HEADER, pilotReceiptPayload } from '@/lib/nationwide-pilot-receipt';
import { readRuntimeSourceDropOverlay } from "@/lib/source-lane-runtime";
import { NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { normalizeDropForSite, readSiteExportResults, readSiteExportIdentity, siteExportHeaders } from "@/lib/site-engine-contract";
import { normalizeStateCodeParam } from "@/lib/location-normalization";
import { decodeDropCursor, DropCursorSnapshotError, paginateDrops } from "@/lib/drop-cursor";
import { compareDropFeedNewestFirst, dropDisplayTime, dropFreshnessTime, resolveDropLimit } from "@/lib/drop-feed-policy";
import { sortDropsByCanonicalSignalOrder } from "@/lib/signals/signal-contract";
import { isFreshPublicDrop, publicDropFreshnessWindow, isPublicDropFeedEligible, publicDropRarityTier, publicEvidenceStateCode, projectInventoryEvidenceFreshness } from "@/lib/public-drop-evidence";
import { ACTIVE_ENGINE_STATE_NAMES } from "@/lib/activeStates";
import { buildWeeklyMarketSummaries } from "@/lib/signals/signal-market-summary";
import { historicalDropFeedEnabled, scopedDropFeedHistoryEnabled, selectDropFeedHistory } from "@/lib/drop-feed-history";
import { readCachedPublicRetailerSubmissions } from "@/lib/retailer-public-submissions";
import dropFeedClassification from "@/data/drop-feed-classification.generated.json";
import { isVerifiedRetailerDrop, retailerFeedSnapshot, retailerSubmissionToFeedCard } from "@/lib/retailer-signal-feed";
import { californiaAreaMatchesFields, parseCaliforniaAreaQuery } from "@/lib/california-area";
import { nevadaAreaMatchesFields, parseNevadaAreaQuery } from "@/lib/nevada-area";
import { newYorkAreaMatchesFields, parseNewYorkAreaQuery, SUPPORTED_NEW_YORK_AREAS } from "@/lib/new-york-area";
import { coloradoAreaMatchesFields, parseColoradoAreaQuery, SUPPORTED_COLORADO_AREAS } from "@/lib/colorado-area";
import {
  demandMetroAreaMatchesFields,
  demandMetroBoardGroupMatchesFields,
  parseDemandMetroAreaQuery,
} from "@/lib/demand-metro-areas";
import { dropFeedStoreQueryMatches } from "@/lib/feed-area-options";
import {
  DROP_FEED_CLASSIFICATION_TIERS,
  getDropClassificationIndex,
  classifyPublicDrop,
  type DropClassificationBottle,
} from "@/lib/drop-classification";

const preparedDropCache = createPreparedDropCache<ReturnType<typeof normalizeDropForSite>[]>();

const ANONYMOUS_DROP_PREVIEW_LIMIT = 7;
const DROP_FEED_TIERS = new Set<string>(DROP_FEED_CLASSIFICATION_TIERS);
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const MAX_ENGINE_AGE_MS = 24 * HOUR_MS;
const FUTURE_CLOCK_SKEW_MS = 15 * 60 * 1000;


function dropRarityTier(drop: Record<string, unknown>) {
  const tier = publicDropRarityTier(drop);
  return tier === "highly_allocated" ? "unicorn" : tier;
}

function normalizedDropText(value: unknown) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}


function parseTierFilter(url: URL) {
  const raw = [url.searchParams.get("tier"), url.searchParams.get("tiers"), url.searchParams.get("rarity")]
    .filter(Boolean)
    .join(",");

  return new Set(
    raw
      .split(/[,|\s]+/)
      .map((tier) => tier.trim().toLowerCase())
      .map((tier) => tier === "highly_allocated" ? "unicorn" : tier)
      .filter((tier) => DROP_FEED_TIERS.has(tier))
  );
}


function includesNeedle(value: unknown, needle: string) {
  return typeof value === "string" && value.toLowerCase().includes(needle);
}

function arrayIncludesNeedle(value: unknown, needle: string) {
  return Array.isArray(value) && value.some((item) => includesNeedle(item, needle));
}

function isBoardLevelDrop(drop: Record<string, unknown>) {
  const precision = String(drop.location_precision ?? drop.locationPrecision ?? "").toLowerCase();
  const scope = String(drop.availability_scope ?? drop.availabilityScope ?? "").toLowerCase();
  return precision.includes("board") || scope === "board";
}

function engineRunTimestamp(statsPayload: Record<string, unknown> | null | undefined, exportGeneratedAt?: unknown) {
  const candidates = [statsPayload?.engineGeneratedAt, statsPayload?.generatedAt, exportGeneratedAt];
  const timestamp = candidates.find((value) => typeof value === "string" && value.trim());
  return typeof timestamp === "string" ? timestamp : "";
}

function asTime(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return Number.NaN;
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : Number.NaN;
}

function isFreshEnoughForPublicFeed(drop: Record<string, unknown>, now = Date.now()) {
  return isFreshPublicDrop(drop, now);
}

function isEligibleHistoricalPublicDrop(drop: Record<string, unknown>, now = Date.now()) {
  if (isVerifiedRetailerDrop(drop)) return false;
  const timestamp = dropFreshnessTime(drop);
  return Number.isFinite(timestamp) && timestamp <= now + FUTURE_CLOCK_SKEW_MS;
}

function degradedEngineStates(statsPayload: Record<string, unknown> | null | undefined) {
  const refreshHealth = statsPayload?.refreshHealth;
  if (!refreshHealth || typeof refreshHealth !== "object") return new Set<string>();
  const states = Array.isArray((refreshHealth as Record<string, unknown>).degradedStates)
    ? (refreshHealth as Record<string, unknown>).degradedStates as Array<Record<string, unknown>>
    : [];

  return new Set(
    states
      .filter((state) => {
        const status = String(state.status ?? "").toLowerCase();
        // stale_useful means the engine intentionally retained recent usable rows
        // from the prior successful state run. Do not turn that into a blank UI;
        // individual drop-age gates below still prevent old signals from looking fresh.
        return !status.startsWith("stale_useful") && !status.startsWith("partial_useful");
      })
      .map((state) => publicEvidenceStateCode(state.state))
      .filter(Boolean),
  );
}

function isEngineFresh(statsPayload: Record<string, unknown> | null | undefined, exportGeneratedAt?: unknown) {
  const timestamp = asTime(statsPayload?.engineGeneratedAt ?? statsPayload?.generatedAt ?? exportGeneratedAt);
  if (!Number.isFinite(timestamp)) return false;
  return Date.now() - timestamp <= MAX_ENGINE_AGE_MS;
}


async function publicRetailerSubmissions() {
  try {
    return await readCachedPublicRetailerSubmissions();
  } catch {
    return [];
  }
}

function normalizePublicFeedRow(drop: Record<string, unknown>, classificationIndex: ReturnType<typeof getDropClassificationIndex>) {
  const normalized = normalizeDropForSite(drop);
  return classifyPublicDrop(normalized, classificationIndex);
}

// Only immutable export rows and their generated classification enter the heavy
// shared caches. Keep all rows: current source ownership must be applied before
// eligibility, including an empty result or a veto of formerly positive stock.
async function preparePublicFeedBase() {
  const [dropResult, statsResult] = await readSiteExportResults(["drops", "stats"]);
  const exportPayload = dropResult.payload;
  const statsPayload = statsResult.payload;
  const classificationIndex = getDropClassificationIndex(dropFeedClassification.records as unknown as DropClassificationBottle[]);
  const preparationKey = JSON.stringify([dropResult.snapshotId || exportPayload?.generatedAt, classificationIndex.version]);
  const normalizedDrops = preparedDropCache.get(preparationKey, () => sortDropsByCanonicalSignalOrder(
    (Array.isArray(exportPayload?.drops) ? exportPayload.drops : []).map((drop) => normalizePublicFeedRow(drop as Record<string, unknown>, classificationIndex)),
  ));
  const degradedStates = degradedEngineStates(statsPayload);
  const eligible = normalizedDrops;
  const freshness = new Map(normalizedDrops.map(drop => [drop, publicDropFreshnessWindow(drop)]));
  return { dropResult, exportPayload, statsPayload, classificationIndex, normalizedDrops, eligible, degradedStates, freshness };
}

type PublicFeedBase = Awaited<ReturnType<typeof preparePublicFeedBase>>;
const readPackedPublicFeed = unstable_cache(async (_identity: string, _classification: string) => {
  const prepared = await preparePublicFeedBase();
  // No durable source projection, runtime policy, or retailer submission is
  // persisted here. Those are read after both shared cache layers on every GET.
  const { drops: _rawDrops, ...exportMetadata } = prepared.exportPayload || {};
  const metadata = {
    dropResult: { ...prepared.dropResult, payload: exportMetadata },
    exportPayload: exportMetadata, statsPayload: prepared.statsPayload,
    classificationIndex: { version: prepared.classificationIndex.version },
  };
  return packPublicFeed(prepared, metadata);
}, ['public-feed-immutable-base-v3', process.env.VERCEL_GIT_COMMIT_SHA || 'local'], { revalidate: 15 });
async function readSharedPublicPreparation(identity: string) {
  const classification = getDropClassificationIndex(dropFeedClassification.records as unknown as DropClassificationBottle[]).version;
  try {
    const packed = await readPackedPublicFeed(identity, classification);
    return { ...unpackPublicFeed<PublicFeedBase>(packed), packedBytes: Buffer.byteLength(packed) };
  } catch {
    // Cache failure may reread the immutable base; it cannot bypass the fresh
    // source composition that follows this function on every normal request.
    return { ...await preparePublicFeedBase(), packedBytes: 0 };
  }
}
const publicFeedSnapshotCache = createAsyncPreparedDropCache<Awaited<ReturnType<typeof readSharedPublicPreparation>>>();

async function preparePublicFeedSnapshot(base: PublicFeedBase) {
  const [sourceOverlay, retailerSubmissions] = await Promise.all([
    readRuntimeSourceDropOverlay(base.normalizedDrops, base.dropResult.snapshotId),
    publicRetailerSubmissions(),
  ]);
  const classificationIndex = getDropClassificationIndex(dropFeedClassification.records as unknown as DropClassificationBottle[]);
  const immutableRows = new Set<object>(base.normalizedDrops);
  const runtimeDrops = sourceOverlay.drops.map((drop: Record<string, unknown>) => immutableRows.has(drop)
    ? drop as typeof base.normalizedDrops[number]
    : normalizePublicFeedRow(drop, classificationIndex));
  const retailerDrops = retailerSubmissions
    .map((submission) => retailerSubmissionToFeedCard(submission, new Date()))
    .filter((drop): drop is NonNullable<typeof drop> => Boolean(drop))
    .map((drop) => normalizePublicFeedRow(drop as Record<string, unknown>, classificationIndex));
  const normalizedDrops = sortDropsByCanonicalSignalOrder([...runtimeDrops, ...retailerDrops]);
  const independentlyVerifiedIds = new Set(sourceOverlay.drops.filter((drop: Record<string, unknown>) => (drop.sourcePollId || drop.sourceLaneId)
    && drop.stale !== true && (drop.canAlertAsInventory === true || drop.canAlertAsWatch === true)).map((drop: Record<string, unknown>) => String(drop.id)));
  const eligible = normalizedDrops.filter(drop => isPublicDropFeedEligible(drop, {
    degradedStateCodes: independentlyVerifiedIds.has(String((drop as Record<string, unknown>).id)) ? undefined : base.degradedStates,
  }));
  const freshness = new Map(normalizedDrops.map(drop => [drop, publicDropFreshnessWindow(drop)]));
  return { ...base, sourceOverlay, classificationIndex, normalizedDrops, eligible, freshness,
    retailerVersion: retailerFeedSnapshot(retailerSubmissions), retailerCount: retailerSubmissions.length };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const verificationHeader = request.headers.get(ENGINE_FEED_VERIFICATION_HEADER);
  const pilotHeader=request.headers.get(PILOT_RECEIPT_HEADER);
  const isPilotReceipt=authorizePilotReceipt(url,pilotHeader,process.env.ENGINE_SNAPSHOT_ENCRYPTION_KEY || '');
  const isCountVerification = authorizeEngineFeedVerification(url, verificationHeader, process.env.ENGINE_SNAPSHOT_ENCRYPTION_KEY || "");
  if ((verificationHeader && !isCountVerification) || ((pilotHeader || url.searchParams.has('source_receipt')) && !isPilotReceipt)) return NextResponse.json({ error: "Unauthorized engine verification." }, { status: 401, headers: { "Cache-Control": "private, no-store" } });
  const isEngineVerification=isCountVerification || isPilotReceipt;
  const { userId } = isEngineVerification ? { userId: null } : await auth();
  const isSignedIn = Boolean(userId) || isEngineVerification;
  const user = userId ? await (await clerkClient()).users.getUser(userId) : null;
  const entitlements = isEngineVerification ? getEntitlements("standard") : await getServerEntitlements(user?.publicMetadata || null);
  const isFreeAccess = !isSignedIn || entitlements.tier === "free";
  if (isFreeAccess && ["state", "tier", "tiers", "rarity", "area", "store", "search", "bottle", "since", "board", "city", "county"].some(key => url.searchParams.getAll(key).some(value => value.trim()))) {
    return NextResponse.json({ error: "Feed filters require a paid membership." }, { status: 403 });
  }
  const previewLimit = entitlements.feedPreviewLimit ?? ANONYMOUS_DROP_PREVIEW_LIMIT;
  const requestedSignalId = String(url.searchParams.get("signalId") || "").slice(0, 240);
  // A Free detail lookup can resolve only a card from the same global preview.
  const limit = isFreeAccess && requestedSignalId ? previewLimit : resolveDropLimit(url.searchParams.get("limit"), isFreeAccess, previewLimit);
  const offset = isFreeAccess ? 0 : Math.max(0, Number(url.searchParams.get("offset") ?? "0") || 0);
  const requestedCursor = isFreeAccess ? null : url.searchParams.get("cursor");
  const requestedSignalSource = String(url.searchParams.get("signalSource") || "");
  const canonicalSignalOrder = url.searchParams.get("signalOrder") === "canonical";
  if (requestedSignalId && !/^[A-Za-z0-9._:-]{1,240}$/.test(requestedSignalId)) {
    return NextResponse.json({ drops: [], error: "Invalid signalId" }, { status: 400 });
  }
  if (requestedSignalSource && !["retailer", "trusted_source", "release_source"].includes(requestedSignalSource)) {
    return NextResponse.json({ drops: [], error: "Invalid signalSource" }, { status: 400 });
  }
  if (requestedCursor && !decodeDropCursor(requestedCursor)) {
    return NextResponse.json(
      { drops: [], total: 0, limit, offset: 0, hasMore: false, nextCursor: null, error: "Invalid cursor" },
      { status: 400, headers: { "Cache-Control": "private, no-store", Vary: "Cookie, Authorization" } },
    );
  }
  // Free previews remain global. Paid state selection filters before pagination.
  const state = normalizeStateCodeParam(url.searchParams.get("state"));
  const search = !entitlements.canUseBottleSearch ? undefined : url.searchParams.get("search")?.replace(/\s+/g, " ").trim();
  if (search && (search.length > 100 || /[\u0000-\u001F\u007F]/.test(search))) return NextResponse.json({ error: "Invalid feed search" }, { status: 400 });
  const bottle = !entitlements.canUseBottleSearch ? undefined : url.searchParams.get("bottle")?.toLowerCase().trim();
  const store = !entitlements.canUseDropFeedFilters ? undefined : url.searchParams.get("store")?.toLowerCase().trim();
  const areaQuery = url.searchParams.get("area");
  const californiaArea = parseCaliforniaAreaQuery(areaQuery);
  const nevadaArea = parseNevadaAreaQuery(areaQuery);
  const nyAreas = parseNewYorkAreaQuery(areaQuery);
  const coAreas = parseColoradoAreaQuery(areaQuery);
  const demandMetroAreas = parseDemandMetroAreaQuery(state || "", areaQuery);
  if (state === "CA" && californiaArea.requested && !californiaArea.valid) {
    return NextResponse.json({ drops: [], total: 0, error: "Unsupported California area" }, { status: 400 });
  }
  if (state === "NV" && nevadaArea.requested && !nevadaArea.valid) {
    return NextResponse.json({ drops: [], total: 0, error: "Unsupported Nevada area" }, { status: 400 });
  }
  if (state === "NY" && nyAreas.requested && !nyAreas.valid) {
    return NextResponse.json({ drops: [], total: 0, error: "Unsupported New York area" }, { status: 400 });
  }
  if (state === "CO" && coAreas.requested && !coAreas.valid) {
    return NextResponse.json({ drops: [], total: 0, error: "Unsupported Colorado area" }, { status: 400 });
  }
  if (["NC", "GA", "TN"].includes(state || "") && demandMetroAreas.requested && !demandMetroAreas.valid) {
    return NextResponse.json({ drops: [], total: 0, error: `Unsupported ${state} metro area` }, { status: 400 });
  }
  const appliedAreaFilter = Boolean(
    areaQuery?.trim()
    && (
      (state === "CA" && californiaArea.areas.length > 0)
      || (state === "NV" && nevadaArea.areas.length > 0)
      || (state === "NY" && nyAreas.areas.length > 0)
      || (state === "CO" && coAreas.areas.length > 0)
      || (["NC", "GA", "TN"].includes(state || "") && demandMetroAreas.areas.length > 0)
    )
  );
  const include = entitlements.canUseAdvancedFilters ? url.searchParams.get("include")?.toLowerCase().trim() : undefined;

  const tierFilter = parseTierFilter(url);
  const rawSince = url.searchParams.get("since");
  const since = rawSince ? Date.parse(rawSince) : Number.NaN;
  if (rawSince && !Number.isFinite(since)) {
    return NextResponse.json({ drops: [], total: 0, error: "Invalid since timestamp" }, { status: 400 });
  }
  const scopedFilterHistory = scopedDropFeedHistoryEnabled({
    state,
    area: appliedAreaFilter ? areaQuery : undefined,
    store,
    bottle,
    search,
  });
  const historicalMode = historicalDropFeedEnabled({
    requested: url.searchParams.get("history") === "1",
    isSignedIn,
    canUseAdvancedFilters: entitlements.canUseAdvancedFilters,
    tierCount: tierFilter.size,
  }) || scopedFilterHistory || canonicalSignalOrder;

  try {
    const preparationStart = performance.now();
    const identity = await readSiteExportIdentity();
    const prepared = include === "all" && !historicalMode
      ? { value: { ...await preparePublicFeedBase(), packedBytes: 0 }, hit: false }
      : await publicFeedSnapshotCache.get(identity, () => readSharedPublicPreparation(identity));
    const { dropResult, retailerVersion, exportPayload, statsPayload, sourceOverlay, classificationIndex, normalizedDrops, eligible, degradedStates, freshness } = await preparePublicFeedSnapshot(prepared.value);
    const preparationMs = performance.now() - preparationStart;
    const filterStart = performance.now();
    let drops = [...normalizedDrops];
    const marketSummaries = isFreeAccess ? buildWeeklyMarketSummaries(
      eligible as Array<Record<string, unknown>>,
      { stateLabels: ACTIVE_ENGINE_STATE_NAMES },
    ) : [];
    const engineFresh = isEngineFresh(statsPayload, exportPayload?.generatedAt);
    // The normal customer feed must never retry around the same degraded-state
    // gate used by Coverage; otherwise it can display rows Coverage rejects.
    const degradedStateFallback = false;

    const requestTime = Date.now();
    const isFreshPreparedDrop = (drop: typeof drops[number]) => {
      const window = freshness.get(drop)!;
      return requestTime >= window.startsAt && (window.inclusiveEnd ? requestTime <= window.endsAt : requestTime < window.endsAt);
    };
    const applyPublicDropFilters = (items: typeof drops, options: { filterDegradedStates: boolean }) => {
      let filtered = [...items];
      // Do not blank the customer feed solely because the aggregate engine timestamp
      // crossed 24 hours. Every row is still checked against its stricter type-specific
      // freshness window below, so recent inventory survives while expired rows fail closed.
      // This is deliberately shared with Coverage. The normal default feed is
      // the only evidence pool allowed to establish current customer depth.
      filtered = [...eligible];
      filtered = selectDropFeedHistory(
        filtered,
        historicalMode,
        isFreshPreparedDrop,
        (drop) => isEligibleHistoricalPublicDrop(drop),
        false,
      );
      return filtered;
    };

    const applyRequestedAreaFilter = (items: typeof drops) => {
      if (["NC", "GA", "TN"].includes(state || "") && demandMetroAreas.areas.length) {
        return items.filter((drop) => {
          const fields = [
            drop.store_city,
            drop.store_address,
            drop.store_name,
            drop.store_county,
            drop.board_name,
            drop.display_location,
            (drop as Record<string, unknown>).locationName,
            (drop as Record<string, unknown>).area,
          ];
          return state === "NC"
            ? demandMetroBoardGroupMatchesFields(fields, demandMetroAreas.areas)
            : demandMetroAreaMatchesFields(state || "", fields, demandMetroAreas.areas);
        });
      }
      if (state === "CA" && californiaArea.areas.length) {
        return items.filter((drop) => californiaAreaMatchesFields([
          drop.store_city,
          drop.store_address,
          drop.store_name,
          drop.store_county,
          drop.board_name,
          drop.display_location,
          (drop as Record<string, unknown>).locationName,
        ], californiaArea.areas));
      }
      if (state === "NV" && nevadaArea.areas.length) {
        return items.filter((drop) => nevadaAreaMatchesFields([
          drop.store_city,
          drop.store_address,
          drop.store_name,
          drop.store_county,
          drop.board_name,
          drop.display_location,
          (drop as Record<string, unknown>).locationName,
        ], nevadaArea.areas));
      }
      if (state === "NY") {
        return items.filter((drop) => newYorkAreaMatchesFields([
          drop.store_city,
          drop.store_address,
          drop.store_name,
          drop.store_county,
          drop.board_name,
          drop.display_location,
          (drop as Record<string, unknown>).locationName,
        ], nyAreas.areas.length ? nyAreas.areas : SUPPORTED_NEW_YORK_AREAS));
      }
      if (state === "CO") {
        return items.filter((drop) => coloradoAreaMatchesFields([
          drop.store_city,
          drop.store_address,
          drop.store_name,
          drop.store_county,
          drop.board_name,
          drop.display_location,
          (drop as Record<string, unknown>).locationName,
        ], coAreas.areas.length ? coAreas.areas : SUPPORTED_COLORADO_AREAS));
      }
      return items;
    };

    if (include !== "all" || historicalMode) {
      drops = applyPublicDropFilters(drops, { filterDegradedStates: true });
    }
    if (requestedSignalId && !isFreeAccess) {
      drops = drops.filter((drop) => {
        const record = drop as unknown as Record<string, unknown>;
        const storedId = String(record.id ?? record.eventId ?? record.canonical_id ?? record.canonicalId ?? "");
        return storedId === requestedSignalId || Boolean(requestedSignalSource && storedId === `${requestedSignalSource}:${requestedSignalId}`);
      });
    }

    if (state) {
      drops = drops.filter((drop) => String(drop.state ?? drop.state_code ?? "").toUpperCase() === state);
    }
    if (Number.isFinite(since)) {
      drops = drops.filter((drop) => Date.parse(dropDisplayTime(drop)) >= since);
    }
    drops = applyRequestedAreaFilter(drops);

    if (tierFilter.size > 0) {
      drops = drops.filter((drop) => tierFilter.has(dropRarityTier(drop)));
    }


    if (search) drops = drops.filter((drop) => dropFeedSearchMatches(drop as Record<string, unknown>, search));

    if (bottle) {
      drops = drops.filter(
        (drop) =>
          includesNeedle(drop.brand_name, bottle) ||
          includesNeedle(drop.tracked_brand_name, bottle) ||
          includesNeedle(drop.canonical_name, bottle) ||
          includesNeedle(drop.raw_name, bottle) ||
          includesNeedle(drop.bottle_id, bottle) ||
          includesNeedle(drop.canonical_id, bottle) ||
          arrayIncludesNeedle(drop.aliases, bottle)
      );
    }

    if (store) {
      drops = drops.filter((drop) => {
        const record = drop as Record<string, unknown>;
        return dropFeedStoreQueryMatches({
          state,
          query: store,
          isBoardLevel: isBoardLevelDrop(record),
          fields: [
            record.locationName,
            drop.store_name,
            drop.store_address,
            drop.store_city,
            drop.store_county,
            drop.board_name,
            drop.display_location,
            record.county,
          ],
        });
      });
    }

    drops = canonicalSignalOrder
      ? drops
      : drops.sort(compareDropFeedNewestFirst);

    const total = drops.length;
    const engineSnapshot = `${String(dropResult.snapshotId || exportPayload?.generatedAt || engineRunTimestamp(statsPayload, exportPayload?.generatedAt))}:source:${sourceOverlay.version}`;
    const snapshot = `${engineSnapshot}:classification:${classificationIndex.version}:retailer:${retailerVersion}:history:${historicalMode ? 1 : 0}:signalOrder:${canonicalSignalOrder ? 1 : 0}:listingOrder:1`;
    if(isPilotReceipt) return NextResponse.json(
      pilotReceiptPayload('feed',url.searchParams.get('source_receipt') || '',drops,engineSnapshot),
      {headers:{'Cache-Control':'private, no-store',Vary:'Cookie, Authorization, X-Bourbon-Signal-Pilot-Verification'}},
    );
    // The worker sees only aggregate counts from the normal member feed pipeline.
    // Its signed scope cannot request cards, other filters, detail, or history.
    if (isEngineVerification) return NextResponse.json(
      engineFeedCountPayload(state || "", total, snapshot, engineRunTimestamp(statsPayload, exportPayload?.generatedAt)),
      { headers: { "Cache-Control": "private, no-store", Vary: "Cookie, Authorization, X-Bourbon-Signal-Engine-Verification", "X-API-Source": dropResult.source, "X-Engine-Snapshot": dropResult.snapshotId || "" } },
    );
    const page = paginateDrops(drops, { limit, offset, cursor: requestedCursor, snapshot });
    const pagedDrops = (historicalMode
      ? selectDropFeedHistory(page.items, true, isFreshPreparedDrop, (drop) => isEligibleHistoricalPublicDrop(drop))
      : page.items).map(drop => projectInventoryEvidenceFreshness(drop, requestTime));

    return NextResponse.json(
      {
        ...exportPayload,
        drops: pagedDrops,
        total,
        limit,
        offset: page.offset,
        cursor: requestedCursor,
        nextCursor: isFreeAccess ? null : page.nextCursor,
        snapshot,
        hasMore: !isFreeAccess && page.hasMore,
        marketSummaries,
        previewLocked: isFreeAccess && total > pagedDrops.length,
        requiresAccountForFullFeed: isFreeAccess,
        marketDetailsLocked: false,
        lastUpdated: engineRunTimestamp(statsPayload, exportPayload?.generatedAt),
        engineFresh,
        degradedStatesFiltered: Array.from(degradedStates),
        degradedStateFallback,
        historicalMode,
      },
      {
        headers: {
          ...siteExportHeaders(dropResult.source, dropResult.snapshotId),
          // Normal requests must execute the current source veto. Only the
          // immutable base preparation is shared, never the composed response.
          "Cache-Control": "private, no-store",
          Vary: "Cookie, Authorization",
          "X-Public-Feed-Cache-Bytes": String(prepared.value.packedBytes),
          "Server-Timing": `prepare;dur=${preparationMs.toFixed(1)};desc="${prepared.hit ? "cache" : "build"}", filter;dur=${(performance.now() - filterStart).toFixed(1)}`,
          "X-Drops-Source": dropResult.source,
          "X-Drops-Snapshot": snapshot,
        },
      }
    );
  } catch (err) {
    if (err instanceof DropCursorSnapshotError) {
      return NextResponse.json(
        { drops: [], total: 0, limit, offset: 0, hasMore: false, nextCursor: null, resetCursor: true, error: err.message },
        { status: 409, headers: { "Cache-Control": "private, no-store", Vary: "Cookie, Authorization" } },
      );
    }
    console.error("[api/drops] Error reading site export:", err);

    return NextResponse.json(
      {
        drops: [],
        total: 0,
        limit,
        offset,
        hasMore: false,
        nextCursor: null,
        lastUpdated: "",
        engineFresh: false,
        degradedStatesFiltered: [],
        error: "Engine export temporarily unavailable",

      },
      {
        status: 503,
        headers: {
          ...siteExportHeaders("empty-fallback"),
          "Cache-Control": "private, no-store",
          Vary: "Cookie, Authorization",
          "X-Drops-Source": "empty-fallback",
        },
      }
    );
  }
}
