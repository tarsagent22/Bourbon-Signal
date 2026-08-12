import "server-only";
import { clerkClient } from "@clerk/nextjs/server";
import { addOneCalendarYear } from "@/lib/gifts";
import { createGiftRepository, type GiftOrderRecord } from "@/lib/gift-repository";
import { activateGiftMembership, reactivateDirectFounderMembership, revokeGiftMembershipIfCurrent } from "@/lib/membership-server";

function stringValue(value: unknown) {
  return typeof value === "string" ? value : null;
}

export async function completeGiftActivationSaga(input: {
  order: GiftOrderRecord;
  userId: string;
  verifiedEmail: string;
  claimToken: string;
}) {
  const repository = createGiftRepository();
  let activationOrder: GiftOrderRecord = input.order;
  if (!await repository.beginRedemptionActivation({
    orderId: input.order.id, userId: input.userId, verifiedEmail: input.verifiedEmail, claimToken: input.claimToken,
  })) throw new Error("Gift activation claim is unavailable");

  try {
    const authorizedOrder = await repository.authorizeGiftActivation({
      orderId: input.order.id, userId: input.userId, verifiedEmail: input.verifiedEmail, claimToken: input.claimToken,
    });
    if (!authorizedOrder) throw new Error("Gift activation is no longer authorized");
    const user = await (await clerkClient()).users.getUser(input.userId);
    const metadata = user.publicMetadata as Record<string, unknown>;
    const clerkAlreadyCommitted = stringValue(metadata.giftOrderId) === authorizedOrder.id
      && stringValue(metadata.giftEntitlementVersion) === authorizedOrder.entitlementVersion;
    const committedStart = clerkAlreadyCommitted ? stringValue(metadata.giftAccessStartsAt) : null;
    const parsedCommittedStart = committedStart ? new Date(committedStart) : null;
    const redeemedAt = parsedCommittedStart && Number.isFinite(parsedCommittedStart.getTime())
      ? parsedCommittedStart
      : new Date();
    activationOrder = {
      ...authorizedOrder,
      redeemedByUserId: input.userId,
      accessStartsAt: redeemedAt.toISOString(),
      accessExpiresAt: authorizedOrder.giftPlan === "founder_lifetime_gift"
        ? null
        : addOneCalendarYear(redeemedAt).toISOString(),
    };
    if (!clerkAlreadyCommitted) await activateGiftMembership(input.userId, activationOrder);
    const redeemed = await repository.finalizeRedemption({
      orderId: input.order.id,
      userId: input.userId,
      verifiedEmail: input.verifiedEmail,
      claimToken: input.claimToken,
      redeemedAt: redeemedAt.toISOString(),
    });
    if (!redeemed) throw new Error("Gift redemption finalization failed");
    return redeemed;
  } catch (error) {
    const current = await repository.readForAdverseReconciliation(input.order.id).catch(() => null);
    if (current && (current.refundedAt || current.disputedAt)) {
      await repository.abandonAdverseClaim(input.order.id).catch(() => undefined);
    }
    // Clerk and Postgres cannot commit atomically. If finalization is uncertain, remove only this
    // exact entitlement version; the durable activation saga remains retryable when payment is safe.
    await revokeGiftMembershipIfCurrent({ ...activationOrder, redeemedByUserId: input.userId }).catch(() => undefined);
    await repository.recordActivationError(input.order.id, input.claimToken, error).catch(() => undefined);
    throw error;
  }
}

export async function runGiftActivationReconciliation(limit = 50) {
  const claims = await createGiftRepository().listStaleActivationClaims(limit);
  let finalized = 0;
  let failed = 0;
  for (const claim of claims) {
    try {
      await completeGiftActivationSaga(claim);
      finalized += 1;
    } catch {
      failed += 1;
    }
  }
  return { ok: failed === 0, examined: claims.length, finalized, failed };
}

export async function runDirectFounderActivationReconciliation(limit = 50) {
  const repository = createGiftRepository();
  const attempts = await repository.listPendingDirectFounderActivations(limit);
  let activated = 0;
  let failed = 0;
  for (const attempt of attempts) {
    try {
      if (!await reactivateDirectFounderMembership(attempt.attemptId)) throw new Error("Direct Founder entitlement is not active");
      await repository.markDirectFounderActivationReconciled(attempt.attemptId);
      activated += 1;
    } catch (error) {
      await repository.recordDirectFounderActivationError(attempt.attemptId, error).catch(() => undefined);
      failed += 1;
    }
  }
  return { ok: failed === 0, examined: attempts.length, activated, failed };
}
