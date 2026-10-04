import { NextRequest, NextResponse } from "next/server";
import { requireSignalPointsApiAccess } from "@/lib/owner-auth";
import { createSignalPointsRepository } from "@/lib/signal-points-repository";
import { resolveServerEffectiveMembershipTier } from "@/lib/server-entitlements";
import { readFounderShippingForUser } from "@/lib/founder-shipping-repository";
import { membershipCreditCatalogForTier } from "@/lib/signal-points-membership-credit";

import { appleMonthAvailable, membershipMonthQuery, membershipMonthRoute, readMonthDelivery } from "@/lib/membership-month";

export const dynamic = "force-dynamic";
const PRIVATE_HEADERS = { "Cache-Control": "private, no-store" };

export async function GET(request: NextRequest) {
  const access = await requireSignalPointsApiAccess({ unauthorized: "Account required", forbidden: "Not found" });
  if (access.error) return access.error;
  try {
    const { user, userId } = access;
    const repository = createSignalPointsRepository();
    let [summary, shipping, tier] = await Promise.all([repository.readMember(userId), readFounderShippingForUser(userId), resolveServerEffectiveMembershipTier(user.publicMetadata)]);
    const redemptions = await Promise.all(summary.redemptions.map(async item => ({ ...item, membershipMonth: item.itemKey.endsWith("membership_credit_month") ? await readMonthDelivery(userId,item.id) : null })));
    const grant = redemptions.find(item => item.membershipMonth?.provider === "earned_access" && Date.parse(item.membershipMonth.expiresAt || "") > Date.now());
    if (grant && user.publicMetadata.rewardMembershipRedemptionId !== grant.id) {
      const patch = {rewardMembershipRedemptionId:grant.id,rewardMembershipUserId:userId,rewardMembershipExpiresAt:grant.membershipMonth!.expiresAt};
      await (await (await import("@clerk/nextjs/server")).clerkClient()).users.updateUserMetadata(userId,{publicMetadata:patch});
      tier = await resolveServerEffectiveMembershipTier({...user.publicMetadata,...patch});
    }
    const route = membershipMonthRoute(tier, user.publicMetadata as Record<string,unknown>, user.privateMetadata as Record<string,unknown>, request.nextUrl.searchParams.get("platform"));
    const monthReady = (await membershipMonthQuery().query("SELECT 1 FROM signal_point_migrations WHERE migration_key='signal_points_membership_month_v5_ready'")).length > 0;
    const recentlyClaimed = (await membershipMonthQuery().query("SELECT 1 FROM signal_reward_redemptions WHERE user_id=$1 AND item_key IN ('standard_membership_credit_month','barrel_membership_credit_month') AND status<>'canceled' AND created_at>NOW()-INTERVAL '1 year' LIMIT 1", [userId])).length > 0;
    const appleReady = route?.provider === "apple" && monthReady ? await appleMonthAvailable(route) : false;
    const catalog = membershipCreditCatalogForTier(summary.catalog, tier).map(item => {
      if (!item.options.membershipCredit) return { ...item, redemptionEligible: tier !== "free" };
      const unavailableReason = recentlyClaimed ? "Available once every 12 months." : !monthReady ? "Membership rewards are being prepared." : !route ? "This reward requires an eligible monthly membership." : route.provider === "apple" && !appleReady ? "Awaiting App Store approval." : undefined;
      return { ...item, redemptionEligible: !unavailableReason, unavailableReason, membershipMonthProvider: route?.provider };
    });
    return NextResponse.json({
      ...summary,
      catalog,
      redemptions,
      tier,
      redemptionEligible: tier !== "free",
      shippingProfile: shipping ? { recipientName: shipping.recipientName, city: shipping.city, stateCode: shipping.stateCode, postalCode: shipping.postalCode } : null,
    }, { headers: PRIVATE_HEADERS });
  } catch (error) {
    console.error("Signal Points summary failed", error);
    return NextResponse.json({ error: "Signal Points are temporarily unavailable" }, { status: 503, headers: PRIVATE_HEADERS });
  }
}
