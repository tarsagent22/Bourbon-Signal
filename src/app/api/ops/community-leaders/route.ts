import { authorizeOpsBearer } from "@/lib/ops-auth";
import { createCommunityLeaderBadgeQuery } from "@/lib/community-leader-badges";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!authorizeOpsBearer(request.headers.get("authorization"), process.env.CRON_SECRET)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const rows = await createCommunityLeaderBadgeQuery().query("SELECT * FROM settle_community_leader_badges()");
    // Aggregate counts only. Member IDs and scores stay private.
    return Response.json(rows[0], { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "Community awards unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
