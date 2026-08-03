import { getEntitlements } from "@/lib/entitlements";
import { NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { normalizeDropForSite, readSiteExportResults, siteExportHeaders } from "@/lib/site-engine-contract";
import { normalizeStateCodeParam } from "@/lib/location-normalization";
import { decodeDropCursor, DropCursorSnapshotError, paginateDrops } from "@/lib/drop-cursor";
import { dropFeedCacheHeaders } from "@/lib/api-cache-contract";
import { dropFreshnessTime, resolveDropLimit } from "@/lib/drop-feed-policy";
import { isFreshPublicDrop, isPublicDropFeedEligible, publicDropRarityTier, publicEvidenceStateCode } from "@/lib/public-drop-evidence";
import { historicalDropFeedEnabled, scopedDropFeedHistoryEnabled, selectDropFeedHistory } from "@/lib/drop-feed-history";
import { readCachedPublicRetailerSubmissions } from "@/lib/retailer-public-submissions";
import dropFeedClassification from "@/data/drop-feed-classification.generated.json";
import { isVerifiedRetailerDrop, retailerFeedSnapshot, retailerSubmissionToFeedCard } from "@/lib/retailer-signal-feed";
import { californiaAreaMatchesFields, parseCaliforniaAreaQuery } from "@/lib/california-area";
import { nevadaAreaMatchesFields, parseNevadaAreaQuery } from "@/lib/nevada-area";
import { newYorkAreaMatchesFields, parseNewYorkAreaQuery, SUPPORTED_NEW_YORK_AREAS } from "@/lib/new-york-area";
import { coloradoAreaMatchesFields, parseColoradoAreaQuery } from "@/lib/colorado-area";
import {
  demandMetroAreaMatchesFields,
  demandMetroBoardGroupMatchesFields,
  parseDemandMetroAreaQuery,
} from "@/lib/demand-metro-areas";
import { dropFeedStoreQueryMatches } from "@/lib/feed-area-options";
import {
  DROP_FEED_CLASSIFICATION_TIERS,
  getDropClassificationIndex,
  resolveDropClassification,
  type DropClassificationBottle,
} from "@/lib/drop-classification";

const ANONYMOUS_DROP_PREVIEW_LIMIT = 7;
const DROP_FEED_TIERS = new Set<string>(DROP_FEED_CLASSIFICATION_TIERS);
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const MAX_ENGINE_AGE_MS = 24 * HOUR_MS;
const FUTURE_CLOCK_SKEW_MS = 15 * 60 * 1000;


function dropRarityTier(drop: Record<string, unknown>) {
  return publicDropRarityTier(drop);
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
        return !status.startsWith("stale_useful");
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

function dropDiversityKey(drop: Record<string, unknown>) {
  // Bottle IDs can diverge across retailer/source-specific records for the same
  // customer-visible bottle. The broad feed should diversify by what the member
  // sees first: bottle name, then IDs only as a fallback.
  return normalizedDropText(
    drop.brand_name ??
    drop.tracked_brand_name ??
    drop.canonical_name ??
    drop.raw_name ??
    drop.canonical_id ??
    drop.bottle_id
  ) || String(drop.id ?? drop.timestamp ?? "unknown-drop");
}

function diversifyDrops<T extends Record<string, unknown>>(drops: T[]) {
  const groups = new Map<string, T[]>();
  for (const drop of drops) {
    const key = dropDiversityKey(drop);
    const group = groups.get(key);
    if (group) group.push(drop);
    else groups.set(key, [drop]);
  }

  const orderedGroups = Array.from(groups.values())
    .sort((a, b) => {
      const aTimestamp = +new Date(String(a[0]?.timestamp ?? ""));
      const bTimestamp = +new Date(String(b[0]?.timestamp ?? ""));
      return (Number.isFinite(bTimestamp) ? bTimestamp : 0) - (Number.isFinite(aTimestamp) ? aTimestamp : 0);
    });

  const diversified: T[] = [];
  let index = 0;
  while (diversified.length < drops.length) {
    let added = false;
    for (const group of orderedGroups) {
      if (group[index]) {
        diversified.push(group[index]);
        added = true;
      }
    }
    if (!added) break;
    index += 1;
  }
  return diversified;
}

async function publicRetailerSubmissions() {
  try {
    return await readCachedPublicRetailerSubmissions();
  } catch {
    return [];
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const { userId } = await auth();
  const isSignedIn = Boolean(userId);
  const user = userId ? await (await clerkClient()).users.getUser(userId) : null;
  const entitlements = getEntitlements(user?.publicMetadata || null);
  const isFreeAccess = !isSignedIn || entitlements.tier === "free";
  const previewLimit = entitlements.feedPreviewLimit ?? ANONYMOUS_DROP_PREVIEW_LIMIT;
  const limit = resolveDropLimit(url.searchParams.get("limit"), isFreeAccess, previewLimit);
  const offset = isFreeAccess ? 0 : Math.max(0, Number(url.searchParams.get("offset") ?? "0") || 0);
  const requestedCursor = isFreeAccess ? null : url.searchParams.get("cursor");
  if (requestedCursor && !decodeDropCursor(requestedCursor)) {
    return NextResponse.json(
      { drops: [], total: 0, limit, offset: 0, hasMore: false, nextCursor: null, error: "Invalid cursor" },
      { status: 400, headers: { "Cache-Control": "private, no-store", Vary: "Cookie, Authorization" } },
    );
  }
  // State selection is a browsing/acquisition control, not a paid-only advanced filter.
  // Free and signed-out users still receive the capped preview, but the preview must
  // come from the requested market; otherwise a saved/selected NC lens can look
  // completely blank even when the engine has current or historical NC signals.
  const state = normalizeStateCodeParam(url.searchParams.get("state"));
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
  const scopedFilterHistory = scopedDropFeedHistoryEnabled({
    state,
    area: appliedAreaFilter ? areaQuery : undefined,
    store,
    bottle,
  });
  const historicalMode = historicalDropFeedEnabled({
    requested: url.searchParams.get("history") === "1",
    isSignedIn,
    canUseAdvancedFilters: entitlements.canUseAdvancedFilters,
    tierCount: tierFilter.size,
  }) || scopedFilterHistory;

  try {
    const [[dropResult, statsResult], retailerSubmissions] = await Promise.all([
      readSiteExportResults(["drops", "stats"]),
      publicRetailerSubmissions(),
    ]);
    const exportPayload = dropResult.payload;
    const statsPayload = statsResult.payload;
    const rawDrops = Array.isArray(exportPayload?.drops) ? exportPayload.drops : [];
    const retailerDrops = retailerSubmissions
      .map((submission) => retailerSubmissionToFeedCard(submission, new Date()))
      .filter((drop): drop is NonNullable<typeof drop> => Boolean(drop));
    const classificationIndex = getDropClassificationIndex(dropFeedClassification.records as unknown as DropClassificationBottle[]);
    const normalizedDrops = [...rawDrops, ...retailerDrops]
      .map((drop) => normalizeDropForSite(drop as Record<string, unknown>))
      .map((drop) => {
        const classification = resolveDropClassification(drop, classificationIndex);
        return {
          ...drop,
          tier: classification.tier,
          rarity_tier: classification.tier,
          classification_source: classification.source,
          classification_state: classification.state,
          classification_bottle_id: classification.bottleId,
          national_tier: classification.nationalTier,
        };
      });
    let drops = [...normalizedDrops];
    const degradedStates = degradedEngineStates(statsPayload);
    const engineFresh = isEngineFresh(statsPayload, exportPayload?.generatedAt);
    // The normal customer feed must never retry around the same degraded-state
    // gate used by Coverage; otherwise it can display rows Coverage rejects.
    const degradedStateFallback = false;

    const applyPublicDropFilters = (items: typeof drops, options: { filterDegradedStates: boolean }) => {
      let filtered = [...items];
      // Do not blank the customer feed solely because the aggregate engine timestamp
      // crossed 24 hours. Every row is still checked against its stricter type-specific
      // freshness window below, so recent inventory survives while expired rows fail closed.
      // This is deliberately shared with Coverage. The normal default feed is
      // the only evidence pool allowed to establish current customer depth.
      filtered = filtered.filter((drop) => isPublicDropFeedEligible(drop, {
        degradedStateCodes: options.filterDegradedStates ? degradedStates : undefined,
      }));
      filtered = selectDropFeedHistory(
        filtered,
        historicalMode,
        (drop) => isFreshEnoughForPublicFeed(drop),
        (drop) => isEligibleHistoricalPublicDrop(drop),
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
        ], coAreas.areas.length ? coAreas.areas : ["Denver Metro"]));
      }
      return items;
    };

    if (include !== "all" || historicalMode) {
      drops = applyPublicDropFilters(drops, { filterDegradedStates: true });
    }

    if (state) {
      drops = drops.filter((drop) => String(drop.state ?? drop.state_code ?? "").toUpperCase() === state);
    }
    drops = applyRequestedAreaFilter(drops);

    if (tierFilter.size > 0) {
      drops = drops.filter((drop) => tierFilter.has(dropRarityTier(drop)));
    }


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
            drop.store_name,
            drop.store_address,
            drop.store_city,
            drop.store_county,
            drop.board_name,
            drop.display_location,
            record.locationName,
            record.county,
          ],
        });
      });
    }

    drops.sort((a, b) => {
      const aState = String(a.state ?? a.state_code ?? "").toUpperCase();
      const bState = String(b.state ?? b.state_code ?? "").toUpperCase();
      if (aState === "PA" && bState === "PA" && Boolean(b.exact_store) !== Boolean(a.exact_store)) {
        return Boolean(b.exact_store) ? 1 : -1;
      }
      const timeDelta = +new Date(String(b.timestamp)) - +new Date(String(a.timestamp));
      if (timeDelta) return timeDelta;
      if (Boolean(b.exact_store) !== Boolean(a.exact_store)) return Boolean(b.exact_store) ? 1 : -1;
      return Number(b.quantity_in_stock || 0) - Number(a.quantity_in_stock || 0);
    });

    const total = drops.length;
    const shouldDiversify = !bottle && !store;
    const displayDrops = shouldDiversify ? diversifyDrops(drops as Record<string, unknown>[]) : drops;
    const engineSnapshot = String(dropResult.snapshotId || exportPayload?.generatedAt || engineRunTimestamp(statsPayload, exportPayload?.generatedAt));
    const snapshot = `${engineSnapshot}:classification:${classificationIndex.version}:retailer:${retailerFeedSnapshot(retailerSubmissions)}:history:${historicalMode ? 1 : 0}`;
    const page = paginateDrops(displayDrops, { limit, offset, cursor: requestedCursor, snapshot });
    const pagedDrops = page.items;

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
        previewLocked: isFreeAccess && total > pagedDrops.length,
        requiresAccountForFullFeed: isFreeAccess,
        lastUpdated: engineRunTimestamp(statsPayload, exportPayload?.generatedAt),
        engineFresh,
        degradedStatesFiltered: Array.from(degradedStates),
        degradedStateFallback,
        historicalMode,
      },
      {
        headers: {
          ...siteExportHeaders(dropResult.source, dropResult.snapshotId),
          ...(retailerSubmissions.length > 0 && !isSignedIn
            ? { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=30", Vary: "Cookie, Authorization" }
            : dropFeedCacheHeaders(isSignedIn)),
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
