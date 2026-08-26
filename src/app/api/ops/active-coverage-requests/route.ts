import { NextResponse } from "next/server";

import { buildActiveCoverageBrief } from "@/lib/active-coverage-brief";
import { authorizeOpsBearer, getDedicatedScorecardReadSecret } from "@/lib/ops-auth";
import { getCoverageRequestRepository } from "@/lib/coverage-request-repository";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!authorizeOpsBearer(request.headers.get("authorization"), getDedicatedScorecardReadSecret())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }
  try {
    const brief = await buildActiveCoverageBrief(getCoverageRequestRepository());
    return NextResponse.json(brief, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Active coverage brief unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
