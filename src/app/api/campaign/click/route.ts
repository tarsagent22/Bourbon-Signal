import { NextResponse } from "next/server";
import { campaignClickDestination, recordCampaignClick, verifyCampaignClickToken } from "@/lib/campaign-click-tracking";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("t") || "";
  const secret = process.env.NEWSLETTER_UNSUBSCRIBE_SECRET || process.env.RESEND_API_KEY || "";
  const payload = secret ? verifyCampaignClickToken(token, secret) : null;
  if (!payload || payload.campaignId !== "free-trial-points-pilot-v1") {
    return NextResponse.json({ error: "This campaign link is invalid or expired." }, { status: 400, headers: { "Cache-Control": "private, no-store" } });
  }

  try {
    await recordCampaignClick(payload);
  } catch (error) {
    console.error("[campaign-click] Unable to record click:", error instanceof Error ? error.message : String(error));
  }

  const response = NextResponse.redirect(campaignClickDestination(payload.destination), 302);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
