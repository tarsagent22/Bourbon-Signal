import "server-only";
import Stripe from "stripe";
import { isGiftPurchase } from "@/lib/gifts";
import { createGiftRepository } from "@/lib/gift-repository";
import { activateMembership, reactivateDirectFounderMembership, reactivateGiftMembershipIfEligible, revokeGiftMembershipIfCurrent, revokeDirectFounderMembershipIfCurrent } from "@/lib/membership-server";
import { DIRECT_STRIPE_PRICE_IDS } from "@/lib/stripe-plans";
import { reconcileReferredMembership } from "@/lib/referral-service";

function stringValue(value: unknown) {
  return typeof value === "string" ? value : null;
}

function orderIdFromMetadata(metadata: Stripe.Metadata | null | undefined) {
  return stringValue(metadata?.gift_order_id);
}

function checkoutAttemptFromMetadata(metadata: Stripe.Metadata | null | undefined) {
  const value = Number(metadata?.gift_checkout_attempt);
  return Number.isInteger(value) && value >= 0 ? value : null;
}

function directFounderAttemptFromMetadata(metadata: Stripe.Metadata | null | undefined) {
  return stringValue(metadata?.founder_checkout_attempt_id);
}

async function chargeForPaymentIntent(stripe: Stripe, paymentIntentId: string | null) {
  if (!paymentIntentId) return null;
  const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
  const chargeId = stringValue(paymentIntent.latest_charge);
  return chargeId ? stripe.charges.retrieve(chargeId) : null;
}

async function chargeForAdverseObject(stripe: Stripe, object: Stripe.Refund | Stripe.Dispute | Stripe.Charge) {
  if (object.object === "charge") return object;
  const chargeId = stringValue(object.charge);
  return chargeId ? stripe.charges.retrieve(chargeId) : null;
}

async function metadataForCharge(stripe: Stripe, charge: Stripe.Charge) {
  if (orderIdFromMetadata(charge.metadata) || directFounderAttemptFromMetadata(charge.metadata)) return charge.metadata;
  const paymentIntentId = stringValue(charge.payment_intent);
  if (!paymentIntentId) return charge.metadata;
  return (await stripe.paymentIntents.retrieve(paymentIntentId)).metadata;
}

async function refundAssessment(stripe: Stripe, object: Stripe.Refund | Stripe.Charge) {
  const charge = object.object === "charge" ? object : await chargeForAdverseObject(stripe, object);
  const amount = charge?.amount ?? null;
  const amountRefunded = charge?.amount_refunded ?? null;
  const succeeded = object.object === "charge" ? object.refunded === true : object.status === "succeeded";
  const fullRefund = succeeded && Boolean(charge?.refunded) && amount !== null && amountRefunded !== null && amountRefunded >= amount;
  const refundState = fullRefund
    ? "full"
    : object.object !== "charge" && object.status && object.status !== "succeeded"
      ? object.status
      : amountRefunded && amountRefunded > 0 ? "partial" : "pending";
  return { charge, fullRefund, refundState, amount, amountRefunded };
}

async function automaticallyRefundLatePayment(
  stripe: Stripe,
  paymentIntentId: string | null,
  idempotencyKey: string,
  metadata: Stripe.MetadataParam,
) {
  if (!paymentIntentId) return false;
  try {
    const refund = await stripe.refunds.create({ payment_intent: paymentIntentId, reason: "requested_by_customer", metadata }, { idempotencyKey });
    return refund.status === "succeeded" ? "succeeded" : "pending";
  } catch {
    return "pending";
  }
}

async function assertExactDirectFounderSession(stripe: Stripe, session: Stripe.Checkout.Session, attempt: Record<string, unknown>) {
  if (session.metadata?.source !== "bourbon_signal_launch"
    || session.metadata?.plan !== "bib_lifetime"
    || session.metadata?.tier !== "bottled-in-bond"
    || session.mode !== "payment"
    || stringValue(session.metadata?.founder_entitlement_version) !== stringValue(attempt.entitlement_version)
    || session.id !== stringValue(attempt.checkout_session_id)) {
    throw new Error("Direct Founder checkout session authority mismatch");
  }
  const lineItems = await stripe.checkout.sessions.listLineItems(session.id, { limit: 5 });
  if (lineItems.has_more || lineItems.data.length !== 1
    || lineItems.data[0]?.price?.id !== DIRECT_STRIPE_PRICE_IDS.bib_lifetime
    || lineItems.data[0]?.quantity !== 1) {
    throw new Error("Direct Founder checkout price mismatch");
  }
}

