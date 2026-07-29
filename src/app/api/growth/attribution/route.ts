import { NextRequest, NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import {
  canonicalTrackedAcquisitionCampaign,
  isProductionGrowthEnvironment,
  mergeGrowthMilestoneMetadata,
  normalizeCheckoutSource,
  normalizeGrowthAttribution,
  sanitizeGrowthEvent,
  type DurableGrowthMilestone,
  type GrowthAttribution,
} from "@/lib/growth-events";
import { US_STATE_CODES } from "@/lib/coverage-model";

const ALLOWED_MILESTONES = new Set<DurableGrowthMilestone>([
  "signup_started",
  "onboarding_state_selected",
  "free_value_reached",
  "pricing_viewed",
]);
const HOME_STATE_MARKETS = new Set<string>(US_STATE_CODES);
const SIGNUP_COOKIE = "bs_signup_started";

interface StoredAttribution extends GrowthAttribution {
  recordedAt: number | null;
}

function storedAttribution(raw: string | undefined): StoredAttribution | null {
  if (!raw || raw.length > 1_000) return null;
  try {
    const value = JSON.parse(raw) as Record<string, unknown>;
    const surface = normalizeCheckoutSource(value.surface);
    const campaign = typeof value.campaign === "string" && /^[a-z0-9_:-]{1,80}$/.test(value.campaign) ? value.campaign : "unknown";
    const referrerHost = typeof value.referrerHost === "string" && /^[a-z0-9.-]{1,253}$/.test(value.referrerHost) ? value.referrerHost : "unknown";
    const candidateRecordedAt = Number(value.recordedAt);
    const recordedAt = Number.isFinite(candidateRecordedAt)
      && candidateRecordedAt <= Date.now() + 60_000
      && candidateRecordedAt >= Date.now() - 30 * 86_400_000
      ? candidateRecordedAt
      : null;
    return { surface, campaign, referrerHost, recordedAt };
  } catch {
    return null;
  }
}

function storedSignupStarted(raw: string | undefined) {
  if (!raw || !/^\d{4}-\d{2}-\d{2}T/.test(raw)) return null;
  const timestamp = new Date(raw).getTime();
  if (!Number.isFinite(timestamp) || timestamp > Date.now() + 60_000 || timestamp < Date.now() - 30 * 86_400_000) return null;
  return new Date(timestamp).toISOString();
}

function milestoneProperties(body: Record<string, unknown>) {
  return Object.fromEntries(
    ["surface", "kind", "market", "precision"]
      .filter((key) => typeof body[key] === "string")
      .map((key) => [key, body[key]]),
  );
}

function validMilestoneContext(milestone: DurableGrowthMilestone, body: Record<string, unknown>) {
  const safe = sanitizeGrowthEvent(milestone, milestoneProperties(body));
  if (!safe) return null;
  if (milestone === "signup_started") return safe.surface === "sign_up" ? safe : null;
  if (milestone === "registration_completed") return safe.surface === "welcome" || safe.surface === "sign_up" ? safe : null;
  if (milestone === "pricing_viewed") return safe.surface === "pricing" ? safe : null;
  if (milestone === "onboarding_state_selected") {
    const market = safe.market?.toUpperCase();
    return safe.surface === "welcome" && safe.kind === "state_selection" && market && HOME_STATE_MARKETS.has(market)
      ? safe
      : null;
  }
  if (milestone === "free_value_reached") {
    if (safe.surface === "bottle_check" && (!safe.kind || safe.kind === "bottle_check")) return safe;
    if (safe.surface === "release_radar" && ["calendar_filter", "calendar_navigation"].includes(safe.kind || "")) return safe;
    const market = safe.market?.toUpperCase();
    if (safe.surface === "welcome" && safe.kind === "welcome_state_signals" && market && HOME_STATE_MARKETS.has(market)) return safe;
    if (safe.surface === "drop_feed" && safe.kind === "state_feed" && market && HOME_STATE_MARKETS.has(market)) return safe;
  }
  return null;
}

function mergeMilestoneContext(
  metadata: Record<string, unknown>,
  milestone: DurableGrowthMilestone,
  context: Record<string, string>,
) {
  const current = metadata.growthMilestoneContext && typeof metadata.growthMilestoneContext === "object"
    ? metadata.growthMilestoneContext as Record<string, unknown>
    : {};
  return {
    ...current,
    [milestone]: current[milestone] || context,
  };
}

export async function POST(req: NextRequest) {
  const host = req.headers.get("host")?.split(":")[0].toLowerCase() || "";
  if (process.env.NODE_ENV === "production" && !isProductionGrowthEnvironment(host)) return NextResponse.json({ ok: true });

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const normalizedIncoming = normalizeGrowthAttribution(body);
  const canonicalCampaign = canonicalTrackedAcquisitionCampaign(normalizedIncoming.campaign);
  const incoming = canonicalCampaign ? { ...normalizedIncoming, campaign: canonicalCampaign } : normalizedIncoming;
  const existingCookie = storedAttribution(req.cookies.get("bs_first_touch")?.value);
  const nowMs = Date.now();
  const legacyCookie = existingCookie?.recordedAt === null;
  const firstTouch: StoredAttribution = existingCookie
    ? { ...existingCookie, recordedAt: legacyCookie ? nowMs : existingCookie.recordedAt }
    : { ...incoming, recordedAt: nowMs };
  const response = NextResponse.json({ ok: true });

  if (!existingCookie || legacyCookie) {
    response.cookies.set("bs_first_touch", JSON.stringify(firstTouch), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60 * 24 * 30,
      path: "/",
    });
  }

  const milestone = typeof body.event === "string" && ALLOWED_MILESTONES.has(body.event as DurableGrowthMilestone)
    ? body.event as DurableGrowthMilestone
    : null;
  const context = milestone ? validMilestoneContext(milestone, body) : null;
  if (milestone === "signup_started" && context) {
    response.cookies.set(SIGNUP_COOKIE, new Date().toISOString(), {
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
    const userCreatedAt = new Date(user.createdAt).getTime();
    const touchPrecededAccount = firstTouch.recordedAt !== null
      && Number.isFinite(userCreatedAt)
      && firstTouch.recordedAt <= userCreatedAt;
    if (!privateMetadata.firstTouch && touchPrecededAccount) update.firstTouch = firstTouch;

    let nextMetadata = privateMetadata;
    if (milestone === "registration_completed" && context) {
      const signupStartedAt = storedSignupStarted(req.cookies.get(SIGNUP_COOKIE)?.value);
      if (signupStartedAt) {
        nextMetadata = mergeGrowthMilestoneMetadata(nextMetadata, "signup_started", signupStartedAt);
      }
    }
    if (milestone && context) {
      nextMetadata = mergeGrowthMilestoneMetadata(nextMetadata, milestone, new Date().toISOString());
      update.activation = nextMetadata.activation;
      update.growthMilestoneContext = mergeMilestoneContext(privateMetadata, milestone, context);
    }

    if (Object.keys(update).length) await client.users.updateUserMetadata(userId, { privateMetadata: update });
  } catch (error) {
    console.warn("growth metadata update failed", error instanceof Error ? error.message : "unknown error");
    return NextResponse.json({ ok: false }, { status: 503 });
  }

  return response;
}
