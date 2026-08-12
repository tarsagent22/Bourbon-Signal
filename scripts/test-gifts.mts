import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  GIFT_PLANS,
  addOneCalendarYear,
  canRedeemGiftForMembership,
  isGiftPurchase,
  normalizeGiftOrderInput,
  validateGiftStripePrice,
} from "../src/lib/gifts.ts";
import { resolveGiftDeliveryMode } from "../src/lib/gift-delivery-policy.ts";
import { DIRECT_STRIPE_PRICE_IDS, LAUNCH_BILLING_PLANS, getCheckoutPlanByPriceId, getPlanByPriceId, validateDirectStripePrice } from "../src/lib/stripe-plans.ts";
import { resolveEffectiveMembershipTier } from "../src/lib/entitlements.ts";
import { giftRedemptionKeys, giftRedemptionToken, giftRedemptionTokenHash } from "../src/lib/gift-tokens.ts";
import { directFounderRevocationMetadata } from "../src/lib/direct-founder-revocation.ts";

function read(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

assert.deepEqual(DIRECT_STRIPE_PRICE_IDS, {
  standard_monthly: "price_1U3SkALQlLvo1rCDe3it7BpY",
  standard_annual: "price_1U3SivLQlLvo1rCDNWfku8up",
  barrel_monthly: "price_1U3ShaLQlLvo1rCDXYKq6mJn",
  barrel_annual: "price_1U3SfyLQlLvo1rCDYCcq0bs2",
  bib_lifetime: "price_1U3SeWLQlLvo1rCDRzCsjqrE",
});
assert.deepEqual(Object.fromEntries(Object.entries(LAUNCH_BILLING_PLANS).map(([id, plan]) => [id, plan.priceLabel])), {
  standard_monthly: "$3",
  standard_annual: "$30",
  barrel_monthly: "$6",
  barrel_annual: "$60",
  bib_lifetime: "$50",
});
const previousLegacyMonthly = process.env.STRIPE_PRICE_MONTHLY;
process.env.STRIPE_PRICE_MONTHLY = "price_legacy_standard_monthly";
assert.equal(getPlanByPriceId("price_legacy_standard_monthly")?.id, "standard_monthly", "legacy prices remain valid for existing subscription lifecycle events");
assert.equal(getCheckoutPlanByPriceId("price_legacy_standard_monthly"), null, "legacy prices cannot authorize a new checkout activation");
assert.equal(getCheckoutPlanByPriceId(DIRECT_STRIPE_PRICE_IDS.standard_monthly)?.id, "standard_monthly");
if (previousLegacyMonthly === undefined) delete process.env.STRIPE_PRICE_MONTHLY;
else process.env.STRIPE_PRICE_MONTHLY = previousLegacyMonthly;
assert.deepEqual(GIFT_PLANS, {
  standard_annual_gift: { id: "standard_annual_gift", tier: "standard", label: "Standard Proof annual gift", amountCents: 3000, priceId: "price_1U3Sa9LQlLvo1rCDdwT70E4N", access: "annual" },
  barrel_annual_gift: { id: "barrel_annual_gift", tier: "barrel", label: "Barrel Proof annual gift", amountCents: 6000, priceId: "price_1U3SYmLQlLvo1rCDNC1f2MLS", access: "annual" },
  founder_lifetime_gift: { id: "founder_lifetime_gift", tier: "bottled-in-bond", label: "Founder lifetime gift", amountCents: 5000, priceId: "price_1U3SVrLQlLvo1rCDsnOcKOQM", access: "lifetime" },
});
assert.equal(Object.keys(GIFT_PLANS).some((plan) => plan.includes("monthly")), false, "monthly gifts must not exist");
assert.equal(isGiftPurchase({ purchase_type: "gift" }), true);
assert.equal(isGiftPurchase({ referral_eligible: "false" }), false, "purchase_type is the authoritative gift discriminator");

const scheduled = normalizeGiftOrderInput({
  plan: "standard_annual_gift",
  purchaserName: "  Casey  Jones ",
  recipientName: "  Taylor  Doe ",
  recipientEmail: " TAYLOR@example.com ",
  message: "  Enjoy this year of better bourbon hunting!  ",
  deliveryMode: "scheduled",
  scheduledLocalDateTime: "2026-09-01T20:30",
  deliveryTimezone: "America/New_York",
}, new Date("2026-08-11T12:00:00.000Z"));
assert.equal(scheduled.ok, true);
if (scheduled.ok) {
  assert.equal(scheduled.value.purchaserName, "Casey Jones");
  assert.equal(scheduled.value.recipientEmail, "taylor@example.com");
  assert.equal(scheduled.value.scheduledDeliveryAt, "2026-09-02T00:30:00.000Z");
}
for (const invalid of [
  { plan: "standard_monthly_gift", recipientName: "Taylor", recipientEmail: "t@example.com", deliveryMode: "now" },
  { plan: "standard_annual_gift", recipientName: "T", recipientEmail: "not-email", deliveryMode: "now" },
  { plan: "standard_annual_gift", recipientName: "T", recipientEmail: "t@example.com", message: "x".repeat(1001), deliveryMode: "now" },
  { plan: "standard_annual_gift", recipientName: "T", recipientEmail: "t@example.com", deliveryMode: "scheduled", scheduledLocalDateTime: "2026-08-10T10:00", deliveryTimezone: "America/New_York" },
  { plan: "standard_annual_gift", recipientName: "T", recipientEmail: "t@example.com", deliveryMode: "scheduled", scheduledLocalDateTime: "2026-09-01T10:00", deliveryTimezone: "Not/AZone" },
]) assert.equal(normalizeGiftOrderInput(invalid, new Date("2026-08-11T12:00:00.000Z")).ok, false);

assert.equal(validateGiftStripePrice({ id: GIFT_PLANS.standard_annual_gift.priceId, active: true, livemode: true, currency: "usd", unit_amount: 3000, recurring: null, product: { active: true } }, GIFT_PLANS.standard_annual_gift), null);
assert.match(validateGiftStripePrice({ id: "price_wrong", active: true, livemode: true, currency: "usd", unit_amount: 3000, recurring: null, product: { active: true } }, GIFT_PLANS.standard_annual_gift) || "", /price/i);
assert.match(validateGiftStripePrice({ id: GIFT_PLANS.standard_annual_gift.priceId, active: true, livemode: true, currency: "usd", unit_amount: 3000, recurring: { interval: "year" }, product: { active: true } }, GIFT_PLANS.standard_annual_gift) || "", /one-time/i);
assert.match(validateGiftStripePrice({ id: GIFT_PLANS.standard_annual_gift.priceId, active: true, livemode: true, currency: "usd", unit_amount: 2999, recurring: null, product: { active: true } }, GIFT_PLANS.standard_annual_gift) || "", /amount/i);
assert.equal(validateDirectStripePrice({ id: DIRECT_STRIPE_PRICE_IDS.bib_lifetime, active: true, livemode: true, currency: "usd", unit_amount: 5000, recurring: null, product: { active: true } }, LAUNCH_BILLING_PLANS.bib_lifetime), null);
assert.match(validateDirectStripePrice({ id: DIRECT_STRIPE_PRICE_IDS.bib_lifetime, active: true, livemode: true, currency: "usd", unit_amount: 4999, recurring: null, product: { active: true } }, LAUNCH_BILLING_PLANS.bib_lifetime) || "", /amount/i);
assert.match(validateDirectStripePrice({ id: DIRECT_STRIPE_PRICE_IDS.standard_monthly, active: true, livemode: true, currency: "usd", unit_amount: 300, recurring: { interval: "year", interval_count: 1 }, product: { active: true } }, LAUNCH_BILLING_PLANS.standard_monthly) || "", /cadence/i);
assert.equal(addOneCalendarYear(new Date("2028-02-29T14:30:00.000Z")).toISOString(), "2029-02-28T14:30:00.000Z");
assert.equal(canRedeemGiftForMembership("standard", "free", null), true);
assert.equal(canRedeemGiftForMembership("standard", "standard", null), false);
assert.equal(canRedeemGiftForMembership("barrel", "standard", null), true);
assert.equal(canRedeemGiftForMembership("barrel", "bottled-in-bond", null), false);
assert.equal(canRedeemGiftForMembership("bottled-in-bond", "bottled-in-bond", null), false);
const giftMembership = { tier: "standard", plan: "gift_standard_annual", membershipStatus: "active", giftAccessExpiresAt: "2027-08-11T12:00:00.000Z" };
assert.equal(resolveEffectiveMembershipTier(giftMembership, new Date("2027-08-11T11:59:59.999Z")), "standard");
assert.equal(resolveEffectiveMembershipTier(giftMembership, new Date("2027-08-11T12:00:00.000Z")), "free", "annual gift access fails closed at the exact expiry instant");
assert.equal(resolveEffectiveMembershipTier({ ...giftMembership, giftPreviousMembership: { tier: "barrel", plan: "barrel_monthly", status: "active" } }, new Date("2027-08-11T12:00:00.000Z")), "barrel", "expiry exposes newer paid access through the safe overlay");
assert.equal(resolveEffectiveMembershipTier({ ...giftMembership, plan: "standard_monthly" }, new Date("2028-01-01T00:00:00.000Z")), "standard", "an old gift expiry must not override newer paid access");
assert.equal(resolveGiftDeliveryMode(false, {} as NodeJS.ProcessEnv), "dry_run");
assert.equal(resolveGiftDeliveryMode(true, { GIFT_EMAIL_DELIVERY_ENABLED: "0", RESEND_API_KEY: "re_test" } as NodeJS.ProcessEnv), "blocked");
assert.equal(resolveGiftDeliveryMode(true, {} as NodeJS.ProcessEnv), "blocked");
assert.equal(resolveGiftDeliveryMode(true, { RESEND_API_KEY: "re_test" } as NodeJS.ProcessEnv), "live");
assert.deepEqual(directFounderRevocationMetadata("2026-08-12T12:00:00.000Z"), {
  tier: "free",
  plan: "free",
  membershipTier: "free",
  billingPlan: "free",
  membershipStatus: "free",
  directFounderCheckoutAttemptId: null,
  directFounderEntitlementVersion: null,
  directFounderPreviousMembership: null,
  founderNumber: null,
  memberNumber: null,
  membershipUpdatedAt: "2026-08-12T12:00:00.000Z",
}, "direct Founder revocation must fail closed and clear every Founder authority marker");

const stripeFallbackTokenEnv = { STRIPE_WEBHOOK_SECRET: "whsec_existing-production-secret-123456789" } as NodeJS.ProcessEnv;
assert.deepEqual(giftRedemptionKeys(stripeFallbackTokenEnv).map((key) => key.version), ["v1"],
  "gift redemption must use the existing stable Stripe webhook secret when no dedicated gift key is configured");
assert.equal(giftRedemptionToken("gift_fallback", stripeFallbackTokenEnv), giftRedemptionToken("gift_fallback", stripeFallbackTokenEnv));

const rotatedTokenEnv = {
  GIFT_REDEMPTION_KEY_VERSION: "v2",
  GIFT_REDEMPTION_HASH_SECRET: "current-secret-current-secret-1234",
  GIFT_REDEMPTION_PREVIOUS_KEY_VERSION: "v1",
  GIFT_REDEMPTION_HASH_SECRET_PREVIOUS: "previous-secret-previous-secret-12",
} as NodeJS.ProcessEnv;
assert.deepEqual(giftRedemptionKeys(rotatedTokenEnv).map((key) => key.version), ["v2", "v1"]);
const existingDeliveredToken = giftRedemptionToken("gift_existing", rotatedTokenEnv, "v1");
assert.equal(existingDeliveredToken, giftRedemptionToken("gift_existing", rotatedTokenEnv, "v1"), "stored key versions keep delivered links stable");
assert.notEqual(existingDeliveredToken, giftRedemptionToken("gift_existing", rotatedTokenEnv, "v2"));
assert.equal(giftRedemptionTokenHash(existingDeliveredToken, rotatedTokenEnv, "v1").length, 64);
assert.throws(() => giftRedemptionToken("gift_existing", rotatedTokenEnv, "v0"), /unavailable/);

const schema = read("src/lib/gift-schema.sql");
const giftTables = ["gift_orders", "gift_order_events", "founder_spot_reservations", "founder_reconciliation_state", "gift_redemption_recipients", "gift_recipient_locks", "gift_payment_attempts", "direct_founder_checkout_reservations", "direct_founder_checkout_events"];
for (const table of giftTables) assert.match(schema, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
for (const column of ["purchaser_user_id", "purchaser_email", "recipient_email", "recipient_name", "gift_plan", "delivery_timezone", "scheduled_delivery_at", "payment_status", "stripe_checkout_session_id", "stripe_payment_intent_id", "stripe_charge_id", "redemption_token_hash", "redeemed_by_user_id", "delivery_claim_token", "delivery_idempotency_key", "delivery_provider_message_id", "access_starts_at", "access_expires_at", "refunded_at", "disputed_at"]) assert.match(schema, new RegExp(`\\b${column}\\b`));
assert.doesNotMatch(schema, /redemption_token\s/i, "the schema must never store a raw redemption token");
assert.match(schema, /UNIQUE\s*\(stripe_event_id\)/i);
assert.match(schema, /FOR UPDATE SKIP LOCKED/i);
assert.match(schema, /generate_series\(1,\s*100\)/i, "Founder allocation must be bounded and concurrency safe");
assert.match(schema, /prevent_gift_event_mutation/i, "gift events must be append-only");
assert.match(schema, /claim_founder_gift_checkout[\s\S]*founder_reconciliation_state/i, "Founder checkout must require completed authority reconciliation");
assert.match(schema, /claim_gift_redemption[\s\S]*pg_advisory_xact_lock[\s\S]*gift_redemption_recipients/i, "recipient redemption claims must serialize in Postgres");
assert.match(schema, /gift_order_id TEXT PRIMARY KEY REFERENCES gift_orders/i, "redemption history must be per order");
assert.doesNotMatch(schema, /user_id TEXT PRIMARY KEY|verified_email TEXT NOT NULL UNIQUE/i, "recipient identity must not be permanently unique");
assert.match(schema, /gift_recipient_locks[\s\S]*locked_until/i, "active recipient ownership must be short lived");
assert.match(schema, /activation_started[\s\S]*activation_attempts/i, "redemption must persist its activation saga before Clerk");
assert.match(schema, /finalize_gift_redemption/i, "redemption consumption must be a separate finalize phase");
assert.match(schema, /fund_gift_order\([\s\S]*p_checkout_session_id[\s\S]*p_checkout_attempt/i, "funding must fence both checkout session and attempt");
assert.match(schema, /late_payment_refund_required|late_payment/i, "late successful attempts must become refund risk");
assert.match(schema, /expiry_reconciled_at/i, "annual expiry reconciliation must page past completed rows");
assert.match(schema, /direct_founder_checkout_live_user_idx[\s\S]*WHERE status IN \('creating','open'\)/i, "Postgres must allow only one live direct Founder attempt per user");
assert.match(schema, /abandon_adverse_gift_claim[\s\S]*status = 'abandoned'[\s\S]*DELETE FROM gift_recipient_locks/i, "adverse activation claims must terminate and release recipient locks");
assert.match(schema, /record_gift_dispute[\s\S]*p_state = 'won'[\s\S]*adverse_reconciled_at = NULL/i, "won disputes must remain pending until exact entitlement restoration succeeds");
assert.match(schema, /authorize_gift_activation[\s\S]*status = 'activation_started'[\s\S]*refunded_at IS NULL[\s\S]*disputed_at IS NULL/i, "Clerk activation must be preceded by a durable adverse-state fence");
assert.match(schema, /authorize_gift_delivery_send[\s\S]*payment_status = 'funded'[\s\S]*refunded_at IS NULL[\s\S]*disputed_at IS NULL[\s\S]*redeemed_at IS NULL/i);
assert.match(schema, /claim_direct_founder_checkout[\s\S]*requested_attempt_id := p_attempt_id[\s\S]*INTO existing_attempt_id, allocated, version[\s\S]*reserve_founder_spot\('direct', 'direct-checkout:' \|\| requested_attempt_id/,
  "a first direct Founder checkout must preserve its requested attempt ID while probing for an existing live attempt");
assert.match(schema, /complete_direct_founder_checkout[\s\S]*UPDATE founder_spot_reservations AS spots[\s\S]*spots\.founder_number = target\.founder_number[\s\S]*spots\.status = 'reserved'/,
  "direct Founder payment completion must qualify reservation columns against PL/pgSQL output names");
assert.match(schema, /revoke_founder_gift_reservation[\s\S]*SELECT orders\.funded_at INTO order_funded_at[\s\S]*FOR UPDATE[\s\S]*order_funded_at IS NOT NULL THEN RETURN NULL/i,
  "a successfully funded Founder gift number must never be revoked or recycled");

const repository = read("src/lib/gift-repository.ts");
assert.match(read("src/lib/gift-tokens.ts"), /createHmac\(["']sha256["']/);
assert.match(repository, /randomBytes\(32\)/);
assert.doesNotMatch(repository, /console\.(?:log|warn|error)\([^\n]*(?:token|recipient)/i);
assert.match(repository, /claim_due_gift_deliveries/);
assert.match(repository, /15 minutes/);
assert.match(read("src/lib/gift-tokens.ts"), /GIFT_REDEMPTION_PREVIOUS_KEY_VERSION/);
assert.match(read("src/lib/gift-tokens.ts"), /GIFT_REDEMPTION_HASH_SECRET_PREVIOUS/);
assert.match(repository, /redemptionTokenKeyVersion/);
assert.doesNotMatch(repository, /DELETE FROM gift_redemption_recipients[^`]*activation_started/i, "activation-started claims must remain recoverable");
assert.match(repository, /listLatePaymentRefundObligations[\s\S]*automatic_pending[\s\S]*manual_required/);
assert.match(repository, /markDelivered[\s\S]*delivery_status = 'sending'[\s\S]*payment_status = 'funded'[\s\S]*redeemed_at IS NULL/);
assert.match(repository, /listUnreconciledAdverse[\s\S]*dispute_status = 'won'/, "won restoration must be retryable from the durable worker");
assert.match(repository, /markAdverseReconciled[\s\S]*updated_at = \$2[\s\S]*RETURNING id/, "adverse reconciliation completion must use a compare-and-set transition");

const checkout = read("src/app/api/gifts/checkout/route.ts");
assert.match(checkout, /gift-checkout-/, "Stripe receives a stable per-order idempotency key");
for (const metadata of ["purchase_type: \"gift\"", "referral_eligible: \"false\"", "gift_order_id", "gift_plan", "purchaser_user_id", "gift_checkout_attempt"]) assert.ok(checkout.includes(metadata), `gift checkout missing ${metadata}`);
assert.match(checkout, /mode:\s*["']payment["']/);
assert.match(checkout, /quantity:\s*1/);
assert.match(checkout, /payment_intent_data:\s*\{\s*metadata/);
assert.doesNotMatch(checkout, /metadata[\s\S]{0,400}recipient_(?:email|name)/, "recipient data must not enter Stripe metadata");
assert.match(checkout, /prices\.retrieve/);
assert.match(checkout, /validateGiftStripePrice/);
assert.match(checkout, /claimFounderCheckout/);
assert.match(checkout, /reconcileAllFounderReservationAuthority/);
assert.match(checkout, /releaseCheckoutClaim/);

const webhook = read("src/app/api/webhooks/stripe/route.ts");
const giftWebhook = read("src/lib/gift-stripe-webhook.ts");
assert.match(webhook, /handleGiftStripeEvent/);
assert.ok(webhook.indexOf("handleGiftStripeEvent") < webhook.indexOf("checkout.session.completed"), "gift routing must happen before membership routing");
assert.match(giftWebhook, /payment_intent\.payment_failed|checkout\.session\.expired/);
assert.match(giftWebhook, /charge\.refunded|charge\.dispute\.created/);
assert.match(giftWebhook, /assertExactDirectFounderSession/);
assert.match(giftWebhook, /activateMembership[\s\S]*markDirectFounderActivationReconciled[\s\S]*return true/,
  "direct Founder success must activate durably and stop generic processing");
assert.match(giftWebhook, /state !== "won"[\s\S]*reactivateDirectFounderMembership/);
assert.match(webhook, /isGiftPurchase/);
assert.match(webhook, /return NextResponse\.json\(\{ received: true \}\)/, "gift events must not fall through to activation or referrals");

for (const routePath of ["src/app/api/checkout/sync/route.ts", "src/app/api/checkout/recover/route.ts"]) {
  const route = read(routePath);
  assert.match(route, /purchase_type\) === ["']gift["']|purchase_type === ["']gift["']/, `${routePath} must exclude gifts`);
}
const redeemRoute = read("src/app/api/gifts/redeem/route.ts");
assert.match(redeemRoute, /primaryEmailAddressId/);
assert.match(redeemRoute, /verification\?\.status !== ["']verified["']/);
assert.match(redeemRoute, /purchaser/i);
assert.match(redeemRoute, /claimRedemption[\s\S]*completeGiftActivationSaga/);
const giftActivation = read("src/lib/gift-activation.ts");
assert.match(giftActivation, /beginRedemptionActivation[\s\S]*giftOrderId[\s\S]*giftEntitlementVersion[\s\S]*activateGiftMembership[\s\S]*finalizeRedemption/);
assert.match(giftActivation, /authorizeGiftActivation[\s\S]*activateGiftMembership[\s\S]*finalizeRedemption/, "activation must reauthorize before Clerk and finalize afterward");
assert.match(giftActivation, /catch[\s\S]*revokeGiftMembershipIfCurrent/, "ambiguous Clerk activation must fail closed without consuming the gift");
assert.doesNotMatch(giftActivation, /releaseRedemptionClaim/, "Clerk uncertainty must never delete an activation claim");
assert.match(giftActivation, /runGiftActivationReconciliation/);
const entitlement = read("src/lib/entitlements.ts");
assert.match(entitlement, /giftAccessExpiresAt/);
assert.match(entitlement, /Date\.parse/);
const membershipServer = read("src/lib/membership-server.ts");
assert.match(membershipServer, /isFounderMembershipMetadata/);
assert.match(membershipServer, /reconcileExistingFounder/);
assert.match(membershipServer, /giftOrderId:\s*null/, "a later direct Stripe membership must clear stale gift ownership");
assert.match(membershipServer, /findDirectFounderOwnershipForUser/,
  "duplicate Founder activation must recover the exact durable ownership markers");
assert.match(membershipServer, /directFounderPreviousMembership/,
  "direct Founder activation must retain a snapshot for diagnostics and won-dispute reactivation");
assert.match(membershipServer, /revokeDirectFounderMembershipIfCurrent[\s\S]*directFounderRevocationMetadata\(\)/,
  "direct Founder revocation must use the fail-closed metadata policy instead of restoring a stale snapshot");
assert.match(membershipServer, /reactivateGiftMembershipIfEligible[\s\S]*giftOwnsEffectiveAccess[\s\S]*activateGiftMembership[\s\S]*giftAccessStartsAt[\s\S]*giftAccessExpiresAt/,
  "won gift disputes must restore the exact still-valid entitlement version and dates");
assert.match(membershipServer, /clerkAlreadyFounder\s*&&\s*!existingDirectAttemptId[\s\S]*tier:\s*"free"/,
  "attaching a durable direct purchase must not preserve stale Founder metadata as its own fallback");
const expiry = read("src/app/api/gifts/expire/route.ts");
assert.match(expiry, /gift_order_id|giftOrderId/);
assert.match(expiry, /membershipUpdatedAt/);
assert.match(read("src/lib/gift-expiry.ts"), /markExpiryReconciled/);
assert.match(read("src/lib/founder-reservations.ts"), /offset[\s\S]*pageSize/);
assert.match(read("src/app/api/checkout/route.ts"), /reconcileAllFounderReservationAuthority/);
assert.doesNotMatch(read("src/app/api/checkout/route.ts"), /getUserList\(\{\s*limit:\s*500/);
assert.match(read("src/lib/server-entitlements.ts"), /giftOwnsEffectiveAccess[\s\S]*directFounderOwnsEffectiveAccess/);
for (const serverGate of [
  "src/app/api/drops/route.ts", "src/app/api/bottle-check/route.ts", "src/app/api/sightings/route.ts",
  "src/app/api/user/preferences/route.ts", "src/app/api/bourbon-dna/feedback/route.ts",
  "src/app/api/member/shipping/route.ts", "src/app/api/welcome/local-preview/route.ts",
  "src/lib/alert-delivery.ts", "src/lib/free-member-day-two-server.ts", "src/lib/member-weekly-delivery-runner.ts",
]) {
  assert.match(read(serverGate), /Server(?:Entitlements|PaidTier|EffectiveMembershipTier)/, `${serverGate} must use durable server entitlement resolution`);
}
for (const checkoutRecovery of ["src/app/api/checkout/sync/route.ts", "src/app/api/checkout/recover/route.ts"]) {
  assert.match(read(checkoutRecovery), /getCheckoutPlanByPriceId/, `${checkoutRecovery} must reject legacy price authority for new access`);
  assert.match(read(checkoutRecovery), /has_more[\s\S]*data\.length !== 1[\s\S]*quantity !== 1/, `${checkoutRecovery} must require one exact checkout line item`);
}
assert.match(read("src/app/api/webhooks/stripe/route.ts"), /planFromCheckoutSession[\s\S]*getCheckoutPlanByPriceId[\s\S]*planFromSubscription[\s\S]*getPlanByPriceId/,
  "checkout completion must use current prices while subscription lifecycle keeps legacy mapping");

const delivery = read("src/lib/gift-delivery.ts");
const deliveryPolicy = read("src/lib/gift-delivery-policy.ts");
assert.match(deliveryPolicy, /GIFT_EMAIL_DELIVERY_ENABLED/);
assert.match(delivery, /GIFT_DELIVERY_SECRET|CRON_SECRET/);
assert.match(delivery, /idempotencyKey/);
assert.match(delivery, /releaseGiftDeliveryClaim/);
assert.match(delivery, /authorizeDeliverySend[\s\S]*emails\.send[\s\S]*markDelivered/,
  "delivery must reauthorize after claiming and immediately before the provider call");
assert.match(delivery, /cannot be atomic[\s\S]*idempotency key[\s\S]*fenced `sending` transition/i,
  "provider ambiguity must be documented without claiming an atomic email/database commit");
const refundWorker = read("src/lib/gift-refunds.ts");
assert.match(refundWorker, /listLatePaymentRefundObligations/);
assert.match(refundWorker, /idempotencyKey:\s*`late-payment-refund-/);
assert.match(refundWorker, /catch[\s\S]*automatic_pending/,
  "a transient refund failure must preserve a retryable durable obligation");
const giftEmail = read("src/components/emails/GiftDeliveryEmail.tsx");
assert.match(giftEmail, /annual gift gives exactly one year of access from redemption and does not renew/i);
const deliveryRoute = read("src/app/api/gifts/deliver/route.ts");
assert.match(deliveryRoute, /private, no-store/);
assert.ok(deliveryRoute.indexOf('if (mode !== "live")') < deliveryRoute.indexOf("runGiftExpiryReconciliation()"),
  "the dedicated route must skip every mutation reconciler unless explicit live mode is enabled");
const vercel = JSON.parse(read("vercel.json"));
assert.deepEqual(vercel.crons, [
  { path: "/api/alerts/deliver?cron=v3", schedule: "*/5 * * * *" },
  { path: "/api/member-weekly-intelligence/deliver?cron=v1", schedule: "0 14 * * 4" },
  { path: "/api/free-member-day-two/deliver?live=1&cron=v1", schedule: "0 * * * *" },
  { path: "/api/gifts/deliver?live=1&cron=v1", schedule: "0 * * * *" },
], "live gift delivery and reconciliation must have an independent hourly cron while preserving existing lifecycle crons");
const alertDelivery = read("src/app/api/alerts/deliver/route.ts");
assert.match(alertDelivery, /runGiftDelivery\(\{ requestLive: true \}\)/);
assert.match(alertDelivery, /runGiftExpiryReconciliation/);
assert.match(alertDelivery, /getUTCMinutes\(\) % 15 === 0/, "the shared five-minute cron must run gifts no more frequently than every 15 minutes");
assert.match(alertDelivery, /Promise\.allSettled/, "gift maintenance failures must be isolated from alert delivery");
assert.match(alertDelivery, /alertExecutionIsReadOnly = dryRun \|\| queueMode === "shadow" \|\| monitorOnly \|\| testEmail \|\| baselineModeCount > 0/);
assert.match(alertDelivery, /giftMaintenanceDue = scheduledRun[\s\S]*!alertExecutionIsReadOnly[\s\S]*resolveGiftDeliveryMode\(true\) === "live"/,
  "shared alert dry-run and monitor requests must never enter gift mutation workers");

const giftPage = read("src/app/gift/page.tsx");
for (const phrase of ["Standard Proof", "$30", "Barrel Proof", "$60", "Bottled-in-Bond", "$50", "Annual gifts begin when redeemed and never renew", "beginning when the gift is redeemed", "No subscription or renewal", "numbered Founder glass", "The Founder number is reserved after payment and claimed when the gift is redeemed", "Gift details", "Recipient name", "Recipient email", "Optional message", "Send now", "Schedule delivery", "IANA timezone"]) assert.ok(giftPage.includes(phrase), `gift page missing: ${phrase}`);
assert.doesNotMatch(giftPage, /Founder lifetime|Who is it for\?|reserved when payment is funded/);
assert.match(giftPage, /gift-cards\{[^}]*border:0/);
assert.match(giftPage, /gift-card-name i/);
assert.match(giftPage, /\/api\/gifts\/orders/);
assert.match(giftPage, /\/api\/gifts\/checkout/);
const redemptionPage = read("src/app/gift/redeem/[token]/page.tsx");
assert.match(redemptionPage, /redirect_url/);
assert.match(redemptionPage, /no-store/);
const statusPage = read("src/app/gift/status/page.tsx");
assert.match(statusPage, /\/api\/gifts\/status/);
const footer = read("src/components/Footer.tsx");
assert.match(footer, /label:\s*["']Gift Bourbon Signal["'],\s*href:\s*["']\/gift["']/);
const pricing = read("src/app/pricing/PricingPageClient.tsx");
assert.match(pricing, />Gift Bourbon Signal</);
assert.ok(pricing.lastIndexOf("Gift Bourbon Signal") > pricing.indexOf("comparison-wrap"), "pricing gift CTA must appear near the bottom");

const migration = read("scripts/migrate-app-storage.mjs");
assert.match(migration, /gift-schema\.sql/);
for (const table of giftTables) assert.match(migration, new RegExp(`["']${table}["']`));
const backup = read("scripts/backup-neon-local.mjs");
for (const table of giftTables) assert.ok((backup.match(new RegExp(`["']${table}["']`, "g")) || []).length >= 2, `${table} must be selected and required for backup`);
assert.match(backup, /GIFT_TABLES\.some\(\(table\) => existing\.has\(table\)\)[\s\S]*\[\.\.\.REQUIRED_TABLES, \.\.\.GIFT_TABLES\]/,
  "a pre-migration backup may omit all gift tables, but a started migration must require the complete set");
assert.match(read("scripts/test-gifts-postgres.mts"), /Promise\.all[\s\S]*claim_founder_gift_checkout/);
assert.match(read("scripts/test-gifts-postgres.mts"), /concurrent direct Founder checkout requests must reuse one durable attempt/);
const packageJson = read("package.json");
assert.match(packageJson, /"test:gifts"/);
assert.match(packageJson, /verify:ci[^\n]*test:gifts/);

console.log("Gift purchase, delivery, redemption, and pricing contracts passed.");