export async function handleGiftStripeEvent(stripe: Stripe, event: Stripe.Event) {
  const repository = createGiftRepository();
  if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
    const session = event.data.object as Stripe.Checkout.Session;
    if (!isGiftPurchase(session.metadata)) return false;
    const orderId = orderIdFromMetadata(session.metadata);
    const checkoutAttempt = checkoutAttemptFromMetadata(session.metadata);
    if (!orderId || checkoutAttempt === null) return true;
    if (session.payment_status !== "paid" && session.payment_status !== "no_payment_required") {
      await repository.recordEvent(orderId, event.id, "payment_waiting");
      return true;
    }
    const paymentIntentId = stringValue(session.payment_intent);
    const charge = await chargeForPaymentIntent(stripe, paymentIntentId);
    const funded = await repository.fund({
      orderId, stripeEventId: event.id, checkoutSessionId: session.id, checkoutAttempt,
      paymentIntentId, chargeId: charge?.id || null,
    });
    if (funded.latePayment) {
      const refunded = await automaticallyRefundLatePayment(stripe, paymentIntentId, `late-payment-refund-${orderId}-${checkoutAttempt}`, {
        purchase_type: "gift", gift_order_id: orderId, gift_checkout_attempt: String(checkoutAttempt), late_payment_refund: "true",
      });
      await repository.markLatePaymentRefundHandling(orderId, checkoutAttempt, refunded === "succeeded"
        ? "automatic_succeeded" : refunded === "pending" ? "automatic_pending" : "manual_required");
    }
    return true;
  }

  if (event.type === "payment_intent.succeeded") {
    const paymentIntent = event.data.object as Stripe.PaymentIntent;
    if (!isGiftPurchase(paymentIntent.metadata)) return false;
    const orderId = orderIdFromMetadata(paymentIntent.metadata);
    if (orderId) await repository.recordEvent(orderId, event.id, "payment_intent_succeeded_waiting_for_checkout_fence");
    return true;
  }

  if (event.type === "checkout.session.async_payment_failed" || event.type === "checkout.session.expired") {
    const session = event.data.object as Stripe.Checkout.Session;
    if (!isGiftPurchase(session.metadata)) return false;
    const orderId = orderIdFromMetadata(session.metadata);
    if (orderId) await repository.recordPaymentState({
      orderId, stripeEventId: event.id, eventType: event.type,
      status: event.type === "checkout.session.expired" ? "expired" : "failed",
      checkoutSessionId: session.id, checkoutAttempt: checkoutAttemptFromMetadata(session.metadata),
    });
    return true;
  }

  if (event.type === "payment_intent.payment_failed") {
    const paymentIntent = event.data.object as Stripe.PaymentIntent;
    if (!isGiftPurchase(paymentIntent.metadata)) return false;
    const orderId = orderIdFromMetadata(paymentIntent.metadata);
    if (orderId) await repository.recordPaymentState({
      orderId, stripeEventId: event.id, eventType: event.type, status: "failed",
      checkoutAttempt: checkoutAttemptFromMetadata(paymentIntent.metadata),
    });
    return true;
  }

  if (["charge.refunded", "refund.created", "refund.updated", "refund.failed"].includes(event.type)) {
    const object = event.data.object as Stripe.Charge | Stripe.Refund;
    const assessment = await refundAssessment(stripe, object);
    if (!assessment.charge) return false;
    const metadata = await metadataForCharge(stripe, assessment.charge);
    const reference = assessment.charge.id;
    const orderId = orderIdFromMetadata(metadata) || (await repository.findByStripeReference(reference))?.id || null;
    if (!orderId) return false;
    const paymentAttempt = await repository.findGiftPaymentAttempt(reference);
    const order = await repository.readById(orderId);
    const paymentIsNotCurrentAttempt = paymentAttempt && order && (
      Number(paymentAttempt.checkout_attempt) !== order.checkoutAttempt
      || stringValue(paymentAttempt.checkout_session_id) !== order.stripeCheckoutSessionId
    );
    if (paymentIsNotCurrentAttempt || paymentAttempt?.status === "late_payment" || paymentAttempt?.refund_handling) {
      await repository.recordEvent(orderId, event.id, `late_payment_refund_${assessment.refundState}`);
      if (assessment.fullRefund) await repository.markLatePaymentRefundHandling(orderId, Number(paymentAttempt.checkout_attempt), "automatic_succeeded");
      return true;
    }
    const adverseOrder = await repository.recordRefundEvent({
      orderId, stripeEventId: event.id, eventType: `refund_${assessment.refundState}`,
      fullRefund: assessment.fullRefund, refundState: assessment.refundState,
      amountRefunded: assessment.amountRefunded, amount: assessment.amount,
    });
    if (adverseOrder && !adverseOrder.adverseReconciledAt) {
      const certain = await revokeGiftMembershipIfCurrent(adverseOrder);
      if (certain && !await repository.markAdverseReconciled(adverseOrder.id, adverseOrder.updatedAt)) {
        throw new Error("Gift refund state changed during revocation");
      }
    }
    return true;
  }

  if (event.type === "charge.dispute.created" || event.type === "charge.dispute.closed") {
    const dispute = event.data.object as Stripe.Dispute;
    const charge = await chargeForAdverseObject(stripe, dispute);
    if (!charge) return false;
    const metadata = await metadataForCharge(stripe, charge);
    const orderId = orderIdFromMetadata(metadata) || (await repository.findByStripeReference(charge.id))?.id || null;
    if (!orderId) return false;
    const [paymentAttempt, currentOrder] = await Promise.all([
      repository.findGiftPaymentAttempt(charge.id), repository.readById(orderId),
    ]);
    if (paymentAttempt && currentOrder && (
      Number(paymentAttempt.checkout_attempt) !== currentOrder.checkoutAttempt
      || stringValue(paymentAttempt.checkout_session_id) !== currentOrder.stripeCheckoutSessionId
    )) {
      await repository.recordEvent(orderId, event.id, "late_payment_dispute_manual_review");
      return true;
    }
    const state: "open" | "won" | "lost" = event.type === "charge.dispute.created"
      ? "open" : dispute.status === "won" ? "won" : "lost";
    const order = await repository.recordDisputeEvent({ orderId, stripeEventId: event.id, state });
    if (order && !order.adverseReconciledAt) {
      const certain = order.disputeStatus === "won" && !order.refundedAt && !order.disputedAt
        ? await reactivateGiftMembershipIfEligible(order)
        : await revokeGiftMembershipIfCurrent(order);
      if (certain && !await repository.markAdverseReconciled(order.id, order.updatedAt)) {
        const current = await repository.readForAdverseReconciliation(order.id);
        if (current && !await repository.giftOwnsEffectiveAccess(current.id, current.entitlementVersion)) {
          await revokeGiftMembershipIfCurrent(current);
        }
        throw new Error("Gift dispute state changed during reconciliation");
      }
    }
    return true;
  }

  return false;
}

