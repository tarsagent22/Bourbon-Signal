import { NextResponse } from "next/server";
import { normalizeDropForSite, readSiteExport, siteExportHeaders } from "@/lib/site-engine-contract";

function includesNeedle(value: unknown, needle: string) {
  return typeof value === "string" && value.toLowerCase().includes(needle);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const state = url.searchParams.get("state")?.toUpperCase();
  const limit = Math.max(0, Number(url.searchParams.get("limit") ?? "50") || 50);
  const offset = Math.max(0, Number(url.searchParams.get("offset") ?? "0") || 0);
  const bottle = url.searchParams.get("bottle")?.toLowerCase().trim();
  const store = url.searchParams.get("store")?.toLowerCase().trim();

  try {
    const exportPayload = readSiteExport("drops");
    const rawDrops = Array.isArray(exportPayload?.drops) ? exportPayload.drops : [];
    let drops = rawDrops.map((drop) => normalizeDropForSite(drop as Record<string, unknown>));

    if (state) {
      drops = drops.filter((drop) => String(drop.state ?? drop.state_code ?? "").toUpperCase() === state);
    }

    if (bottle) {
      drops = drops.filter((drop) => includesNeedle(drop.brand_name, bottle) || includesNeedle(drop.tracked_brand_name, bottle));
    }

    if (store) {
      drops = drops.filter(
        (drop) =>
          includesNeedle(drop.store_name, store) ||
          includesNeedle(drop.store_address, store) ||
          includesNeedle(drop.store_city, store) ||
          includesNeedle(drop.board_name, store)
      );
    }

    drops.sort((a, b) => +new Date(String(b.timestamp)) - +new Date(String(a.timestamp)));

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
