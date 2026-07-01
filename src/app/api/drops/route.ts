import { getEntitlements } from "@/lib/entitlements";
import { NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { isUserFacingDropSignal, normalizeDropForSite, readSiteExport, siteExportHeaders } from "@/lib/site-engine-contract";
import { locationLabelsMatch, normalizeStateCodeParam } from "@/lib/location-normalization";

const ANONYMOUS_DROP_PREVIEW_LIMIT = 7;
const DROP_FEED_TIERS = new Set(["unicorn", "allocated", "limited"]);
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const MAX_ENGINE_AGE_MS = 24 * HOUR_MS;
const MAX_INVENTORY_DROP_AGE_MS = 72 * HOUR_MS;
const MAX_DELIVERY_DROP_AGE_MS = 14 * DAY_MS;
const MAX_CONTEXT_DROP_AGE_MS = 30 * DAY_MS;
const FUTURE_CLOCK_SKEW_MS = 15 * 60 * 1000;

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
  return DROP_FEED_TIERS.has(dropRarityTier(drop)) && !isKnownFalseRareMatch(drop);
}

function includesNeedle(value: unknown, needle: string) {
  return typeof value === "string" && value.toLowerCase().includes(needle);
}

function locationMatches(value: unknown, needle: string) {
  if (typeof value !== "string") return false;
  return locationLabelsMatch(value, needle);
}

function arrayIncludesNeedle(value: unknown, needle: string) {
  return Array.isArray(value) && value.some((item) => includesNeedle(item, needle));
}

function locationNeedles(value: string) {
  return Array.from(
    new Set(
      [
        value,
        value.replace(/\s+abc\s+board$/i, ""),
        value.replace(/\s+county\s+abc\s+board$/i, " county"),
      ]
        .map((item) => item.toLowerCase().trim())
        .filter(Boolean)
    )
  );
}

function isBoardLevelDrop(drop: Record<string, unknown>) {
  const precision = String(drop.location_precision ?? drop.locationPrecision ?? "").toLowerCase();
  const scope = String(drop.availability_scope ?? drop.availabilityScope ?? "").toLowerCase();
  return precision.includes("board") || scope === "board";
}

function isBoardQuery(value: string) {
  return /\b(board|abc)\b/i.test(value);
}

function engineRunTimestamp(exportGeneratedAt?: unknown) {
  const statsPayload = readSiteExport("stats");
  const candidates = [statsPayload?.engineGeneratedAt, statsPayload?.generatedAt, exportGeneratedAt];
  const timestamp = candidates.find((value) => typeof value === "string" && value.trim());
  return typeof timestamp === "string" ? timestamp : "";
}

function asTime(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return Number.NaN;
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : Number.NaN;
}

function publicDropTimestamp(drop: Record<string, unknown>) {
  return asTime(drop.timestamp ?? drop.displayAt ?? drop.event_at ?? drop.eventAt ?? drop.first_seen_at ?? drop.firstSeenAt ?? drop.last_confirmed_at ?? drop.lastConfirmedAt);
}

function maxAgeForDrop(drop: Record<string, unknown>) {
  const type = String(drop.event_type ?? drop.type ?? "").toLowerCase();
  const category = String(drop.signal_category ?? drop.signalCategory ?? "").toLowerCase();
  const scope = String(drop.availability_scope ?? drop.availabilityScope ?? "").toLowerCase();
  const precision = String(drop.location_precision ?? drop.locationPrecision ?? "").toLowerCase();
  const canAlert = drop.can_alert_as_inventory === true || drop.canAlertAsInventory === true;

  if (canAlert || category === "inventory" || scope === "store_reported" || precision === "store_level" || type.includes("in_stock") || type.includes("inventory_result")) {
    return MAX_INVENTORY_DROP_AGE_MS;
  }
  if (category === "delivery" || type.includes("shipment") || type.includes("delivery") || type.includes("allocation_snapshot")) {
    return MAX_DELIVERY_DROP_AGE_MS;
  }
  return MAX_CONTEXT_DROP_AGE_MS;
}

