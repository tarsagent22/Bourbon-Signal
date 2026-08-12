import "server-only";
import { randomBytes, randomUUID } from "node:crypto";
import { createRuntimeNeonClient } from "@/lib/neon-runtime";
import { GIFT_PLANS, type GiftPlanId, type NormalizedGiftOrderInput } from "@/lib/gifts";
import { constantTimeTokenHashMatches, currentGiftRedemptionKeyVersion, giftRedemptionKeys, giftRedemptionToken, giftRedemptionTokenHash } from "@/lib/gift-tokens";

export { constantTimeTokenHashMatches, currentGiftRedemptionKeyVersion, giftRedemptionToken, giftRedemptionTokenHash } from "@/lib/gift-tokens";

export type GiftOrderRecord = {
  id: string;
  purchaserUserId: string;
  purchaserEmail: string;
  purchaserName: string | null;
  recipientEmail: string;
  recipientName: string;
  message: string | null;
  giftPlan: GiftPlanId;
  giftTier: "standard" | "barrel" | "bottled-in-bond";
  deliveryMode: "now" | "scheduled";
  scheduledDeliveryAt: string | null;
  deliveryTimezone: string | null;
  paymentStatus: string;
  stripeCheckoutSessionId: string | null;
  stripePaymentIntentId: string | null;
  stripeChargeId: string | null;
  redemptionTokenKeyVersion: string | null;
  entitlementVersion: string | null;
  checkoutAttempt: number;
  redeemedByUserId: string | null;
  redeemedAt: string | null;
  accessStartsAt: string | null;
  accessExpiresAt: string | null;
  deliveryStatus: string;
  deliveryClaimToken: string | null;
  deliveryIdempotencyKey: string | null;
  deliveryProviderMessageId: string | null;
  founderNumber: number | null;
  fundedAt: string | null;
  refundedAt: string | null;
  disputedAt: string | null;
  disputeStatus: "open" | "won" | "lost" | null;
  riskFlag: string | null;
  expiryReconciledAt: string | null;
  adverseReconciledAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type DirectFounderOwnership = {
  attemptId: string;
  userId: string;
  founderNumber: number;
  entitlementVersion: string;
  checkoutSessionId: string | null;
  stripePaymentIntentId: string | null;
  stripeChargeId: string | null;
  status: string;
  disputeStatus: "open" | "won" | "lost" | null;
};

type Row = Record<string, unknown>;

function text(value: unknown) {
  return typeof value === "string" ? value : value instanceof Date ? value.toISOString() : String(value || "");
}

function nullableText(value: unknown) {
  const valueText = text(value).trim();
  return valueText || null;
}

function rowToGift(row: Row): GiftOrderRecord {
  return {
    id: text(row.id),
    purchaserUserId: text(row.purchaser_user_id),
    purchaserEmail: text(row.purchaser_email),
    purchaserName: nullableText(row.purchaser_name),
    recipientEmail: text(row.recipient_email),
    recipientName: text(row.recipient_name),
    message: nullableText(row.gift_message),
    giftPlan: text(row.gift_plan) as GiftPlanId,
    giftTier: text(row.gift_tier) as GiftOrderRecord["giftTier"],
    deliveryMode: row.delivery_mode === "scheduled" ? "scheduled" : "now",
    scheduledDeliveryAt: nullableText(row.scheduled_delivery_at),
    deliveryTimezone: nullableText(row.delivery_timezone),
    paymentStatus: text(row.payment_status),
    stripeCheckoutSessionId: nullableText(row.stripe_checkout_session_id),
    stripePaymentIntentId: nullableText(row.stripe_payment_intent_id),
    stripeChargeId: nullableText(row.stripe_charge_id),
    redemptionTokenKeyVersion: nullableText(row.redemption_token_key_version),
    entitlementVersion: nullableText(row.entitlement_version),
    checkoutAttempt: Number.isInteger(Number(row.checkout_attempt)) ? Number(row.checkout_attempt) : 0,
    redeemedByUserId: nullableText(row.redeemed_by_user_id),
    redeemedAt: nullableText(row.redeemed_at),
    accessStartsAt: nullableText(row.access_starts_at),
    accessExpiresAt: nullableText(row.access_expires_at),
    deliveryStatus: text(row.delivery_status),
    deliveryClaimToken: nullableText(row.delivery_claim_token),
    deliveryIdempotencyKey: nullableText(row.delivery_idempotency_key),
    deliveryProviderMessageId: nullableText(row.delivery_provider_message_id),
    founderNumber: Number.isInteger(Number(row.founder_number)) ? Number(row.founder_number) : null,
    fundedAt: nullableText(row.funded_at),
    refundedAt: nullableText(row.refunded_at),
    disputedAt: nullableText(row.disputed_at),
    disputeStatus: nullableText(row.dispute_status) as GiftOrderRecord["disputeStatus"],
    riskFlag: nullableText(row.risk_flag),
    expiryReconciledAt: nullableText(row.expiry_reconciled_at),
    adverseReconciledAt: nullableText(row.adverse_reconciled_at),
    createdAt: text(row.created_at),
    updatedAt: text(row.updated_at),
  };
}

function claimToken() {
  return randomBytes(32).toString("hex");
}

function rowToDirectFounder(row: Row): DirectFounderOwnership {
  return {
    attemptId: text(row.attempt_id),
    userId: text(row.user_id),
    founderNumber: Number(row.founder_number),
    entitlementVersion: text(row.entitlement_version),
    checkoutSessionId: nullableText(row.checkout_session_id),
    stripePaymentIntentId: nullableText(row.stripe_payment_intent_id),
    stripeChargeId: nullableText(row.stripe_charge_id),
    status: text(row.status),
    disputeStatus: nullableText(row.dispute_status) as DirectFounderOwnership["disputeStatus"],
  };
}

export class GiftRepository {
  private readonly sql;

  constructor(sql = createRuntimeNeonClient()) {
    this.sql = sql;
  }

  async createPending(input: {
    purchaserRequestId: string;
    purchaserUserId: string;
    purchaserEmail: string;
    order: NormalizedGiftOrderInput;
  }) {
    const id = `gift_${randomUUID()}`;
    const plan = GIFT_PLANS[input.order.plan];
    const rows = await this.sql.query(
      `INSERT INTO gift_orders (
         id, purchaser_request_id, purchaser_user_id, purchaser_email, purchaser_name,
         recipient_email, recipient_name, gift_message, gift_plan, gift_tier, delivery_mode,
         scheduled_local_datetime, scheduled_delivery_at, delivery_timezone
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       ON CONFLICT (purchaser_user_id, purchaser_request_id) DO UPDATE SET updated_at = gift_orders.updated_at
       RETURNING *`,
      [id, input.purchaserRequestId, input.purchaserUserId, input.purchaserEmail, input.order.purchaserName,
        input.order.recipientEmail, input.order.recipientName, input.order.message, plan.id, plan.tier,
        input.order.deliveryMode, input.order.scheduledLocalDateTime, input.order.scheduledDeliveryAt, input.order.deliveryTimezone],
    ) as Row[];
    return rowToGift(rows[0]);
  }

  async readForPurchaser(orderId: string, purchaserUserId: string) {
    const rows = await this.sql.query(
      `SELECT orders.*, reservations.founder_number FROM gift_orders orders
       LEFT JOIN founder_spot_reservations reservations ON reservations.gift_order_id = orders.id
       WHERE orders.id = $1 AND orders.purchaser_user_id = $2 LIMIT 1`, [orderId, purchaserUserId],
    ) as Row[];
    return rows[0] ? rowToGift(rows[0]) : null;
  }

  async readById(orderId: string) {
    const rows = await this.sql.query(
      `SELECT orders.*, reservations.founder_number FROM gift_orders orders
       LEFT JOIN founder_spot_reservations reservations ON reservations.gift_order_id = orders.id
       WHERE orders.id = $1 LIMIT 1`, [orderId],
    ) as Row[];
    return rows[0] ? rowToGift(rows[0]) : null;
  }

  async readForAdverseReconciliation(orderId: string) {
    const rows = await this.sql.query(
      `SELECT orders.*, reservations.founder_number,
         COALESCE(orders.redeemed_by_user_id, claims.user_id) AS redeemed_by_user_id,
         COALESCE(orders.redeemed_by_email, claims.verified_email) AS redeemed_by_email
       FROM gift_orders orders
       LEFT JOIN founder_spot_reservations reservations ON reservations.gift_order_id = orders.id
       LEFT JOIN gift_redemption_recipients claims ON claims.gift_order_id = orders.id
       WHERE orders.id = $1 LIMIT 1`, [orderId],
    ) as Row[];
    return rows[0] ? rowToGift(rows[0]) : null;
  }

  async readForRedemptionToken(token: string) {
    const candidates = giftRedemptionKeys().map((key) => ({ version: key.version, hash: giftRedemptionTokenHash(token, process.env, key.version) }));
    const rows = await this.sql.query(
      `SELECT orders.*, reservations.founder_number FROM gift_orders orders
       LEFT JOIN founder_spot_reservations reservations ON reservations.gift_order_id = orders.id
       WHERE orders.redemption_token_hash = ANY($1::text[]) LIMIT 1`, [candidates.map((candidate) => candidate.hash)],
    ) as Row[];
    if (!rows[0]) return null;
    const order = rowToGift(rows[0]);
    const candidate = candidates.find((item) => item.version === (order.redemptionTokenKeyVersion || "v1"));
    return candidate && constantTimeTokenHashMatches(candidate.hash, text(rows[0].redemption_token_hash)) ? order : null;
  }

  async findByStripeReference(reference: string) {
    const rows = await this.sql.query(
      `SELECT orders.*, reservations.founder_number FROM gift_orders orders
       LEFT JOIN founder_spot_reservations reservations ON reservations.gift_order_id = orders.id
       LEFT JOIN gift_payment_attempts attempts ON attempts.gift_order_id = orders.id
       WHERE orders.stripe_checkout_session_id = $1 OR orders.stripe_payment_intent_id = $1 OR orders.stripe_charge_id = $1
         OR attempts.checkout_session_id = $1 OR attempts.stripe_payment_intent_id = $1 OR attempts.stripe_charge_id = $1
       LIMIT 1`, [reference],
    ) as Row[];
    return rows[0] ? rowToGift(rows[0]) : null;
  }

  async findGiftPaymentAttempt(reference: string) {
    const rows = await this.sql.query(
      `SELECT * FROM gift_payment_attempts WHERE checkout_session_id = $1
        OR stripe_payment_intent_id = $1 OR stripe_charge_id = $1 LIMIT 1`, [reference],
    ) as Row[];
    return rows[0] || null;
  }

  async recordEvent(orderId: string, stripeEventId: string, eventType: string) {
    await this.sql.query(
      `INSERT INTO gift_order_events (gift_order_id, stripe_event_id, event_key, event_type)
       VALUES ($1,$2,'stripe:' || $2,$3) ON CONFLICT DO NOTHING`, [orderId, stripeEventId, eventType],
    );
  }

  async claimCheckout(orderId: string, purchaserUserId: string) {
    const token = claimToken();
    const rows = await this.sql.query(
      `UPDATE gift_orders SET checkout_claim_token = $3, checkout_claimed_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND purchaser_user_id = $2 AND payment_status IN ('pending', 'checkout_open')
         AND (checkout_claimed_at IS NULL OR checkout_claimed_at < NOW() - INTERVAL '15 minutes' OR stripe_checkout_session_id IS NOT NULL)
       RETURNING *`, [orderId, purchaserUserId, token],
    ) as Row[];
    return rows[0] ? { order: rowToGift(rows[0]), claimToken: token } : null;
  }

  async claimFounderCheckout(orderId: string, purchaserUserId: string) {
    const token = claimToken();
    const rows = await this.sql.query(`SELECT * FROM claim_founder_gift_checkout($1,$2,$3)`, [orderId, purchaserUserId, token]) as Row[];
    if (!rows[0]) return null;
    const order = await this.readForPurchaser(orderId, purchaserUserId);
    return order ? { order, claimToken: token, founderNumber: Number(rows[0].founder_number) } : null;
  }

  async attachCheckout(orderId: string, purchaserUserId: string, claim: string, sessionId: string) {
    const results = await this.sql.transaction((transaction) => [
      transaction.query(
        `UPDATE gift_orders SET stripe_checkout_session_id = $4, payment_status = 'checkout_open', checkout_claim_token = NULL, checkout_claimed_at = NULL, updated_at = NOW()
         WHERE id = $1 AND purchaser_user_id = $2 AND checkout_claim_token = $3
           AND stripe_checkout_session_id IS NULL AND payment_status IN ('pending', 'checkout_open')
         RETURNING *`, [orderId, purchaserUserId, claim, sessionId],
      ),
      transaction.query(
        `INSERT INTO gift_payment_attempts (gift_order_id, checkout_attempt, checkout_session_id)
         SELECT id, checkout_attempt, $4 FROM gift_orders
         WHERE id = $1 AND purchaser_user_id = $2 AND stripe_checkout_session_id = $4
         ON CONFLICT (gift_order_id, checkout_attempt) DO NOTHING`, [orderId, purchaserUserId, claim, sessionId],
      ),
    ], { isolationLevel: "Serializable" }) as Row[][];
    return results[0]?.[0] ? rowToGift(results[0][0]) : null;
  }

  async restartExpiredCheckout(orderId: string, purchaserUserId: string, expiredSessionId: string) {
    const rows = await this.sql.query(
      `WITH eligible AS (
         SELECT id FROM gift_orders WHERE id = $1 AND purchaser_user_id = $2
           AND stripe_checkout_session_id = $3 AND payment_status = 'checkout_open' FOR UPDATE
       ), released AS (
         SELECT revoke_founder_gift_reservation($1) FROM eligible
       )
       UPDATE gift_orders SET stripe_checkout_session_id = NULL, checkout_claim_token = NULL, checkout_claimed_at = NULL,
         checkout_attempt = checkout_attempt + 1, payment_status = 'pending', updated_at = NOW()
       FROM eligible, released WHERE gift_orders.id = eligible.id
       RETURNING *`, [orderId, purchaserUserId, expiredSessionId],
    ) as Row[];
    return rows[0] ? rowToGift(rows[0]) : null;
  }

  async restartTerminatedCheckout(orderId: string, purchaserUserId: string) {
    const rows = await this.sql.query(
      `UPDATE gift_orders SET payment_status = 'pending', checkout_claim_token = NULL, checkout_claimed_at = NULL, updated_at = NOW()
       WHERE id = $1 AND purchaser_user_id = $2 AND payment_status IN ('expired','failed') AND stripe_checkout_session_id IS NULL
       RETURNING *`, [orderId, purchaserUserId],
    ) as Row[];
    return rows[0] ? rowToGift(rows[0]) : null;
  }

  async releaseCheckoutClaim(orderId: string, purchaserUserId: string, token: string) {
    await this.sql.transaction((transaction) => [
      transaction.query(
        `UPDATE gift_orders SET checkout_claim_token = NULL, checkout_claimed_at = NULL, updated_at = NOW()
         WHERE id = $1 AND purchaser_user_id = $2 AND checkout_claim_token = $3 AND stripe_checkout_session_id IS NULL`,
        [orderId, purchaserUserId, token],
      ),
      transaction.query(
        `SELECT revoke_founder_gift_reservation($1) WHERE EXISTS (
           SELECT 1 FROM gift_orders WHERE id = $1 AND purchaser_user_id = $2
             AND checkout_claim_token IS NULL AND stripe_checkout_session_id IS NULL AND payment_status IN ('pending','failed','expired')
         )`, [orderId, purchaserUserId],
      ),
    ], { isolationLevel: "Serializable" });
  }

  async fund(input: { orderId: string; stripeEventId: string; checkoutSessionId: string; checkoutAttempt: number; paymentIntentId: string | null; chargeId: string | null }) {
    const keyVersion = currentGiftRedemptionKeyVersion();
    const rawToken = giftRedemptionToken(input.orderId, process.env, keyVersion);
    const tokenHash = giftRedemptionTokenHash(rawToken, process.env, keyVersion);
    const rows = await this.sql.query(
      `SELECT * FROM fund_gift_order($1,$2,$3,$4,$5,$6,$7,$8)`,
      [input.orderId, input.stripeEventId, input.checkoutSessionId, input.paymentIntentId, input.chargeId, tokenHash, keyVersion, input.checkoutAttempt],
    ) as Row[];
    return { newlyFunded: rows[0]?.newly_funded === true, founderNumber: Number(rows[0]?.founder_number) || null, latePayment: rows[0]?.late_payment === true };
  }

  async recordPaymentState(input: { orderId: string; stripeEventId: string; eventType: string; status: "failed" | "expired"; checkoutSessionId?: string | null; checkoutAttempt?: number | null }) {
    await this.sql.transaction((transaction) => [
      transaction.query(
        `INSERT INTO gift_order_events (gift_order_id, stripe_event_id, event_key, event_type)
         VALUES ($1,$2,'stripe:' || $2,$3) ON CONFLICT DO NOTHING`, [input.orderId, input.stripeEventId, input.eventType],
      ),
      transaction.query(
        `WITH updated AS (
           UPDATE gift_orders SET payment_status = $3, stripe_checkout_session_id = NULL,
             checkout_claim_token = NULL, checkout_claimed_at = NULL, checkout_attempt = checkout_attempt + 1, updated_at = NOW()
           WHERE id = $1 AND payment_status IN ('pending','checkout_open')
             AND ($4::TEXT IS NULL OR stripe_checkout_session_id = $4)
             AND ($5::INTEGER IS NULL OR checkout_attempt = $5)
             AND EXISTS (SELECT 1 FROM gift_order_events WHERE stripe_event_id = $2 AND gift_order_id = $1)
           RETURNING id
         ), released AS (
           SELECT revoke_founder_gift_reservation(id) FROM updated
         )
         SELECT updated.id FROM updated LEFT JOIN released ON TRUE`,
        [input.orderId, input.stripeEventId, input.status, input.checkoutSessionId || null, input.checkoutAttempt ?? null],
      ),
    ], { isolationLevel: "Serializable" });
  }

  async recordRefundEvent(input: { orderId: string; stripeEventId: string; eventType: string; fullRefund: boolean; refundState: string; amountRefunded?: number | null; amount?: number | null }) {
    const rows = await this.sql.query(
      `SELECT * FROM record_gift_refund($1,$2,$3,$4,$5,$6,$7)`,
      [input.orderId, input.stripeEventId, input.eventType, input.fullRefund, input.refundState,
        input.amountRefunded ?? null, input.amount ?? null],
    ) as Row[];
    return input.fullRefund && rows[0] ? this.readForAdverseReconciliation(input.orderId) : null;
  }

  async recordDisputeEvent(input: { orderId: string; stripeEventId: string; state: "open" | "won" | "lost" }) {
    const rows = await this.sql.query(
      `SELECT disputed.*, reservations.founder_number,
         COALESCE(disputed.redeemed_by_user_id, claims.user_id) AS redeemed_by_user_id,
         COALESCE(disputed.redeemed_by_email, claims.verified_email) AS redeemed_by_email
       FROM record_gift_dispute($1,$2,$3) disputed
       LEFT JOIN founder_spot_reservations reservations ON reservations.gift_order_id = disputed.id
       LEFT JOIN gift_redemption_recipients claims ON claims.gift_order_id = disputed.id`,
      [input.orderId, input.stripeEventId, input.state],
    ) as Row[];
    return rows[0] ? rowToGift(rows[0]) : null;
  }

  async markLatePaymentRefundHandling(orderId: string, checkoutAttempt: number, handling: "automatic_pending" | "automatic_succeeded" | "manual_required") {
    await this.sql.query(
      `UPDATE gift_payment_attempts SET refund_handling = $3,
         status = CASE WHEN $3 = 'automatic_succeeded' THEN 'refunded' ELSE status END, updated_at = NOW()
       WHERE gift_order_id = $1 AND checkout_attempt = $2`, [orderId, checkoutAttempt, handling],
    );
  }

  async claimRedemption(input: { order: GiftOrderRecord; token: string; userId: string; verifiedEmail: string }) {
    const version = input.order.redemptionTokenKeyVersion || "v1";
    const hash = giftRedemptionTokenHash(input.token, process.env, version);
    const token = claimToken();
    const rows = await this.sql.query(
      `SELECT claimed.*, reservations.founder_number, claims.claim_token AS durable_claim_token,
         claims.status AS durable_claim_status, claims.activation_started_at AS durable_activation_started_at
       FROM claim_gift_redemption($1,$2,$3,$4,$5) claimed
       LEFT JOIN founder_spot_reservations reservations ON reservations.gift_order_id = claimed.id
       JOIN gift_redemption_recipients claims ON claims.gift_order_id = claimed.id`,
      [input.order.id, hash, input.userId, input.verifiedEmail, token],
    ) as Row[];
    return rows[0] ? {
      order: rowToGift(rows[0]), claimToken: text(rows[0].durable_claim_token),
      claimStatus: text(rows[0].durable_claim_status), activationStartedAt: nullableText(rows[0].durable_activation_started_at),
    } : null;
  }

  async recoverStaleRedemptionClaim(userId: string, verifiedEmail: string) {
    await this.sql.transaction((transaction) => [
      transaction.query(
        `UPDATE gift_redemption_recipients SET status = 'abandoned', updated_at = NOW()
         WHERE user_id = $1 AND verified_email = LOWER($2) AND status = 'claimed'
           AND claimed_at < NOW() - INTERVAL '30 minutes' RETURNING gift_order_id, claim_token`, [userId, verifiedEmail],
      ),
      transaction.query(
        `DELETE FROM gift_recipient_locks WHERE lock_key IN ('user:' || $1, 'email:' || LOWER($2))
           AND locked_until <= NOW()`, [userId, verifiedEmail],
      ),
    ], { isolationLevel: "Serializable" });
  }

  async releaseRedemptionClaim(userId: string, orderId: string, claim: string) {
    await this.sql.transaction((transaction) => [
      transaction.query(
        `UPDATE gift_redemption_recipients SET status = 'abandoned', updated_at = NOW()
         WHERE user_id = $1 AND gift_order_id = $2 AND claim_token = $3 AND status = 'claimed'`, [userId, orderId, claim],
      ),
      transaction.query(
        `DELETE FROM gift_recipient_locks WHERE gift_order_id = $2 AND claim_token = $3
          AND EXISTS (SELECT 1 FROM gift_redemption_recipients WHERE user_id = $1 AND gift_order_id = $2
            AND claim_token = $3 AND status = 'abandoned')`, [userId, orderId, claim],
      ),
    ], { isolationLevel: "Serializable" });
  }

  async beginRedemptionActivation(input: { orderId: string; userId: string; verifiedEmail: string; claimToken: string }) {
    const rows = await this.sql.query(
      `SELECT begin_gift_redemption_activation($1,$2,$3,$4) AS started`,
      [input.orderId, input.userId, input.verifiedEmail, input.claimToken],
    ) as Row[];
    return rows[0]?.started === true;
  }

  async authorizeGiftActivation(input: { orderId: string; userId: string; verifiedEmail: string; claimToken: string }) {
    const rows = await this.sql.query(
      `SELECT authorized.*, reservations.founder_number FROM authorize_gift_activation($1,$2,$3,$4) authorized
       LEFT JOIN founder_spot_reservations reservations ON reservations.gift_order_id = authorized.id`,
      [input.orderId, input.userId, input.verifiedEmail, input.claimToken],
    ) as Row[];
    return rows[0] ? rowToGift(rows[0]) : null;
  }

  async recordActivationError(orderId: string, claim: string, error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    await this.sql.query(
      `UPDATE gift_redemption_recipients SET last_activation_error = LEFT($3, 500), updated_at = NOW()
       WHERE gift_order_id = $1 AND claim_token = $2 AND status = 'activation_started'`, [orderId, claim, message],
    );
  }

  async listStaleActivationClaims(limit = 50) {
    const rows = await this.sql.query(
      `SELECT orders.*, reservations.founder_number, claims.user_id AS claim_user_id,
         claims.verified_email AS claim_verified_email, claims.claim_token AS durable_claim_token
       FROM gift_redemption_recipients claims
       JOIN gift_orders orders ON orders.id = claims.gift_order_id
       LEFT JOIN founder_spot_reservations reservations ON reservations.gift_order_id = orders.id
       WHERE claims.status = 'activation_started'
         AND claims.activation_started_at < NOW() - INTERVAL '5 minutes'
       ORDER BY claims.activation_started_at, claims.gift_order_id LIMIT $1`, [limit],
    ) as Row[];
    return rows.map((row) => ({
      order: rowToGift(row), userId: text(row.claim_user_id), verifiedEmail: text(row.claim_verified_email), claimToken: text(row.durable_claim_token),
    }));
  }

  async abandonAdverseClaim(orderId: string) {
    const rows = await this.sql.query(`SELECT abandon_adverse_gift_claim($1) AS abandoned`, [orderId]) as Row[];
    return rows[0]?.abandoned === true;
  }

  async finalizeRedemption(input: { orderId: string; userId: string; verifiedEmail: string; claimToken: string; redeemedAt?: string }) {
    const rows = await this.sql.query(
      `SELECT redeemed.*, reservations.founder_number FROM finalize_gift_redemption($1,$2,$3,$4,$5) redeemed
       LEFT JOIN founder_spot_reservations reservations ON reservations.gift_order_id = redeemed.id`,
      [input.orderId, input.userId, input.verifiedEmail, input.claimToken, input.redeemedAt || new Date().toISOString()],
    ) as Row[];
    return rows[0] ? rowToGift(rows[0]) : null;
  }

  async claimDueDeliveries(limit = 25) {
    const token = claimToken();
    const rows = await this.sql.query(`SELECT claimed.*, reservations.founder_number FROM claim_due_gift_deliveries($1,$2) claimed LEFT JOIN founder_spot_reservations reservations ON reservations.gift_order_id = claimed.id`, [token, limit]) as Row[];
    return rows.map((row) => rowToGift({ ...row, delivery_claim_token: token }));
  }

  async listDueDeliveryPreview(limit = 25) {
    const rows = await this.sql.query(
      `SELECT orders.*, reservations.founder_number FROM gift_orders orders
       LEFT JOIN founder_spot_reservations reservations ON reservations.gift_order_id = orders.id
       WHERE orders.payment_status = 'funded' AND orders.refunded_at IS NULL AND orders.disputed_at IS NULL AND orders.redeemed_at IS NULL
         AND orders.delivery_provider_message_id IS NULL
         AND COALESCE(orders.scheduled_delivery_at, orders.funded_at) <= NOW()
       ORDER BY COALESCE(orders.scheduled_delivery_at, orders.funded_at), orders.id LIMIT $1`, [limit],
    ) as Row[];
    return rows.map(rowToGift);
  }

  async releaseDeliveryClaim(orderId: string, token: string) {
    await this.sql.query(
      `UPDATE gift_orders SET delivery_status = 'failed', delivery_claimed_at = NULL, delivery_claim_token = NULL, updated_at = NOW()
       WHERE id = $1 AND delivery_claim_token = $2 AND delivery_provider_message_id IS NULL
         AND payment_status = 'funded' AND refunded_at IS NULL AND disputed_at IS NULL
         AND redeemed_at IS NULL`, [orderId, token],
    );
  }

  async authorizeDeliverySend(orderId: string, token: string) {
    const rows = await this.sql.query(
      `SELECT authorized.*, reservations.founder_number FROM authorize_gift_delivery_send($1,$2) authorized
       LEFT JOIN founder_spot_reservations reservations ON reservations.gift_order_id = authorized.id`,
      [orderId, token],
    ) as Row[];
    return rows[0] ? rowToGift(rows[0]) : null;
  }

  async suppressUnauthorizedDeliveryClaim(orderId: string, token: string) {
    await this.sql.query(
      `UPDATE gift_orders SET delivery_status = 'suppressed', delivery_claimed_at = NULL,
         delivery_claim_token = NULL, updated_at = NOW()
       WHERE id = $1 AND delivery_claim_token = $2 AND delivery_provider_message_id IS NULL
         AND (payment_status <> 'funded' OR refunded_at IS NOT NULL OR disputed_at IS NOT NULL OR redeemed_at IS NOT NULL)`,
      [orderId, token],
    );
  }

  async markDelivered(orderId: string, token: string, providerMessageId: string) {
    const rows = await this.sql.query(
      `UPDATE gift_orders SET delivery_status = 'delivered', delivery_provider_message_id = $3, delivered_at = NOW(), delivery_claimed_at = NULL, delivery_claim_token = NULL, updated_at = NOW()
       WHERE id = $1 AND delivery_claim_token = $2 AND delivery_status = 'sending'
         AND delivery_provider_message_id IS NULL AND payment_status = 'funded'
         AND refunded_at IS NULL AND disputed_at IS NULL AND redeemed_at IS NULL
       RETURNING id`, [orderId, token, providerMessageId],
    ) as Row[];
    return rows.length === 1;
  }

  async listExpiredAnnualAccess(limit = 100) {
    const rows = await this.sql.query(
      `SELECT * FROM gift_orders WHERE redeemed_at IS NOT NULL AND access_expires_at <= NOW() AND expiry_reconciled_at IS NULL
       AND gift_plan IN ('standard_annual_gift','barrel_annual_gift') ORDER BY access_expires_at LIMIT $1`, [limit],
    ) as Row[];
    return rows.map(rowToGift);
  }

  async markExpiryReconciled(orderId: string, expectedUpdatedAt: string) {
    await this.sql.query(`UPDATE gift_orders SET expiry_reconciled_at = NOW() WHERE id = $1 AND updated_at = $2 AND expiry_reconciled_at IS NULL`, [orderId, expectedUpdatedAt]);
  }

  async listUnreconciledAdverse(limit = 100) {
    const rows = await this.sql.query(
      `SELECT orders.*, reservations.founder_number,
         COALESCE(orders.redeemed_by_user_id, claims.user_id) AS redeemed_by_user_id,
         COALESCE(orders.redeemed_by_email, claims.verified_email) AS redeemed_by_email
       FROM gift_orders orders
       LEFT JOIN founder_spot_reservations reservations ON reservations.gift_order_id = orders.id
       LEFT JOIN gift_redemption_recipients claims ON claims.gift_order_id = orders.id
       WHERE (orders.refunded_at IS NOT NULL OR orders.disputed_at IS NOT NULL OR orders.dispute_status = 'won')
         AND orders.adverse_reconciled_at IS NULL
       ORDER BY orders.updated_at, orders.id LIMIT $1`, [limit],
    ) as Row[];
    return rows.map(rowToGift);
  }

  async markAdverseReconciled(orderId: string, expectedUpdatedAt: string) {
    const rows = await this.sql.query(
      `UPDATE gift_orders SET adverse_reconciled_at = NOW()
       WHERE id = $1 AND updated_at = $2 AND adverse_reconciled_at IS NULL
         AND (refunded_at IS NOT NULL OR (disputed_at IS NOT NULL AND dispute_status IN ('open','lost'))
           OR (dispute_status = 'won' AND disputed_at IS NULL AND refunded_at IS NULL AND payment_status = 'funded'))
       RETURNING id`, [orderId, expectedUpdatedAt],
    ) as Row[];
    return rows.length === 1;
  }

  async listLatePaymentRefundObligations(limit = 100) {
    const rows = await this.sql.query(
      `SELECT 'gift' AS purchase_type, attempts.gift_order_id AS order_id,
         attempts.checkout_attempt, NULL::TEXT AS attempt_id, attempts.stripe_payment_intent_id,
         attempts.stripe_charge_id, attempts.refund_handling
       FROM gift_payment_attempts attempts
       WHERE attempts.status = 'late_payment'
         AND (attempts.refund_handling IS NULL OR attempts.refund_handling IN ('automatic_pending','manual_required'))
       UNION ALL
       SELECT 'direct_founder' AS purchase_type, NULL::TEXT AS order_id, NULL::INTEGER AS checkout_attempt,
         attempts.attempt_id, attempts.stripe_payment_intent_id, attempts.stripe_charge_id, attempts.refund_handling
       FROM direct_founder_checkout_reservations attempts
       WHERE attempts.status = 'late_payment'
         AND (attempts.refund_handling IS NULL OR attempts.refund_handling IN ('automatic_pending','manual_required'))
       ORDER BY purchase_type, order_id, attempt_id LIMIT $1`, [limit],
    ) as Row[];
    return rows.map((row) => ({
      purchaseType: text(row.purchase_type) as "gift" | "direct_founder",
      orderId: nullableText(row.order_id),
      checkoutAttempt: row.checkout_attempt === null ? null : Number(row.checkout_attempt),
      attemptId: nullableText(row.attempt_id),
      paymentIntentId: nullableText(row.stripe_payment_intent_id),
      chargeId: nullableText(row.stripe_charge_id),
      refundHandling: nullableText(row.refund_handling),
    }));
  }

  async giftOwnsEffectiveAccess(orderId: string, entitlementVersion: string | null, now = new Date()) {
    if (!entitlementVersion) return false;
    const rows = await this.sql.query(
      `SELECT EXISTS (
         SELECT 1 FROM gift_orders WHERE id = $1 AND entitlement_version = $2
           AND payment_status = 'funded' AND refunded_at IS NULL AND disputed_at IS NULL
           AND redeemed_at IS NOT NULL AND (access_expires_at IS NULL OR access_expires_at > $3)
       ) AS owns_access`, [orderId, entitlementVersion, now.toISOString()],
    ) as Row[];
    return rows[0]?.owns_access === true;
  }

  async markFounderReconciliationReady(clerkUserCount: number) {
    await this.sql.query(`INSERT INTO founder_reconciliation_state (singleton, clerk_user_count, completed_at)
      VALUES (TRUE,$1,NOW()) ON CONFLICT (singleton) DO UPDATE SET clerk_user_count = EXCLUDED.clerk_user_count,
      completed_at = EXCLUDED.completed_at, updated_at = NOW()`, [clerkUserCount]);
  }

  async reserveDirectFounder(userId: string, attemptId: string) {
    let rows: Row[];
    try {
      rows = await this.sql.query(`SELECT * FROM claim_direct_founder_checkout($1,$2)`, [attemptId, userId]) as Row[];
    } catch (error) {
      const live = await this.findLiveDirectFounderCheckout(userId).catch(() => null);
      if (live) return live;
      throw error;
    }
    if (!rows[0]) return null;
    const current = await this.readDirectFounderAttempt(text(rows[0].attempt_id));
    return current ? rowToDirectFounder(current) : null;
  }

  async attachDirectFounderCheckout(userId: string, attemptId: string, sessionId: string) {
    const rows = await this.sql.query(
      `UPDATE direct_founder_checkout_reservations SET checkout_session_id = $3, status = 'open', updated_at = NOW()
       WHERE attempt_id = $2 AND user_id = $1
         AND ((checkout_session_id IS NULL AND status = 'creating') OR (checkout_session_id = $3 AND status = 'open'))
       RETURNING founder_number, entitlement_version`, [userId, attemptId, sessionId],
    ) as Row[];
    return rows[0] || null;
  }

  async releaseDirectFounderReservation(userId: string, attemptId: string, sessionId?: string | null, status: "expired" | "failed" = "expired") {
    await this.sql.transaction((transaction) => [
      transaction.query(
        `UPDATE direct_founder_checkout_reservations SET status = $4, updated_at = NOW()
         WHERE user_id = $1 AND attempt_id = $2 AND status IN ('creating','open')
           AND ($3::TEXT IS NULL OR checkout_session_id = $3) RETURNING founder_number`,
        [userId, attemptId, sessionId || null, status],
      ),
      transaction.query(
        `UPDATE founder_spot_reservations SET status = 'revoked', user_id = NULL,
           source_id = 'revoked:' || founder_number || ':' || md5(source_id || clock_timestamp()::TEXT), updated_at = NOW()
         WHERE source_id = 'direct-checkout:' || $2 AND user_id = $1 AND status = 'reserved'
           AND EXISTS (SELECT 1 FROM direct_founder_checkout_reservations
             WHERE user_id = $1 AND attempt_id = $2 AND status = $4)`, [userId, attemptId, sessionId || null, status],
      ),
    ], { isolationLevel: "Serializable" });
  }

  async completeDirectFounderCheckout(input: { userId: string; attemptId: string; checkoutSessionId: string; paymentIntentId: string | null; chargeId: string | null }) {
    const rows = await this.sql.query(
      `SELECT * FROM complete_direct_founder_checkout($1,$2,$3,$4,$5)`,
      [input.attemptId, input.userId, input.checkoutSessionId, input.paymentIntentId, input.chargeId],
    ) as Row[];
    return rows[0] ? {
      founderNumber: Number(rows[0].founder_number), entitlementVersion: text(rows[0].entitlement_version),
      newlyPaid: rows[0].newly_paid === true, latePayment: rows[0].late_payment === true,
    } : null;
  }

  async findDirectFounderByStripeReference(reference: string) {
    const rows = await this.sql.query(
      `SELECT * FROM direct_founder_checkout_reservations
       WHERE checkout_session_id = $1 OR stripe_payment_intent_id = $1 OR stripe_charge_id = $1 LIMIT 1`, [reference],
    ) as Row[];
    return rows[0] || null;
  }

  async readDirectFounderAttempt(attemptId: string) {
    const rows = await this.sql.query(
      `SELECT * FROM direct_founder_checkout_reservations WHERE attempt_id = $1 LIMIT 1`, [attemptId],
    ) as Row[];
    return rows[0] || null;
  }

  async findDirectFounderOwnershipForUser(userId: string, founderNumber?: number | null) {
    const rows = await this.sql.query(
      `SELECT attempts.* FROM direct_founder_checkout_reservations attempts
       JOIN founder_spot_reservations spots
         ON spots.founder_number = attempts.founder_number AND spots.user_id = attempts.user_id
       WHERE attempts.user_id = $1 AND ($2::INTEGER IS NULL OR attempts.founder_number = $2)
         AND attempts.status = 'paid' AND (attempts.dispute_status IS NULL OR attempts.dispute_status = 'won')
         AND spots.status = 'assigned'
       ORDER BY attempts.paid_at DESC NULLS LAST, attempts.created_at DESC LIMIT 1`, [userId, founderNumber || null],
    ) as Row[];
    return rows[0] ? rowToDirectFounder(rows[0]) : null;
  }

  async findLiveDirectFounderCheckout(userId: string) {
    const rows = await this.sql.query(
      `SELECT * FROM direct_founder_checkout_reservations
       WHERE user_id = $1 AND status IN ('creating','open') ORDER BY created_at LIMIT 1`, [userId],
    ) as Row[];
    return rows[0] ? rowToDirectFounder(rows[0]) : null;
  }

  async directFounderOwnsEffectiveAccess(attemptId: string, entitlementVersion: string | null) {
    if (!entitlementVersion) return false;
    const rows = await this.sql.query(
      `SELECT EXISTS (SELECT 1 FROM direct_founder_checkout_reservations
       WHERE attempt_id = $1 AND entitlement_version = $2 AND status = 'paid'
         AND (dispute_status IS NULL OR dispute_status = 'won')) AS owns_access`, [attemptId, entitlementVersion],
    ) as Row[];
    return rows[0]?.owns_access === true;
  }

  async recordDirectFounderRefund(input: { attemptId: string; stripeEventId: string; fullRefund: boolean; refundState: string }) {
    const results = await this.sql.transaction((transaction) => [
      transaction.query(
        `INSERT INTO direct_founder_checkout_events (attempt_id, stripe_event_id, event_type, event_payload)
         VALUES ($1,$2,$3,jsonb_build_object('full_refund',$4,'refund_state',$5)) ON CONFLICT DO NOTHING`,
        [input.attemptId, input.stripeEventId, `refund_${input.refundState}`, input.fullRefund, input.refundState],
      ),
      transaction.query(
        `UPDATE direct_founder_checkout_reservations SET
           status = CASE WHEN $2 THEN 'refunded' ELSE status END,
           refund_handling = CASE WHEN $2 THEN 'automatic_succeeded' ELSE refund_handling END,
           physical_fulfillment_review = CASE WHEN $2 THEN TRUE ELSE physical_fulfillment_review END,
           updated_at = NOW() WHERE attempt_id = $1 RETURNING *`, [input.attemptId, input.fullRefund],
      ),
    ], { isolationLevel: "Serializable" }) as Row[][];
    return results[1]?.[0] || null;
  }

  async recordDirectFounderDispute(input: { attemptId: string; stripeEventId: string; state: "open" | "won" | "lost" }) {
    const results = await this.sql.transaction((transaction) => [
      transaction.query(
        `INSERT INTO direct_founder_checkout_events (attempt_id, stripe_event_id, event_type, event_payload)
         VALUES ($1,$2,$3,jsonb_build_object('dispute_state',$4)) ON CONFLICT DO NOTHING`,
        [input.attemptId, input.stripeEventId, `dispute_${input.state}`, input.state],
      ),
      transaction.query(
        `UPDATE direct_founder_checkout_reservations SET dispute_status = $2,
           status = CASE WHEN $2 = 'won' AND status = 'disputed' THEN 'paid'
             WHEN $2 <> 'won' AND status = 'paid' THEN 'disputed' ELSE status END,
           activation_reconciled_at = CASE WHEN $2 = 'won' THEN NULL ELSE activation_reconciled_at END,
           activation_last_error = CASE WHEN $2 = 'won' THEN NULL ELSE activation_last_error END,
           physical_fulfillment_review = CASE WHEN $2 <> 'won' THEN TRUE ELSE physical_fulfillment_review END,
           updated_at = NOW() WHERE attempt_id = $1
           AND (($2 = 'open' AND (dispute_status IS NULL OR dispute_status = 'open'))
             OR ($2 = 'won' AND (dispute_status IS NULL OR dispute_status IN ('open','won')))
             OR ($2 = 'lost' AND (dispute_status IS NULL OR dispute_status IN ('open','lost'))))
           RETURNING *`, [input.attemptId, input.state],
      ),
    ], { isolationLevel: "Serializable" }) as Row[][];
    return results[1]?.[0] || null;
  }

  async markDirectLatePaymentRefundHandling(attemptId: string, handling: "automatic_pending" | "automatic_succeeded" | "manual_required") {
    await this.sql.query(
      `UPDATE direct_founder_checkout_reservations SET refund_handling = $2,
         status = CASE WHEN $2 = 'automatic_succeeded' THEN 'refunded' ELSE status END,
         updated_at = NOW() WHERE attempt_id = $1`, [attemptId, handling],
    );
  }

  async markDirectFounderActivationReconciled(attemptId: string) {
    await this.sql.query(
      `UPDATE direct_founder_checkout_reservations SET activation_reconciled_at = NOW(),
         activation_last_error = NULL, updated_at = NOW()
       WHERE attempt_id = $1 AND status = 'paid' AND (dispute_status IS NULL OR dispute_status = 'won')`, [attemptId],
    );
  }

  async recordDirectFounderActivationError(attemptId: string, error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    await this.sql.query(
      `UPDATE direct_founder_checkout_reservations SET activation_last_error = LEFT($2, 500), updated_at = NOW()
       WHERE attempt_id = $1 AND status = 'paid' AND activation_reconciled_at IS NULL`, [attemptId, message],
    );
  }

  async listPendingDirectFounderActivations(limit = 50) {
    const rows = await this.sql.query(
      `SELECT * FROM direct_founder_checkout_reservations
       WHERE status = 'paid' AND (dispute_status IS NULL OR dispute_status = 'won')
         AND activation_reconciled_at IS NULL
       ORDER BY paid_at NULLS LAST, updated_at, attempt_id LIMIT $1`, [limit],
    ) as Row[];
    return rows.map(rowToDirectFounder);
  }

  async reconcileExistingFounder(userId: string, founderNumber: number) {
    const rows = await this.sql.query(`SELECT reserve_existing_founder_spot($1,$2) AS founder_number`, [userId, founderNumber]) as Row[];
    return Number(rows[0]?.founder_number) || null;
  }

  async founderAvailability() {
    const rows = await this.sql.query(`SELECT COUNT(*)::INTEGER AS claimed FROM founder_spot_reservations WHERE status IN ('reserved','assigned')`) as Row[];
    const claimed = Number(rows[0]?.claimed) || 0;
    return { claimed, remaining: Math.max(0, 100 - claimed) };
  }
}

export function createGiftRepository() {
  return new GiftRepository();
}

export async function releaseGiftDeliveryClaim(orderId: string, claim: string) {
  return createGiftRepository().releaseDeliveryClaim(orderId, claim);
}
