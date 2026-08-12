import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { neon } from "@neondatabase/serverless";

const connectionString = process.env.GIFT_TEST_DATABASE_URL?.trim();
if (!connectionString) {
  console.log("Gift Postgres integration tests skipped: set GIFT_TEST_DATABASE_URL to an isolated test database.");
  process.exit(0);
}

function splitSql(source: string) {
  const statements: string[] = [];
  let current = "";
  let quote: string | null = null;
  let dollarTag: string | null = null;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];
    if (!quote && !dollarTag && char === "$") {
      const match = source.slice(index).match(/^\$[A-Za-z0-9_]*\$/);
      if (match) {
        dollarTag = match[0]; current += dollarTag; index += dollarTag.length - 1; continue;
      }
    } else if (dollarTag && source.startsWith(dollarTag, index)) {
      current += dollarTag; index += dollarTag.length - 1; dollarTag = null; continue;
    }
    if (!dollarTag && (char === "'" || char === '"')) {
      if (quote === char && next === char) { current += char + next; index += 1; continue; }
      if (!quote) quote = char; else if (quote === char) quote = null;
    }
    if (char === ";" && !quote && !dollarTag) {
      if (current.trim()) statements.push(current.trim()); current = "";
    } else current += char;
  }
  if (current.trim()) statements.push(current.trim());
  return statements;
}

const sql = neon(connectionString);
const schemaName = `gift_test_${randomUUID().replaceAll("-", "")}`;
const searchPath = `SET LOCAL search_path TO "${schemaName}", public`;

async function transaction(statements: Array<{ text: string; params?: unknown[] }>) {
  return sql.transaction((tx) => [
    tx.query(searchPath),
    ...statements.map((statement) => tx.query(statement.text, statement.params || [])),
  ], { isolationLevel: "Serializable" });
}

function orderValues(id: string, recipientEmail: string, plan = "standard_annual_gift", tier = "standard") {
  return [id, `request-${id}`, `buyer-${id}`, `buyer-${id}@example.test`, recipientEmail, "Recipient", plan, tier, "now"];
}

async function insertFundedOrder(id: string, recipientEmail: string, tokenHash: string, entitlement: string) {
  await transaction([{ text: `INSERT INTO gift_orders
    (id,purchaser_request_id,purchaser_user_id,purchaser_email,recipient_email,recipient_name,gift_plan,gift_tier,delivery_mode,payment_status,redemption_token_hash,redemption_token_key_version,entitlement_version,funded_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'funded',$10,'v1',$11,NOW())`,
    params: [...orderValues(id, recipientEmail), tokenHash, entitlement] }]);
}

