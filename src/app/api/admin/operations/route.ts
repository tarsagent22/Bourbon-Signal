import { requireOwnerApiAccess } from "@/lib/owner-auth";
import { buildOpsHealth, readAlertDeliveryHeartbeat } from "@/lib/ops-health";
import { readSiteExport } from "@/lib/site-engine-contract";
import { coverageDatabase } from "@/lib/owner-workspace";
import { buildMemberSetupProgress } from "@/lib/member-setup-progress";
import { MobileActivityRepository } from "@/lib/mobile-activity-repository";
import type { CompanyMemberUser } from "@/lib/company-control-room";
const headers = { "Cache-Control": "private, no-store" };
export async function GET() {
  const owner = await requireOwnerApiAccess();
  if (owner.error) return owner.error;
  try {
    const setupPromise = (async () => {
      const users: CompanyMemberUser[] = [];
      const now = new Date();
      let complete = false;
      for (let offset = 0; offset < 1000; offset += 100) {
        const page = await owner.client.users.getUserList({ limit: 100, offset, orderBy: '-created_at' });
        users.push(...page.data);
        if (!page.data.length || offset + page.data.length >= page.totalCount
          || page.data.some(user => now.getTime() - user.createdAt > 30 * 86_400_000)) { complete = true; break; }
      }
      const activity = await new MobileActivityRepository().readMany(users.flatMap(user => user.id ? [user.id] : []));
      return { ...buildMemberSetupProgress(users, activity, now), complete };
    })().catch(() => null);
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
      { health, states: state?.states || [], audit, setup: await setupPromise },
      { headers },
    );
  } catch {
    return Response.json(
      { error: "Operations could not refresh." },
      { status: 503, headers },
    );
  }
}
