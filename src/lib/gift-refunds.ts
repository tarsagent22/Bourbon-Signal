import "server-only";
import Stripe from "stripe";
import { createGiftRepository } from "@/lib/gift-repository";

export async function runLatePaymentRefundReconciliation(limit = 100, stripeClient?: Stripe) {
  const repository = createGiftRepository();
  const obligations = await repository.listLatePaymentRefundObligations(limit);
  const secretKey = process.env.STRIPE_SECRET_KEY?.trim();
  const stripe = stripeClient || (secretKey ? new Stripe(secretKey) : null);
  let refunded = 0;
  let pending = 0;
  let manualRequired = 0;

  for (const obligation of obligations) {
    const mark = async (handling: "automatic_pending" | "automatic_succeeded" | "manual_required") => {
      if (obligation.purchaseType === "gift" && obligation.orderId && obligation.checkoutAttempt !== null) {
        await repository.markLatePaymentRefundHandling(obligation.orderId, obligation.checkoutAttempt, handling);
      } else if (obligation.attemptId) {
        await repository.markDirectLatePaymentRefundHandling(obligation.attemptId, handling);
      }
    };
    if (!stripe || (!obligation.paymentIntentId && !obligation.chargeId)) {
      await mark("manual_required");
      manualRequired += 1;
      continue;
    }
    const identity = obligation.purchaseType === "gift"
      ? `${obligation.orderId}-${obligation.checkoutAttempt}` : obligation.attemptId!;
    try {
      const refund = await stripe.refunds.create({
        ...(obligation.paymentIntentId
          ? { payment_intent: obligation.paymentIntentId }
          : { charge: obligation.chargeId! }),
        reason: "requested_by_customer",
        metadata: {
          late_payment_refund: "true",
          purchase_type: obligation.purchaseType,
          ...(obligation.orderId ? { gift_order_id: obligation.orderId } : {}),
          ...(obligation.attemptId ? { founder_checkout_attempt_id: obligation.attemptId } : {}),
        },
      }, { idempotencyKey: `late-payment-refund-${identity}` });
      if (refund.status === "succeeded") {
        await mark("automatic_succeeded");
        refunded += 1;
      } else if (refund.status === "failed" || refund.status === "canceled") {
        await mark("manual_required");
        manualRequired += 1;
      } else {
        await mark("automatic_pending");
        pending += 1;
      }
    } catch {
      // A transient Stripe/network failure keeps the durable obligation retryable.
      await mark("automatic_pending");
      pending += 1;
    }
  }
  return { ok: pending === 0 && manualRequired === 0, examined: obligations.length, refunded, pending, manualRequired };
}
