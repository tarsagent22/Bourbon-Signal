import { getEntitlements } from "@/lib/entitlements";
import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { isUserFacingDropSignal, normalizeDropForSite, readSiteExportResults, siteExportHeaders } from "@/lib/site-engine-contract";
import { normalizeStateCodeParam } from "@/lib/location-normalization";
import { decodeDropCursor, DropCursorSnapshotError, paginateDrops } from "@/lib/drop-cursor";
import { dropFeedCacheHeaders } from "@/lib/api-cache-contract";
import { dropFreshnessTime, resolveDropLimit } from "@/lib/drop-feed-policy";
import { historicalDropFeedEnabled, selectDropFeedHistory } from "@/lib/drop-feed-history";
import { getRetailerRepository } from "@/lib/retailer-repository";
import { getBourbonBible } from "@/lib/bourbonBible";
import { isVerifiedRetailerDrop, retailerFeedSnapshot, retailerSubmissionToFeedCard, type RetailerFeedTier } from "@/lib/retailer-signal-feed";
import { californiaAreaMatchesFields, parseCaliforniaAreaQuery } from "@/lib/california-area";
import { nevadaAreaMatchesFields, parseNevadaAreaQuery } from "@/lib/nevada-area";
import { newYorkAreaMatchesFields, parseNewYorkAreaQuery } from "@/lib/new-york-area";
import { coloradoAreaMatchesFields, parseColoradoAreaQuery } from "@/lib/colorado-area";
import {
  demandMetroAreaMatchesFields,
  demandMetroBoardGroupMatchesFields,
  parseDemandMetroAreaQuery,
} from "@/lib/demand-metro-areas";
import { dropFeedStoreQueryMatches } from "@/lib/feed-area-options";

const ANONYMOUS_DROP_PREVIEW_LIMIT = 7;
const DROP_FEED_TIERS = new Set(["unicorn", "allocated", "limited"]);
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const MAX_ENGINE_AGE_MS = 24 * HOUR_MS;
const MAX_INVENTORY_DROP_AGE_MS = 72 * HOUR_MS;
const MAX_OH_STALE_FEED_AGE_MS = 14 * DAY_MS;
const MAX_DELIVERY_DROP_AGE_MS = 14 * DAY_MS;
const MAX_CONTEXT_DROP_AGE_MS = 30 * DAY_MS;
const FUTURE_CLOCK_SKEW_MS = 15 * 60 * 1000;

function retailerTierForAvailability(availability: string | undefined): RetailerFeedTier {
  if (availability === "highly_allocated") return "unicorn";
  if (availability === "allocated") return "allocated";
  if (availability === "limited" || availability === "regional" || availability === "seasonal") return "limited";
  if (availability === "common") return "standard";
  return "unknown";
}

function dropRarityTier(drop: Record<string, unknown>) {
  return String(drop.rarity_tier ?? drop.tier ?? "").toLowerCase();
}

