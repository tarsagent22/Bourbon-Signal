import { NextResponse } from "next/server";
import { isUserFacingDropSignal, normalizeDropForSite, readSiteExport, siteExportHeaders } from "@/lib/site-engine-contract";

function includesNeedle(value: unknown, needle: string) {
  return typeof value === "string" && value.toLowerCase().includes(needle);
}

function locationMatches(value: unknown, needle: string) {
  if (typeof value !== "string") return false;
  const haystack = value.toLowerCase().trim();
  return haystack.includes(needle) || needle.includes(haystack);
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
  return value.toLowerCase().includes("board");
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const state = url.searchParams.get("state")?.toUpperCase();
  const limit = Math.max(0, Number(url.searchParams.get("limit") ?? "50") || 50);
  const offset = Math.max(0, Number(url.searchParams.get("offset") ?? "0") || 0);
  const bottle = url.searchParams.get("bottle")?.toLowerCase().trim();
  const store = url.searchParams.get("store")?.toLowerCase().trim();
  const include = url.searchParams.get("include")?.toLowerCase().trim();

  try {
    const exportPayload = readSiteExport("drops");
    const rawDrops = Array.isArray(exportPayload?.drops) ? exportPayload.drops : [];
    let drops = rawDrops.map((drop) => normalizeDropForSite(drop as Record<string, unknown>));

    if (include !== "all") {
      drops = drops.filter((drop) => isUserFacingDropSignal(drop));
      drops = drops.filter((drop) => {
        const dropState = String(drop.state ?? drop.state_code ?? "").toUpperCase();
        const eventType = String(drop.event_type ?? "");
        const scope = String(drop.availability_scope ?? "");
        return !(dropState === "NC" && (eventType === "nc_statewide_warehouse_stock" || scope === "warehouse"));
      });
    }

    if (state) {
      drops = drops.filter((drop) => String(drop.state ?? drop.state_code ?? "").toUpperCase() === state);
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
      const allowBoardLevelDrops = isBoardQuery(store);
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
    const pagedDrops = drops.slice(offset, offset + limit);

    return NextResponse.json(
      {
        ...exportPayload,
        drops: pagedDrops,
        total,
        limit,
        offset,
        hasMore: offset + limit < total,
        lastUpdated: exportPayload?.generatedAt ?? new Date().toISOString(),
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
        lastUpdated: new Date().toISOString(),
        error: "Engine export temporarily unavailable",
      },
      {
        status: 200,
        headers: {
          ...siteExportHeaders("empty-fallback"),
          "X-Drops-Source": "empty-fallback",
        },
      }
    );
  }
}
