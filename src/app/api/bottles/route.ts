import { NextRequest, NextResponse } from "next/server";
import { readSiteExport, siteExportHeaders, listStates, normalizeBottleForSite } from "@/lib/site-engine-contract";
import { getBourbonBible } from "@/lib/bourbonBible";
import { rankBottleSearch } from "@/lib/bottle-search";

export async function GET(request: NextRequest) {
  try {
    const query = request.nextUrl.searchParams.get("query")?.replace(/\s+/g, " ").trim() || "";
    if (query) {
      const requestedLimit = Number(request.nextUrl.searchParams.get("limit") || 12);
      const limit = Number.isFinite(requestedLimit) ? Math.max(1, Math.min(30, Math.floor(requestedLimit))) : 12;
      const bottles = rankBottleSearch(await getBourbonBible(), query, limit);
      return NextResponse.json({ bottles, total: bottles.length, query }, { headers: siteExportHeaders("local-export") });
    }
    const exportPayload = await readSiteExport("bottles");
    const rawBottles = Array.isArray(exportPayload?.bottles) ? exportPayload.bottles : [];
    const bottles = rawBottles.map((bottle) => normalizeBottleForSite(bottle as Record<string, unknown>));

    return NextResponse.json(
      {
        ...exportPayload,
        bottles,
        total: bottles.length,
        states: listStates(bottles.flatMap((bottle) => bottle.states.map((state) => ({ state })))),
        lastUpdated: exportPayload?.generatedAt ?? new Date().toISOString(),
      },
      { headers: siteExportHeaders("local-export") }
    );
  } catch (err) {
    console.error("[api/bottles] Error reading site export:", err);

    return NextResponse.json(
      {
        bottles: [],
        total: 0,
        states: [],
        error: "Engine export temporarily unavailable",
      },
      {
        status: 200,
        headers: siteExportHeaders("empty-fallback"),
      }
    );
  }
}
