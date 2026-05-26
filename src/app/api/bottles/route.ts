import { NextResponse } from "next/server";
import { readSiteExport, siteExportHeaders, listStates, normalizeBottleForSite } from "@/lib/site-engine-contract";

export async function GET() {
  try {
    const exportPayload = readSiteExport("bottles");
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
