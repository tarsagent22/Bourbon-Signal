import { NextResponse } from "next/server";
import { buildOpsHealth, readAlertDeliveryHeartbeat } from "@/lib/ops-health";
import { readSiteExportResult, siteExportHeaders } from "@/lib/site-engine-contract";

export const dynamic = "force-dynamic";

export async function GET() {
  const statsResult = await readSiteExportResult("stats");
  const stats = statsResult.payload as Record<string, unknown> | null;
  const heartbeat = await readAlertDeliveryHeartbeat();
  const productionObservedAt = statsResult.source === "remote-snapshot" ? new Date().toISOString() : null;
  const health = buildOpsHealth({
    heartbeat,
    engineGeneratedAt: typeof stats?.engineGeneratedAt === "string"
      ? stats.engineGeneratedAt
      : typeof stats?.generatedAt === "string" ? stats.generatedAt : null,
    refreshHealth: stats?.refreshHealth && typeof stats.refreshHealth === "object"
      ? stats.refreshHealth as Record<string, unknown>
      : null,
    currentDeploymentId: process.env.VERCEL_DEPLOYMENT_ID || null,
    snapshot: {
      snapshotId: statsResult.snapshotId,
      dataSource: statsResult.source,
      exportGeneratedAt: statsResult.generatedAt,
      snapshotUploadedAt: statsResult.snapshotUploadedAt ?? null,
      snapshotActivatedAt: statsResult.snapshotActivatedAt ?? null,
      productionObservedAt,
      appCommit: statsResult.appCommit ?? null,
      engineCommit: statsResult.engineCommit ?? null,
      collectionRunId: statsResult.collectionRunId ?? null,
    },
  });

  const headers = siteExportHeaders(statsResult.source, statsResult.snapshotId);
  headers["Cache-Control"] = "no-store, max-age=0";
  return NextResponse.json(health, {
    status: health.ok ? 200 : 503,
    headers,
  });
}
