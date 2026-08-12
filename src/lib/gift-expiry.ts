import "server-only";
import { createGiftRepository } from "@/lib/gift-repository";
import { expireGiftMembershipIfCurrent, reactivateGiftMembershipIfEligible, revokeGiftMembershipIfCurrent } from "@/lib/membership-server";

export async function runGiftExpiryReconciliation(limit = 100) {
  const orders = await createGiftRepository().listExpiredAnnualAccess(limit);
  let downgraded = 0;
  for (const order of orders) {
    if (await expireGiftMembershipIfCurrent(order)) downgraded += 1;
    await createGiftRepository().markExpiryReconciled(order.id, order.updatedAt);
  }
  return { ok: true, examined: orders.length, downgraded };
}

export async function runGiftAdverseReconciliation(limit = 100) {
  const repository = createGiftRepository();
  const orders = await repository.listUnreconciledAdverse(limit);
  let revoked = 0;
  let restored = 0;
  let failed = 0;
  for (const order of orders) {
    try {
      if (order.disputeStatus === "won" && !order.refundedAt && !order.disputedAt) {
        if (!await reactivateGiftMembershipIfEligible(order)) throw new Error("Gift restoration was not verified");
        restored += 1;
      } else {
        await repository.abandonAdverseClaim(order.id);
        if (!await revokeGiftMembershipIfCurrent(order)) throw new Error("Gift revocation was not verified");
        revoked += 1;
      }
      if (!await repository.markAdverseReconciled(order.id, order.updatedAt)) {
        const current = await repository.readForAdverseReconciliation(order.id);
        if (current && !await repository.giftOwnsEffectiveAccess(current.id, current.entitlementVersion)) {
          await revokeGiftMembershipIfCurrent(current);
        }
        throw new Error("Gift adverse state changed during reconciliation");
      }
    } catch {
      failed += 1;
    }
  }
  return { ok: failed === 0, examined: orders.length, revoked, restored, failed };
}