export async function handleDirectFounderStripeEvent(stripe: Stripe, event: Stripe.Event) {
  const repository = createGiftRepository();
  if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
    const session = event.data.object as Stripe.Checkout.Session;
    const attemptId = directFounderAttemptFromMetadata(session.metadata);
    if (!attemptId) return false;
    const userId = stringValue(session.metadata?.userId) || stringValue(session.client_reference_id);
    if (!userId) throw new Error("Direct Founder checkout user is unavailable");
    const attempt = await repository.readDirectFounderAttempt(attemptId);
    if (!attempt || stringValue(attempt.user_id) !== userId) throw new Error("Direct Founder checkout attempt is unavailable");
    await assertExactDirectFounderSession(stripe, session, attempt);
    if (session.payment_status !== "paid" && session.payment_status !== "no_payment_required") return true;
    const paymentIntentId = stringValue(session.payment_intent);
    const charge = await chargeForPaymentIntent(stripe, paymentIntentId);
    const completion = await repository.completeDirectFounderCheckout({
      userId, attemptId, checkoutSessionId: session.id, paymentIntentId, chargeId: charge?.id || null,
    });
    if (completion?.latePayment) {
      const refunded = await automaticallyRefundLatePayment(stripe, paymentIntentId, `late-payment-refund-${attemptId}`, {
        founder_checkout_attempt_id: attemptId, late_payment_refund: "true",
      });
      await repository.markDirectLatePaymentRefundHandling(attemptId, refunded === "succeeded"
        ? "automatic_succeeded" : refunded === "pending" ? "automatic_pending" : "manual_required");
      return true;
    }
    if (!completion) throw new Error("Direct Founder checkout completion failed");
    if (!await repository.directFounderOwnsEffectiveAccess(attemptId, completion.entitlementVersion)) return true;
    try {
      await activateMembership(userId, {
        tier: "bottled-in-bond",
        plan: "bib_lifetime",
        stripeCustomerId: stringValue(session.customer),
        status: "lifetime",
        founderCheckoutAttemptId: attemptId,
        checkoutSessionId: session.id,
        stripePaymentIntentId: paymentIntentId,
        stripeChargeId: charge?.id || null,
      });
      await repository.markDirectFounderActivationReconciled(attemptId);
      await reconcileReferredMembership({ userId, tier: "bottled-in-bond", sourceEventId: event.id });
    } catch (error) {
      await repository.recordDirectFounderActivationError(attemptId, error).catch(() => undefined);
      throw error;
    }
    return true;
  }

  if (event.type === "checkout.session.expired" || event.type === "checkout.session.async_payment_failed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const attemptId = directFounderAttemptFromMetadata(session.metadata);
    const userId = stringValue(session.metadata?.userId) || stringValue(session.client_reference_id);
    if (!attemptId || !userId) return false;
    await repository.releaseDirectFounderReservation(userId, attemptId, session.id, event.type.endsWith("failed") ? "failed" : "expired");
    return true;
  }

  if (!["charge.refunded", "refund.created", "refund.updated", "refund.failed", "charge.dispute.created", "charge.dispute.closed"].includes(event.type)) return false;
  const object = event.data.object as Stripe.Charge | Stripe.Refund | Stripe.Dispute;
  const charge = await chargeForAdverseObject(stripe, object);
  if (!charge) return false;
  const metadata = await metadataForCharge(stripe, charge);
  const attemptId = directFounderAttemptFromMetadata(metadata)
    || stringValue((await repository.findDirectFounderByStripeReference(charge.id))?.attempt_id);
  if (!attemptId) return false;

  if (event.type.startsWith("charge.dispute")) {
    const dispute = object as Stripe.Dispute;
    const state: "open" | "won" | "lost" = event.type === "charge.dispute.created"
      ? "open" : dispute.status === "won" ? "won" : "lost";
    await repository.recordDirectFounderDispute({ attemptId, stripeEventId: event.id, state });
    if (state !== "won") {
      await revokeDirectFounderMembershipIfCurrent(attemptId);
    } else {
      try {
        if (!await reactivateDirectFounderMembership(attemptId)) throw new Error("Direct Founder purchase is not eligible for reactivation");
        await repository.markDirectFounderActivationReconciled(attemptId);
      } catch (error) {
        await repository.recordDirectFounderActivationError(attemptId, error).catch(() => undefined);
        throw error;
      }
    }
    return true;
  }

  const assessment = await refundAssessment(stripe, object as Stripe.Charge | Stripe.Refund);
  await repository.recordDirectFounderRefund({ attemptId, stripeEventId: event.id, fullRefund: assessment.fullRefund, refundState: assessment.refundState });
  if (assessment.fullRefund) await revokeDirectFounderMembershipIfCurrent(attemptId);
  return true;
}
