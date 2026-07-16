import { NextResponse } from "next/server";
import { getCompanyControlRoomSnapshot } from "@/lib/company-control-room-server";
import { authorizeOpsBearer, getDedicatedScorecardReadSecret, isAggregateScorecard } from "@/lib/ops-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!authorizeOpsBearer(request.headers.get("authorization"), getDedicatedScorecardReadSecret())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const snapshot = await getCompanyControlRoomSnapshot();
    if (!isAggregateScorecard(snapshot.scorecard)) {
      return NextResponse.json({ error: "Aggregate scorecard unavailable" }, { status: 503 });
    }
    return NextResponse.json(snapshot.scorecard, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Aggregate scorecard unavailable" }, { status: 503 });
  }
}
