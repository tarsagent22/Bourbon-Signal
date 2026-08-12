import { NextRequest, NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { canRedeemGiftForMembership } from "@/lib/gifts";
import { createGiftRepository } from "@/lib/gift-repository";
import { resolveServerEffectiveMembershipTier } from "@/lib/server-entitlements";
import { completeGiftActivationSaga } from "@/lib/gift-activation";

export const dynamic = "force-dynamic";
const PRIVATE_HEADERS = { "Cache-Control": "private, no-store" };

export async function POST(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Sign in to redeem this gift." }, { status: 401, headers: PRIVATE_HEADERS });
  const body = await request.json().catch(() => ({})) as { token?: unknown };
  const token = typeof body.token === "string" ? body.token.trim() : "";
  if (!/^[A-Za-z0-9_-]{40,100}$/.test(token)) return NextResponse.json({ error: "This gift link is invalid." }, { status: 400, headers: PRIVATE_HEADERS });
  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  const primary = user.emailAddresses.find((email) => email.id === user.primaryEmailAddressId);
  if (!primary || primary.verification?.status !== "verified") return NextResponse.json({ error: "A verified primary email is required." }, { status: 409, headers: PRIVATE_HEADERS });
  const repository = createGiftRepository();
  const pending = await repository.readForRedemptionToken(token);
  if (!pending) return NextResponse.json({ error: "This gift is invalid or unavailable." }, { status: 404, headers: PRIVATE_HEADERS });
  if (pending.purchaserUserId === userId) return NextResponse.json({ error: "The purchaser cannot redeem their own gift." }, { status: 409, headers: PRIVATE_HEADERS });
  const currentTier = await resolveServerEffectiveMembershipTier(user.publicMetadata);
  const currentGiftOrderId = typeof user.publicMetadata.giftOrderId === "string" ? user.publicMetadata.giftOrderId : null;
  const currentGiftVersion = typeof user.publicMetadata.giftEntitlementVersion === "string"
    ? user.publicMetadata.giftEntitlementVersion : null;
  const currentGiftOwnsAccess = currentGiftOrderId
    ? await repository.giftOwnsEffectiveAccess(currentGiftOrderId, currentGiftVersion).catch(() => false)
    : false;
  const effectiveGiftOrderId = currentGiftOwnsAccess ? currentGiftOrderId : null;
  if (pending.redeemedByUserId === userId && pending.redeemedAt) {
    return NextResponse.json({ ok: true, tier: pending.giftTier, founderNumber: pending.founderNumber, accessExpiresAt: pending.accessExpiresAt }, { headers: PRIVATE_HEADERS });
  }
  if (effectiveGiftOrderId !== pending.id && !canRedeemGiftForMembership(pending.giftTier, currentTier, effectiveGiftOrderId)) {
    return NextResponse.json({ error: "Your current membership already includes this gift level." }, { status: 409, headers: PRIVATE_HEADERS });
  }
  const verifiedEmail = primary.emailAddress.trim().toLowerCase();
  if (!effectiveGiftOrderId) await repository.recoverStaleRedemptionClaim(userId, verifiedEmail);
  try {
    const claimed = await repository.claimRedemption({ order: pending, token, userId, verifiedEmail });
    if (!claimed) throw new Error("Gift redemption claim failed");
    const redeemed = await completeGiftActivationSaga({ order: claimed.order, userId, verifiedEmail, claimToken: claimed.claimToken });
    return NextResponse.json({ ok: true, tier: redeemed.giftTier, founderNumber: redeemed.founderNumber, accessExpiresAt: redeemed.accessExpiresAt }, { headers: PRIVATE_HEADERS });
  } catch {
    return NextResponse.json({ error: "This gift cannot be redeemed by this account." }, { status: 409, headers: PRIVATE_HEADERS });
  }
}
