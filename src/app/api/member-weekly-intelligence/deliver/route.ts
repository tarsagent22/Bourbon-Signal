import { NextRequest, NextResponse } from "next/server";
import { assertMemberWeeklyDeliveryAuthorized } from "@/lib/member-weekly-delivery";
import { runMemberWeeklyDelivery } from "@/lib/member-weekly-delivery-server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const PRIVATE_HEADERS = { "Cache-Control": "private, no-store" };

async function run(request: NextRequest) {
  try {
    assertMemberWeeklyDeliveryAuthorized(request);
  } catch {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401, headers: PRIVATE_HEADERS });
  }
  const requestLive = request.nextUrl.searchParams.get("live") === "1";
  try {
    const result = await runMemberWeeklyDelivery({ requestLive });
    return NextResponse.json(result, {
      status: result.mode === "blocked" ? 409 : result.ok ? 200 : 500,
      headers: PRIVATE_HEADERS,
    });
  } catch {
    return NextResponse.json({ ok: false, error: "Weekly delivery run failed" }, { status: 500, headers: PRIVATE_HEADERS });
  }
}

export async function GET(request: NextRequest) {
  return run(request);
}

export async function POST(request: NextRequest) {
  return run(request);
}
