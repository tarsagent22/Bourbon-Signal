import { NextResponse } from "next/server";
import { buildOpsHealth, readAlertDeliveryHeartbeat } from "@/lib/ops-health";
import { readSiteExport } from "@/lib/site-engine-contract";

export const dynamic = "force-dynamic";

export async function GET() {
  const stats = readSiteExport("stats") as Record<string, unknown> | null;
  const heartbeat = await readAlertDeliveryHeartbeat();
  const health = buildOpsHealth({
    heartbeat,
    engineGeneratedAt: typeof stats?.engineGeneratedAt === "string"
      ? stats.engineGeneratedAt
      : typeof stats?.generatedAt === "string" ? stats.generatedAt : null,
    refreshHealth: stats?.refreshHealth && typeof stats.refreshHealth === "object"
      ? stats.refreshHealth as Record<string, unknown>
      : null,
    currentDeploymentId: process.env.VERCEL_DEPLOYMENT_ID || null,
  });

  return NextResponse.json(health, {
    status: health.ok ? 200 : 503,
    headers: {
      "Cache-Control": "no-store, max-age=0",
    },
  });
}