function normalizedDropText(value: unknown) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isKnownFalseRareMatch(drop: Record<string, unknown>) {
  const raw = normalizedDropText(drop.rawName ?? drop.raw_name ?? drop.bottleName ?? drop.brand_name ?? drop.canonicalName);
  if (/\bfour roses\b/.test(raw) && /\b(small batch|small batch select|single barrel)\b/.test(raw)) {
    const hasRareModifier = /\b(limited edition|limited release|le|barrel strength|cask strength|private selection|private barrel|single barrel select|oes[foqkv]|obs[foqkv])\b/.test(raw);
    if (!hasRareModifier) return true;
  }
  return false;
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

function isDropFeedRarity(drop: Record<string, unknown>) {
  return isVerifiedRetailerDrop(drop) || (DROP_FEED_TIERS.has(dropRarityTier(drop)) && !isKnownFalseRareMatch(drop));
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

function maxAgeForDrop(drop: Record<string, unknown>) {
  const type = String(drop.event_type ?? drop.type ?? "").toLowerCase();
  const category = String(drop.signal_category ?? drop.signalCategory ?? "").toLowerCase();
  const scope = String(drop.availability_scope ?? drop.availabilityScope ?? "").toLowerCase();
  const precision = String(drop.location_precision ?? drop.locationPrecision ?? "").toLowerCase();
  const canAlert = drop.can_alert_as_inventory === true || drop.canAlertAsInventory === true;

  if (String(drop.state ?? "").toUpperCase() === "OH" && drop.sourceStale === true) {
    return MAX_OH_STALE_FEED_AGE_MS;
  }
  if (canAlert || category === "inventory" || scope === "store_reported" || precision === "store_level" || type.includes("in_stock") || type.includes("inventory_result")) {
    return MAX_INVENTORY_DROP_AGE_MS;
  }
  if (category === "delivery" || type.includes("shipment") || type.includes("delivery") || type.includes("allocation_snapshot")) {
    return MAX_DELIVERY_DROP_AGE_MS;
  }
  return MAX_CONTEXT_DROP_AGE_MS;
}

function isFreshEnoughForPublicFeed(drop: Record<string, unknown>, now = Date.now()) {
  if (isVerifiedRetailerDrop(drop)) {
    const expiresAt = Date.parse(String(drop.expiresAt ?? ""));
    if (drop.retailerSignalState === "upcoming") {
      const eventAt = Date.parse(String(drop.eventDate ?? drop.startsAt ?? drop.expiresAt ?? ""));
      return Number.isFinite(eventAt) && eventAt > now;
    }
    if (drop.retailerSignalState === "live") return Number.isFinite(expiresAt) && expiresAt > now;
  }
  const timestamp = dropFreshnessTime(drop);
  if (!Number.isFinite(timestamp)) return false;
  if (timestamp > now + FUTURE_CLOCK_SKEW_MS) return false;
  return now - timestamp <= maxAgeForDrop(drop);
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
      .map((state) => String(state.state ?? "").toUpperCase())
      .filter(Boolean)
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

const readCachedPublicRetailerSubmissions = unstable_cache(
  async () => getRetailerRepository().listPublicSubmissions({ ensureSchema: false }),
  ["public-retailer-submissions-v2"],
  { revalidate: 15 },
);

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
  const californiaArea = parseCaliforniaAreaQuery(url.searchParams.get("area"));
  const nevadaArea = parseNevadaAreaQuery(url.searchParams.get("area"));
  const nyAreas = parseNewYorkAreaQuery(url.searchParams.get("area"));
  const coAreas = parseColoradoAreaQuery(url.searchParams.get("area"));
  const demandMetroAreas = parseDemandMetroAreaQuery(state || "", url.searchParams.get("area"));
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
  const include = entitlements.canUseAdvancedFilters ? url.searchParams.get("include")?.toLowerCase().trim() : undefined;

  const tierFilter = parseTierFilter(url);
  const historicalMode = historicalDropFeedEnabled({
    requested: url.searchParams.get("history") === "1",
    isSignedIn,
    canUseAdvancedFilters: entitlements.canUseAdvancedFilters,
    tierCount: tierFilter.size,
  }) || Boolean(state);

  try {
    const [[dropResult, statsResult], retailerSubmissions] = await Promise.all([
      readSiteExportResults(["drops", "stats"]),
      publicRetailerSubmissions(),
    ]);
    const bourbonBible = retailerSubmissions.length > 0 ? await getBourbonBible() : [];
    const exportPayload = dropResult.payload;
    const statsPayload = statsResult.payload;
    const rawDrops = Array.isArray(exportPayload?.drops) ? exportPayload.drops : [];
    const bibleById = new Map(bourbonBible.map((bottle) => [bottle.id, bottle]));
    const bibleByName = new Map(bourbonBible.map((bottle) => [normalizedDropText(bottle.canonicalName), bottle]));
    const retailerDrops = retailerSubmissions
      .map((submission) => {
        const bottle = (submission.bottleId ? bibleById.get(submission.bottleId) : undefined) || bibleByName.get(normalizedDropText(submission.title));
        return retailerSubmissionToFeedCard(submission, new Date(), retailerTierForAvailability(bottle?.availability));
      })
      .filter((drop): drop is NonNullable<typeof drop> => Boolean(drop));
    const normalizedDrops = [...rawDrops, ...retailerDrops].map((drop) => normalizeDropForSite(drop as Record<string, unknown>));
    let drops = [...normalizedDrops];
    const degradedStates = degradedEngineStates(statsPayload);
    const engineFresh = isEngineFresh(statsPayload, exportPayload?.generatedAt);
    let degradedStateFallback = false;

    const isBlockedWarehouseDrop = (drop: Record<string, unknown>) => {
      const dropState = String(drop.state ?? drop.state_code ?? "").toUpperCase();
      const eventType = String(drop.event_type ?? "");
      const scope = String(drop.availability_scope ?? "");
      return dropState === "NC" && (eventType === "nc_statewide_warehouse_stock" || scope === "warehouse");
    };

    const applyPublicDropFilters = (items: typeof drops, options: { filterDegradedStates: boolean }) => {
      let filtered = [...items];
      // Do not blank the customer feed solely because the aggregate engine timestamp
      // crossed 24 hours. Every row is still checked against its stricter type-specific
      // freshness window below, so recent inventory survives while expired rows fail closed.
      filtered = filtered.filter((drop) => isVerifiedRetailerDrop(drop as Record<string, unknown>) || isUserFacingDropSignal(drop));
      filtered = filtered.filter((drop) => {
        const dropState = String(drop.state ?? drop.state_code ?? "").toUpperCase();
        return !isBlockedWarehouseDrop(drop as Record<string, unknown>) && (!options.filterDegradedStates || !degradedStates.has(dropState));
      });
      filtered = filtered.filter((drop) => isDropFeedRarity(drop));
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
        ], nyAreas.areas.length ? nyAreas.areas : ["New York City"]));
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

    if (include !== "all" && state && drops.length === 0 && !bottle && !store && degradedStates.has(state)) {
      drops = applyPublicDropFilters(normalizedDrops, { filterDegradedStates: false })
        .filter((drop) => String(drop.state ?? drop.state_code ?? "").toUpperCase() === state);
      drops = applyRequestedAreaFilter(drops);
      if (tierFilter.size > 0) drops = drops.filter((drop) => tierFilter.has(dropRarityTier(drop)));
      degradedStateFallback = drops.length > 0;
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
    const snapshot = `${engineSnapshot}:retailer:${retailerFeedSnapshot(retailerSubmissions)}:history:${historicalMode ? 1 : 0}`;
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
