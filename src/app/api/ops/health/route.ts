import { NextResponse } from "next/server";
import { buildSiteExportOpsHealth, readAlertDeliveryHeartbeat } from "@/lib/ops-health";
import { readSiteExportResult, siteExportHeaders } from "@/lib/site-engine-contract";

export const dynamic = "force-dynamic";

export async function GET() {
  const statsResult = await readSiteExportResult("stats");
  const heartbeat = await readAlertDeliveryHeartbeat();
  const health = buildSiteExportOpsHealth(statsResult, heartbeat);

  const headers = siteExportHeaders(statsResult.source, statsResult.snapshotId);
  headers["Cache-Control"] = "no-store, max-age=0";
  return NextResponse.json(health, {
    status: health.ok ? 200 : 503,
    headers,
  });
}
