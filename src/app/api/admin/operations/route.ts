import { requireOwnerApiAccess } from "@/lib/owner-auth";
import { buildOpsHealth, readAlertDeliveryHeartbeat } from "@/lib/ops-health";
import { readSiteExport } from "@/lib/site-engine-contract";
import { coverageDatabase } from "@/lib/owner-workspace";
const headers = { "Cache-Control": "private, no-store" };
export async function GET() {
  const owner = await requireOwnerApiAccess();
  if (owner.error) return owner.error;
  try {
    const [stats, stateHealth, heartbeat, audit] = await Promise.all([
      readSiteExport("stats"),
      readSiteExport("state-health"),
      readAlertDeliveryHeartbeat(),
      coverageDatabase().query(
        "SELECT id,action,target_id,details,created_at FROM owner_workspace_audit ORDER BY id DESC LIMIT 50",
      ),
    ]);
    const data = stats as Record<string, unknown> | null,
      state = stateHealth as Record<string, unknown> | null;
    const health = buildOpsHealth({
      heartbeat,
      engineGeneratedAt:
        typeof data?.engineGeneratedAt === "string"
          ? data.engineGeneratedAt
          : typeof data?.generatedAt === "string"
            ? data.generatedAt
            : null,
      refreshHealth: data?.refreshHealth as Record<string, unknown> | null,
      currentDeploymentId: process.env.VERCEL_DEPLOYMENT_ID || null,
    });
    return Response.json(
      { health, states: state?.states || [], audit },
      { headers },
    );
  } catch {
    return Response.json(
      { error: "Operations could not refresh." },
      { status: 503, headers },
    );
  }
}