async function insertAndFundFounderOrder(id: string, recipientEmail: string) {
  await transaction([{ text: `INSERT INTO gift_orders
    (id,purchaser_request_id,purchaser_user_id,purchaser_email,recipient_email,recipient_name,gift_plan,gift_tier,delivery_mode)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    params: orderValues(id, recipientEmail, "founder_lifetime_gift", "bottled-in-bond") }]);
  const claim = await transaction([{ text: "SELECT * FROM claim_founder_gift_checkout($1,$2,$3)", params: [id, `buyer-${id}`, `claim-${id}`] }]);
  const founderNumber = Number((claim[1] as Array<Record<string, unknown>>)[0]?.founder_number);
  const checkoutSessionId = `cs-${id}`;
  await transaction([{ text: `UPDATE gift_orders SET stripe_checkout_session_id=$2,payment_status='checkout_open',
    checkout_claim_token=NULL,checkout_claimed_at=NULL WHERE id=$1`, params: [id, checkoutSessionId] }]);
  const funded = await transaction([{ text: "SELECT * FROM fund_gift_order($1,$2,$3,$4,$5,$6,$7,$8)", params: [
    id, `evt-fund-${id}`, checkoutSessionId, `pi-${id}`, `ch-${id}`, `hash-${id}`, "v1", 0,
  ] }]);
  assert.equal((funded[1] as Array<Record<string, unknown>>)[0]?.newly_funded, true);
  return founderNumber;
}

try {
  await sql.query(`CREATE SCHEMA "${schemaName}"`);
  const schema = await readFile(new URL("../src/lib/gift-schema.sql", import.meta.url), "utf8");
  await transaction(splitSql(schema).map((text) => ({ text })));
  await transaction([{ text: "INSERT INTO founder_reconciliation_state (singleton, clerk_user_count, completed_at) VALUES (TRUE,0,NOW())" }]);

  const founderOrders = ["gift_00000000-0000-4000-8000-000000000001", "gift_00000000-0000-4000-8000-000000000002"];
  for (const id of founderOrders) {
    await transaction([{ text: `INSERT INTO gift_orders (id,purchaser_request_id,purchaser_user_id,purchaser_email,recipient_email,recipient_name,gift_plan,gift_tier,delivery_mode)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`, params: orderValues(id, `${id}@example.test`, "founder_lifetime_gift", "bottled-in-bond") }]);
  }
  const founderClaims = await Promise.all(founderOrders.map((id, index) => transaction([
    { text: "SELECT * FROM claim_founder_gift_checkout($1,$2,$3)", params: [id, `buyer-${id}`, `claim-${index}`] },
  ])));
  const founderNumbers = founderClaims.map((result) => Number((result[1] as Array<Record<string, unknown>>)[0]?.founder_number));
  assert.equal(new Set(founderNumbers).size, 2, "concurrent Founder gift claims must reserve distinct numbers");

  const abandonedFounderId = "gift_00000000-0000-4000-8000-000000000003";
  await transaction([{ text: `INSERT INTO gift_orders (id,purchaser_request_id,purchaser_user_id,purchaser_email,recipient_email,recipient_name,gift_plan,gift_tier,delivery_mode)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`, params: orderValues(abandonedFounderId, "abandoned-founder@example.test", "founder_lifetime_gift", "bottled-in-bond") }]);
  const abandonedClaim = await transaction([{ text: "SELECT * FROM claim_founder_gift_checkout($1,$2,$3)", params: [abandonedFounderId, `buyer-${abandonedFounderId}`, "claim-abandoned-founder"] }]);
  const abandonedFounderNumber = Number((abandonedClaim[1] as Array<Record<string, unknown>>)[0]?.founder_number);
  const abandonedRelease = await transaction([{ text: "SELECT revoke_founder_gift_reservation($1) AS founder_number", params: [abandonedFounderId] }]);
  assert.equal((abandonedRelease[1] as Array<Record<string, unknown>>)[0]?.founder_number, abandonedFounderNumber,
    "an unfunded abandoned Founder gift may release its reservation");
  const abandonedReservation = await transaction([{ text: "SELECT status,gift_order_id FROM founder_spot_reservations WHERE founder_number=$1", params: [abandonedFounderNumber] }]);
  assert.deepEqual(abandonedReservation[1], [{ status: "revoked", gift_order_id: null }]);

  const refundedFounderId = "gift_00000000-0000-4000-8000-000000000004";
  const refundedFounderNumber = await insertAndFundFounderOrder(refundedFounderId, "refunded-founder@example.test");
  const fundedRelease = await transaction([{ text: "SELECT revoke_founder_gift_reservation($1) AS founder_number", params: [refundedFounderId] }]);
  assert.equal((fundedRelease[1] as Array<Record<string, unknown>>)[0]?.founder_number, null,
    "a funded Founder gift cannot be explicitly revoked before redemption");
  await transaction([{ text: "SELECT id FROM record_gift_refund($1,$2,$3,TRUE,$4,$5,$6)", params: [refundedFounderId, "evt-refunded-founder", "refund_full", "full", 5000, 5000] }]);
  const refundedFounderReservation = await transaction([{ text: `SELECT reservations.status,reservations.gift_order_id,orders.funded_at IS NOT NULL AS funded
    FROM founder_spot_reservations reservations JOIN gift_orders orders ON orders.id=reservations.gift_order_id
    WHERE reservations.founder_number=$1`, params: [refundedFounderNumber] }]);
  assert.deepEqual(refundedFounderReservation[1], [{ status: "reserved", gift_order_id: refundedFounderId, funded: true }],
    "a funded Founder number remains permanently consumed after a pre-redemption refund");

  const disputedFounderId = "gift_00000000-0000-4000-8000-000000000005";
  const disputedFounderNumber = await insertAndFundFounderOrder(disputedFounderId, "disputed-founder@example.test");
  await transaction([{ text: "SELECT id FROM record_gift_dispute($1,$2,$3)", params: [disputedFounderId, "evt-disputed-founder", "open"] }]);
  const disputedFounderReservation = await transaction([{ text: `SELECT reservations.status,reservations.gift_order_id,orders.funded_at IS NOT NULL AS funded
    FROM founder_spot_reservations reservations JOIN gift_orders orders ON orders.id=reservations.gift_order_id
    WHERE reservations.founder_number=$1`, params: [disputedFounderNumber] }]);
  assert.deepEqual(disputedFounderReservation[1], [{ status: "reserved", gift_order_id: disputedFounderId, funded: true }],
    "a funded Founder number remains permanently consumed after a pre-redemption dispute");

  const directAttempts = ["founder_attempt_a", "founder_attempt_b"];
  const directClaims = await Promise.all(directAttempts.map((attempt) => transaction([
    { text: "SELECT * FROM claim_direct_founder_checkout($1,$2)", params: [attempt, "direct-founder-user"] },
  ])));
  const durableDirectAttemptIds = directClaims.map((result) => String((result[1] as Array<Record<string, unknown>>)[0]?.attempt_id));
  const directNumbers = directClaims.map((result) => Number((result[1] as Array<Record<string, unknown>>)[0]?.founder_number));
  assert.equal(new Set(durableDirectAttemptIds).size, 1, "concurrent direct Founder checkout requests must reuse one durable attempt");
  assert.equal(new Set(directNumbers).size, 1, "concurrent direct Founder checkout requests must reuse one reservation");
  const durableDirectAttemptId = durableDirectAttemptIds[0];
  await transaction([{ text: "UPDATE direct_founder_checkout_reservations SET checkout_session_id='cs_direct',status='open' WHERE attempt_id=$1", params: [durableDirectAttemptId] }]);
  const directCompletion = await transaction([
    { text: "SELECT * FROM complete_direct_founder_checkout($1,$2,$3,$4,$5)", params: [durableDirectAttemptId, "direct-founder-user", "cs_direct", "pi_direct", "ch_direct"] },
  ]);
  assert.equal((directCompletion[1] as Array<Record<string, unknown>>)[0]?.newly_paid, true);

  const expiredAttempt = "founder_expired_late";
  const expiredClaim = await transaction([{ text: "SELECT * FROM claim_direct_founder_checkout($1,$2)", params: [expiredAttempt, "expired-founder-user"] }]);
  const expiredDurableAttempt = String((expiredClaim[1] as Array<Record<string, unknown>>)[0]?.attempt_id);
  await transaction([{ text: "UPDATE direct_founder_checkout_reservations SET checkout_session_id='cs_expired',status='expired' WHERE attempt_id=$1", params: [expiredDurableAttempt] }]);
  const expiredLate = await transaction([{ text: "SELECT * FROM complete_direct_founder_checkout($1,$2,$3,$4,$5)", params: [expiredDurableAttempt, "expired-founder-user", "cs_expired", "pi_expired", "ch_expired"] }]);
  assert.equal((expiredLate[1] as Array<Record<string, unknown>>)[0]?.late_payment, true, "an expired direct Founder payment becomes a refund obligation without assigning a revoked spot");
  const expiredState = await transaction([{ text: "SELECT status,refund_handling,stripe_charge_id FROM direct_founder_checkout_reservations WHERE attempt_id=$1", params: [expiredDurableAttempt] }]);
  assert.deepEqual(expiredState[1], [{ status: "late_payment", refund_handling: "automatic_pending", stripe_charge_id: "ch_expired" }]);

  await transaction([{ text: `INSERT INTO founder_spot_reservations
    (founder_number,source_type,source_id,user_id,status,assigned_at)
    VALUES (99,'direct','direct:duplicate-founder-user','duplicate-founder-user','assigned',NOW())` }]);
  await transaction([{ text: `INSERT INTO direct_founder_checkout_reservations
    (attempt_id,user_id,founder_number,checkout_session_id,entitlement_version,status)
    VALUES ('founder_duplicate_durable','duplicate-founder-user',99,'cs_duplicate_durable','duplicate-entitlement','open')` }]);
  const duplicateCompletion = await transaction([{ text: "SELECT * FROM complete_direct_founder_checkout($1,$2,$3,$4,$5)", params: [
    "founder_duplicate_durable", "duplicate-founder-user", "cs_duplicate_durable", "pi_duplicate", "ch_duplicate",
  ] }]);
  assert.equal((duplicateCompletion[1] as Array<Record<string, unknown>>)[0]?.newly_paid, true,
    "an already-numbered Clerk Founder must attach to the exact durable direct purchase instead of becoming a late payment");
  const duplicateOwnership = await transaction([{ text: "SELECT status,source_id FROM founder_spot_reservations WHERE founder_number=99" }]);
  assert.deepEqual(duplicateOwnership[1], [{ status: "assigned", source_id: "direct-checkout:founder_duplicate_durable" }]);

  const recipientEmail = "repeat-recipient@example.test";
  const redemptionOrders = ["gift_00000000-0000-4000-8000-000000000011", "gift_00000000-0000-4000-8000-000000000012"];
  for (const [index, id] of redemptionOrders.entries()) await insertFundedOrder(id, recipientEmail, `hash-${index}`, `entitlement-${index}`);
  const redemptionClaims = await Promise.allSettled(redemptionOrders.map((id, index) => transaction([
    { text: "SELECT id FROM claim_gift_redemption($1,$2,$3,$4,$5)", params: [id, `hash-${index}`, "recipient-user", recipientEmail, `redeem-claim-${index}`] },
  ])));
  assert.equal(redemptionClaims.filter((result) => result.status === "fulfilled").length, 1, "active claims for one recipient must serialize");
  const claimedIndex = redemptionClaims.findIndex((result) => result.status === "fulfilled");
  const claimedId = redemptionOrders[claimedIndex];
  const claimToken = `redeem-claim-${claimedIndex}`;
  await transaction([{ text: "SELECT begin_gift_redemption_activation($1,$2,$3,$4)", params: [claimedId, "recipient-user", recipientEmail, claimToken] }]);
  await assert.rejects(transaction([{ text: "SELECT id FROM claim_gift_redemption($1,$2,$3,$4,$5)", params: [redemptionOrders[1 - claimedIndex], `hash-${1 - claimedIndex}`, "recipient-user", recipientEmail, "blocked-during-activation"] }]));
  await transaction([{ text: "SELECT id FROM finalize_gift_redemption($1,$2,$3,$4,$5)", params: [claimedId, "recipient-user", recipientEmail, claimToken, new Date().toISOString()] }]);
  await assert.rejects(transaction([{ text: "SELECT id FROM claim_gift_redemption($1,$2,$3,$4,$5)", params: [redemptionOrders[1 - claimedIndex], `hash-${1 - claimedIndex}`, "recipient-user", recipientEmail, "blocked-unexpired"] }]));
  await transaction([{ text: "UPDATE gift_orders SET access_expires_at = NOW() - INTERVAL '1 second' WHERE id = $1", params: [claimedId] }]);
  const repeatClaim = await transaction([{ text: "SELECT id FROM claim_gift_redemption($1,$2,$3,$4,$5)", params: [redemptionOrders[1 - claimedIndex], `hash-${1 - claimedIndex}`, "recipient-user", recipientEmail, "repeat-after-expiry"] }]);
  assert.equal((repeatClaim[1] as Array<Record<string, unknown>>)[0]?.id, redemptionOrders[1 - claimedIndex], "an expired annual gift must not permanently block a later gift");
  const history = await transaction([{ text: "SELECT gift_order_id,status FROM gift_redemption_recipients ORDER BY gift_order_id" }]);
  assert.equal((history[1] as Array<Record<string, unknown>>).length, 2, "repeat redemptions keep per-order history");

  const fencedId = "gift_00000000-0000-4000-8000-000000000021";
  await transaction([{ text: `INSERT INTO gift_orders (id,purchaser_request_id,purchaser_user_id,purchaser_email,recipient_email,recipient_name,gift_plan,gift_tier,delivery_mode,payment_status,checkout_attempt,stripe_checkout_session_id)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'checkout_open',1,'cs_current')`, params: orderValues(fencedId, "fenced@example.test") }]);
  await transaction([{ text: `INSERT INTO gift_payment_attempts (gift_order_id,checkout_attempt,checkout_session_id,status) VALUES
    ($1,0,'cs_old','expired'),($1,1,'cs_current','open')`, params: [fencedId] }]);
  const late = await transaction([{ text: "SELECT * FROM fund_gift_order($1,$2,$3,$4,$5,$6,$7,$8)", params: [fencedId, "evt-old-paid", "cs_old", "pi_old", "ch_old", "old-hash", "v1", 0] }]);
  assert.equal((late[1] as Array<Record<string, unknown>>)[0]?.late_payment, true);
  const current = await transaction([{ text: "SELECT * FROM fund_gift_order($1,$2,$3,$4,$5,$6,$7,$8)", params: [fencedId, "evt-current-paid", "cs_current", "pi_current", "ch_current", "current-hash", "v1", 1] }]);
  assert.equal((current[1] as Array<Record<string, unknown>>)[0]?.newly_funded, true);
  const payments = await transaction([{ text: "SELECT checkout_attempt,stripe_payment_intent_id,stripe_charge_id,status FROM gift_payment_attempts WHERE gift_order_id=$1 ORDER BY checkout_attempt", params: [fencedId] }]);
  assert.deepEqual(payments[1], [
    { checkout_attempt: 0, stripe_payment_intent_id: "pi_old", stripe_charge_id: "ch_old", status: "late_payment" },
    { checkout_attempt: 1, stripe_payment_intent_id: "pi_current", stripe_charge_id: "ch_current", status: "paid" },
  ], "both successful payment attempts must remain durable");
  const paymentEvents = await transaction([{ text: "SELECT event_type FROM gift_order_events WHERE gift_order_id=$1 ORDER BY id", params: [fencedId] }]);
  assert.deepEqual(paymentEvents[1], [{ event_type: "late_payment" }, { event_type: "payment_succeeded" }]);

  const refundId = "gift_00000000-0000-4000-8000-000000000031";
  await insertFundedOrder(refundId, "refund@example.test", "refund-hash", "refund-entitlement");
  await transaction([{ text: "SELECT id FROM record_gift_refund($1,$2,$3,FALSE,$4,$5,$6)", params: [refundId, "evt-partial", "refund_partial", "partial", 1000, 3000] }]);
  let refundState = await transaction([{ text: "SELECT payment_status,refunded_at,risk_flag FROM gift_orders WHERE id=$1", params: [refundId] }]);
  assert.deepEqual(refundState[1], [{ payment_status: "funded", refunded_at: null, risk_flag: "refund_partial" }], "partial refunds must not revoke access");
  await transaction([{ text: "SELECT id FROM record_gift_refund($1,$2,$3,TRUE,$4,$5,$6)", params: [refundId, "evt-full", "refund_full", "full", 3000, 3000] }]);
  refundState = await transaction([{ text: "SELECT payment_status,refunded_at IS NOT NULL AS refunded,risk_flag FROM gift_orders WHERE id=$1", params: [refundId] }]);
  assert.deepEqual(refundState[1], [{ payment_status: "refunded", refunded: true, risk_flag: "full_refund" }], "only a successful full refund revokes the gift");
  await transaction([{ text: "SELECT * FROM fund_gift_order($1,$2,$3,$4,$5,$6,$7,$8)", params: [refundId, "evt-late-after-refund", "cs_late", "pi_late", "ch_late", "new-hash", "v2", 99] }]);
  const adverse = await transaction([{ text: "SELECT payment_status,redemption_token_key_version FROM gift_orders WHERE id=$1", params: [refundId] }]);
  assert.deepEqual(adverse[1], [{ payment_status: "refunded", redemption_token_key_version: "v1" }], "late/out-of-order success must not regrant a refunded gift");

  const adverseActivationId = "gift_00000000-0000-4000-8000-000000000041";
  await insertFundedOrder(adverseActivationId, "adverse-activation@example.test", "adverse-hash", "adverse-entitlement");
  await transaction([{ text: "SELECT id FROM claim_gift_redemption($1,$2,$3,$4,$5)", params: [adverseActivationId, "adverse-hash", "adverse-user", "adverse-activation@example.test", "adverse-claim"] }]);
  await transaction([{ text: "SELECT begin_gift_redemption_activation($1,$2,$3,$4)", params: [adverseActivationId, "adverse-user", "adverse-activation@example.test", "adverse-claim"] }]);
  const authorizedActivation = await transaction([{ text: "SELECT id FROM authorize_gift_activation($1,$2,$3,$4)", params: [adverseActivationId, "adverse-user", "adverse-activation@example.test", "adverse-claim"] }]);
  assert.equal((authorizedActivation[1] as Array<Record<string, unknown>>).length, 1, "a funded non-adverse activation claim is authorized");
  await transaction([{ text: "SELECT id FROM record_gift_refund($1,$2,$3,TRUE,$4,$5,$6)", params: [adverseActivationId, "evt-adverse-activation", "refund_full", "full", 3000, 3000] }]);
  const rejectedActivation = await transaction([{ text: "SELECT id FROM authorize_gift_activation($1,$2,$3,$4)", params: [adverseActivationId, "adverse-user", "adverse-activation@example.test", "adverse-claim"] }]);
  assert.equal((rejectedActivation[1] as Array<Record<string, unknown>>).length, 0, "refunds fence Clerk activation before access can be finalized");
  const abandoned = await transaction([{ text: `SELECT claims.status,
    NOT EXISTS (SELECT 1 FROM gift_recipient_locks locks WHERE locks.gift_order_id=$1) AS lock_released
    FROM gift_redemption_recipients claims WHERE claims.gift_order_id=$1`, params: [adverseActivationId] }]);
  assert.deepEqual(abandoned[1], [{ status: "abandoned", lock_released: true }], "an adverse payment terminates an in-flight activation and releases its recipient lock");

  const wonDisputeId = "gift_00000000-0000-4000-8000-000000000045";
  await insertFundedOrder(wonDisputeId, "won-dispute@example.test", "won-hash", "won-entitlement");
  await transaction([{ text: `UPDATE gift_orders SET redeemed_by_user_id='won-user',redeemed_by_email='won-dispute@example.test',
    redeemed_at=NOW(),access_starts_at=NOW(),access_expires_at=NOW() + INTERVAL '1 year' WHERE id=$1`, params: [wonDisputeId] }]);
  await transaction([{ text: "SELECT id FROM record_gift_dispute($1,$2,$3)", params: [wonDisputeId, "evt-dispute-open", "open"] }]);
  let disputeState = await transaction([{ text: "SELECT payment_status,dispute_status,disputed_at IS NOT NULL AS disputed,adverse_reconciled_at FROM gift_orders WHERE id=$1", params: [wonDisputeId] }]);
  assert.deepEqual(disputeState[1], [{ payment_status: "disputed", dispute_status: "open", disputed: true, adverse_reconciled_at: null }], "an open dispute remains pending for fail-closed revocation");
  await transaction([{ text: "SELECT id FROM record_gift_dispute($1,$2,$3)", params: [wonDisputeId, "evt-dispute-won", "won"] }]);
  disputeState = await transaction([{ text: `SELECT payment_status,dispute_status,disputed_at,adverse_reconciled_at,
    entitlement_version,access_starts_at IS NOT NULL AS has_start,access_expires_at > NOW() AS still_valid
    FROM gift_orders WHERE id=$1`, params: [wonDisputeId] }]);
  assert.deepEqual(disputeState[1], [{
    payment_status: "funded", dispute_status: "won", disputed_at: null, adverse_reconciled_at: null,
    entitlement_version: "won-entitlement", has_start: true, still_valid: true,
  }], "a won dispute preserves the exact entitlement and remains retryable until Clerk restoration is confirmed");

  const deliveryRaceId = "gift_00000000-0000-4000-8000-000000000051";
  await insertFundedOrder(deliveryRaceId, "delivery-race@example.test", "delivery-hash", "delivery-entitlement");
  await transaction([{ text: "UPDATE gift_orders SET delivery_status='claimed',delivery_claim_token='delivery-claim' WHERE id=$1", params: [deliveryRaceId] }]);
  await transaction([{ text: "UPDATE gift_orders SET payment_status='disputed',disputed_at=NOW(),dispute_status='open' WHERE id=$1", params: [deliveryRaceId] }]);
  const unauthorizedDelivery = await transaction([{ text: "SELECT id FROM authorize_gift_delivery_send($1,$2)", params: [deliveryRaceId, "delivery-claim"] }]);
  assert.equal((unauthorizedDelivery[1] as Array<Record<string, unknown>>).length, 0, "delivery authorization must fail after an adverse race");

  console.log("Gift Postgres concurrency, Founder consumption, repeat-redemption, fencing, ordering, and refund tests passed.");
} finally {
  await sql.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
}
