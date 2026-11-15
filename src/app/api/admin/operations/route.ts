import { requireOwnerApiAccess } from "@/lib/owner-auth";
import { buildSiteExportOpsHealth, readAlertDeliveryHeartbeat } from "@/lib/ops-health";
import { readSiteExportIdentity, readSiteExportResults } from "@/lib/site-engine-contract";
import { coverageDatabase } from "@/lib/owner-workspace";
import { buildMemberSetupProgress } from "@/lib/member-setup-progress";
import { MobileActivityRepository } from "@/lib/mobile-activity-repository";
import type { CompanyMemberUser } from "@/lib/company-control-room";

const headers = { "Cache-Control": "private, no-store" };
const emptyExport = { payload: null, source: "empty-fallback", snapshotId: null, generatedAt: null } as const;

async function serviceHealth() {
  const selection = readSiteExportIdentity();
  const [stats, stateHealth, heartbeat] = await Promise.all([
    selection.then(async (identity) => (await readSiteExportResults(["stats"], identity))[0]).catch(() => emptyExport),
    selection.then(async (identity) => (await readSiteExportResults(["state-health"], identity))[0]).catch(() => emptyExport),
    readAlertDeliveryHeartbeat(),
  ]);
  // If the current state export fell back separately, don't present its rows
  // as evidence about the successfully read active stats snapshot.
  const sameSnapshot = stats.source === stateHealth.source && stats.snapshotId === stateHealth.snapshotId;
  const states = sameSnapshot && Array.isArray(stateHealth.payload?.states) ? stateHealth.payload.states : null;
  return { health: buildSiteExportOpsHealth(stats, heartbeat), states };
}

export async function GET(request?: Request) {
  const owner = await requireOwnerApiAccess();
  if (owner.error) return owner.error;
  const view = request ? new URL(request.url).searchParams.get("view") : null;
  if (view !== null && !["health", "setup", "history"].includes(view)) {
    return Response.json({ error: "Unknown operations view." }, { status: 400, headers });
  }

  const memberSetup = async () => {
    const users: CompanyMemberUser[] = [];
    const now = new Date();
    let complete = false;
    for (let offset = 0; offset < 1000; offset += 100) {
      const page = await owner.client.users.getUserList({ limit: 100, offset, orderBy: "-created_at" });
      users.push(...page.data);
      if (!page.data.length || offset + page.data.length >= page.totalCount
        || page.data.some((user) => now.getTime() - user.createdAt > 30 * 86_400_000)) {
        complete = true;
        break;
      }
    }
    const activity = await new MobileActivityRepository().readMany(users.flatMap((user) => user.id ? [user.id] : []));
    return { ...buildMemberSetupProgress(users, activity, now), complete };
  };
  const history = async () => coverageDatabase().query(
    "SELECT id,action,target_id,details,created_at FROM owner_workspace_audit ORDER BY id DESC LIMIT 50",
  );

  try {
    if (view === "health") return Response.json(await serviceHealth(), { headers });
    if (view === "setup") return Response.json({ setup: await memberSetup() }, { headers });
    if (view === "history") return Response.json({ audit: await history() }, { headers });

    // Installed versions still read the combined response.
    const [service, audit, setup] = await Promise.all([
      serviceHealth(),
      history(),
      memberSetup().catch(() => null),
    ]);
    return Response.json({ ...service, states: service.states ?? [], audit, setup }, { headers });
  } catch {
    return Response.json({ error: "Operations could not refresh." }, { status: 503, headers });
  }
}
