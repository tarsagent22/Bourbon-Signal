import { NextResponse } from "next/server";
import { readSiteExportResult, siteExportHeaders } from "@/lib/site-engine-contract";

export async function GET() {
  try {
    const { payload, source, snapshotId } = await readSiteExportResult("stats");
    if (!payload || source === "cache-fallback") throw new Error("Stats snapshot unavailable");
    const { historicalSignalCount, signalCount, storeCount, engineGeneratedAt, generatedAt } = payload;
    return NextResponse.json(
      { historicalSignalCount, signalCount, storeCount, engineGeneratedAt, generatedAt },
      { headers: siteExportHeaders(source, snapshotId) },
    );
  } catch {
    return NextResponse.json({ error: "Stats temporarily unavailable" }, {
      status: 503, headers: { "Cache-Control": "no-store" },
    });
  }
}
