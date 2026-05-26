import { NextResponse } from "next/server";
import { normalizeStatsForSite, readSiteExport, siteExportHeaders } from "@/lib/site-engine-contract";

export async function GET() {
  try {
    const statsPayload = readSiteExport("stats");
    const bottlesPayload = readSiteExport("bottles");
    const storesPayload = readSiteExport("stores");
    const dropsPayload = readSiteExport("drops");

    const bottles = Array.isArray(bottlesPayload?.bottles) ? (bottlesPayload.bottles as Record<string, unknown>[]) : [];
    const stores = Array.isArray(storesPayload?.stores) ? (storesPayload.stores as Record<string, unknown>[]) : [];
    const drops = Array.isArray(dropsPayload?.drops) ? (dropsPayload.drops as Record<string, unknown>[]) : [];
    const data = normalizeStatsForSite(statsPayload ?? {}, bottles, stores, drops);

    return NextResponse.json(data, {
      headers: siteExportHeaders("local-export"),
    });
  } catch (err) {
    console.error("[api/stats] Error reading site export:", err);

    return NextResponse.json(
      {
        total_bottles: 0,
        total_stores: 0,
        states_covered: 0,
        drops_today: 0,
        drops_this_week: 0,
        unicorn_count: 0,
        allocated_count: 0,
        by_state: {},
        error: "Engine export temporarily unavailable",
      },
      {
        status: 200,
        headers: siteExportHeaders("empty-fallback"),
      }
    );
  }
}