function isFreshEnoughForPublicFeed(drop: Record<string, unknown>, now = Date.now()) {
  const timestamp = publicDropTimestamp(drop);
  if (!Number.isFinite(timestamp)) return false;
  if (timestamp > now + FUTURE_CLOCK_SKEW_MS) return false;
  return now - timestamp <= maxAgeForDrop(drop);
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
        return status !== "stale_useful";
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

export async function GET(request: Request) {
  const url = new URL(request.url);
  const { userId } = await auth();
  const isSignedIn = Boolean(userId);
  const user = userId ? await (await clerkClient()).users.getUser(userId) : null;
  const entitlements = getEntitlements(user?.publicMetadata || null);
  const isFreeAccess = !isSignedIn || entitlements.tier === "free";
  const requestedLimit = Math.max(0, Number(url.searchParams.get("limit") ?? "50") || 50);
  const previewLimit = entitlements.feedPreviewLimit ?? ANONYMOUS_DROP_PREVIEW_LIMIT;
  const limit = isFreeAccess ? Math.min(requestedLimit, previewLimit) : requestedLimit;
  const offset = isFreeAccess ? 0 : Math.max(0, Number(url.searchParams.get("offset") ?? "0") || 0);
  // State selection is a browsing/acquisition control, not a paid-only advanced filter.
  // Free and signed-out users still receive the capped preview, but the preview must
  // come from the requested market; otherwise a saved/selected NC lens can look
  // completely blank even when the engine has current or historical NC signals.
  const state = normalizeStateCodeParam(url.searchParams.get("state"));
  const bottle = !entitlements.canUseBottleSearch ? undefined : url.searchParams.get("bottle")?.toLowerCase().trim();
  const store = !entitlements.canUseDropFeedFilters ? undefined : url.searchParams.get("store")?.toLowerCase().trim();
  const include = entitlements.canUseAdvancedFilters ? url.searchParams.get("include")?.toLowerCase().trim() : undefined;
  const tierFilter = parseTierFilter(url);

  try {
    const exportPayload = readSiteExport("drops");
    const statsPayload = readSiteExport("stats") as Record<string, unknown> | null | undefined;
    const rawDrops = Array.isArray(exportPayload?.drops) ? exportPayload.drops : [];
    const normalizedDrops = rawDrops.map((drop) => normalizeDropForSite(drop as Record<string, unknown>));
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

    const applyPublicDropFilters = (items: typeof drops, options: { filterDegradedStates: boolean; requireFreshEngine: boolean }) => {
      let filtered = [...items];
      if (options.requireFreshEngine && !engineFresh) filtered = [];
      filtered = filtered.filter((drop) => isUserFacingDropSignal(drop));
      filtered = filtered.filter((drop) => {
        const dropState = String(drop.state ?? drop.state_code ?? "").toUpperCase();
        return !isBlockedWarehouseDrop(drop as Record<string, unknown>) && (!options.filterDegradedStates || !degradedStates.has(dropState));
      });
      filtered = filtered.filter((drop) => isDropFeedRarity(drop));
      filtered = filtered.filter((drop) => isFreshEnoughForPublicFeed(drop as Record<string, unknown>));
      return filtered;
    };

    if (include !== "all") {
      drops = applyPublicDropFilters(drops, { filterDegradedStates: true, requireFreshEngine: true });
    }

    if (state) {
      drops = drops.filter((drop) => String(drop.state ?? drop.state_code ?? "").toUpperCase() === state);
    }

    if (tierFilter.size > 0) {
      drops = drops.filter((drop) => tierFilter.has(dropRarityTier(drop)));
    }

    if (include !== "all" && state && drops.length === 0 && !bottle && !store && degradedStates.has(state)) {
      drops = applyPublicDropFilters(normalizedDrops, { filterDegradedStates: false, requireFreshEngine: true })
        .filter((drop) => String(drop.state ?? drop.state_code ?? "").toUpperCase() === state);
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
      const needles = locationNeedles(store);
      const allowBoardLevelDrops = state === "NC" || isBoardQuery(store);
      drops = drops.filter((drop) =>
        (allowBoardLevelDrops || !isBoardLevelDrop(drop as Record<string, unknown>)) &&
        needles.some((needle) => {
          const record = drop as Record<string, unknown>;
          return locationMatches(drop.store_name, needle) ||
            locationMatches(drop.store_address, needle) ||
            locationMatches(drop.store_city, needle) ||
            locationMatches(drop.store_county, needle) ||
            locationMatches(drop.board_name, needle) ||
            locationMatches(drop.display_location, needle) ||
            locationMatches(record.locationName, needle) ||
            locationMatches(record.county, needle);
        })
      );
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
    const pagedDrops = displayDrops.slice(offset, offset + limit);

    return NextResponse.json(
      {
        ...exportPayload,
        drops: pagedDrops,
        total,
        limit,
        offset,
        hasMore: !isFreeAccess && offset + limit < total,
        previewLocked: isFreeAccess && total > pagedDrops.length,
        requiresAccountForFullFeed: isFreeAccess,
        lastUpdated: engineRunTimestamp(exportPayload?.generatedAt),
        engineFresh,
        degradedStatesFiltered: Array.from(degradedStates),
        degradedStateFallback,
      },
      {
        headers: {
          ...siteExportHeaders("local-export"),
          "X-Drops-Source": "local-export",
        },
      }
    );
  } catch (err) {
    console.error("[api/drops] Error reading site export:", err);

    return NextResponse.json(
      {
        drops: [],
        total: 0,
        limit,
        offset,
        hasMore: false,
        lastUpdated: "",
        engineFresh: false,
        degradedStatesFiltered: [],
        error: "Engine export temporarily unavailable",

      },
      {
        status: 503,
        headers: {
          ...siteExportHeaders("empty-fallback"),
          "X-Drops-Source": "empty-fallback",
        },
      }
    );
  }
}
