import { NextRequest, NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import {
  isProductionGrowthEnvironment,
  mergeGrowthMilestoneMetadata,
  normalizeCheckoutSource,
  normalizeGrowthAttribution,
  type DurableGrowthMilestone,
  type GrowthAttribution,
} from "@/lib/growth-events";

const ALLOWED_MILESTONES = new Set<DurableGrowthMilestone>(["free_value_reached", "pricing_viewed"]);

function storedAttribution(raw: string | undefined): GrowthAttribution | null {
  if (!raw || raw.length > 1_000) return null;
  try {
    const value = JSON.parse(raw) as Record<string, unknown>;
    const surface = normalizeCheckoutSource(value.surface);
    const campaign = typeof value.campaign === "string" && /^[a-z0-9:-]{1,80}$/.test(value.campaign) ? value.campaign : "unknown";
    const referrerHost = typeof value.referrerHost === "string" && /^[a-z0-9.-]{1,253}$/.test(value.referrerHost) ? value.referrerHost : "unknown";
    return { surface, campaign, referrerHost };
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  const host = req.headers.get("host")?.split(":")[0].toLowerCase() || "";
  if (process.env.NODE_ENV === "production" && !isProductionGrowthEnvironment(host)) return NextResponse.json({ ok: true });

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const referrerHost = typeof body.referrerHost === "string" && /^[a-z0-9.-]{1,253}$/i.test(body.referrerHost)
    ? body.referrerHost
    : "";
  const incoming = normalizeGrowthAttribution({ ...body, referrer: referrerHost ? `https://${referrerHost}` : "" });
  const existingCookie = storedAttribution(req.cookies.get("bs_first_touch")?.value);
  const firstTouch = existingCookie || incoming;
  const response = NextResponse.json({ ok: true });

  if (!existingCookie) {
    response.cookies.set("bs_first_touch", JSON.stringify(firstTouch), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60 * 24 * 30,
      path: "/",
    });
  }

  const { userId } = await auth();
  if (!userId) return response;

  try {
    const client = await clerkClient();
    const user = await client.users.getUser(userId);
    const privateMetadata = user.privateMetadata as Record<string, unknown>;
    const update: Record<string, unknown> = {};
    if (!privateMetadata.firstTouch) update.firstTouch = firstTouch;

    const milestone = typeof body.event === "string" && ALLOWED_MILESTONES.has(body.event as DurableGrowthMilestone)
      ? body.event as DurableGrowthMilestone
      : null;
    const validContext = milestone === "pricing_viewed"
      ? incoming.surface === "pricing"
      : milestone === "free_value_reached" ? incoming.surface === "bottle_check" : false;
    if (milestone && validContext) {
      update.activation = mergeGrowthMilestoneMetadata(privateMetadata, milestone, new Date().toISOString()).activation;
    }

    if (Object.keys(update).length) await client.users.updateUserMetadata(userId, { privateMetadata: update });
  } catch (error) {
    console.warn("growth metadata update failed", error instanceof Error ? error.message : "unknown error");
  }

  return response;
}
