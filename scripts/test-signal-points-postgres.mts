import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Pool } from "pg";

const connectionString = process.env.SIGNAL_POINTS_TEST_DATABASE_URL?.trim();
if (!connectionString) {
  console.log("Signal Points Postgres integration tests skipped: set SIGNAL_POINTS_TEST_DATABASE_URL to an isolated test database.");
  process.exit(0);
}

function splitSql(source: string) {
  const statements: string[] = []; let current = ""; let quote: string | null = null; let dollarTag: string | null = null;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index]; const next = source[index + 1];
    if (!quote && !dollarTag && char === "$") { const match = source.slice(index).match(/^\$[A-Za-z0-9_]*\$/); if (match) { dollarTag = match[0]; current += dollarTag; index += dollarTag.length - 1; continue; } }
    else if (dollarTag && source.startsWith(dollarTag, index)) { current += dollarTag; index += dollarTag.length - 1; dollarTag = null; continue; }
    if (!dollarTag && (char === "'" || char === '"')) { if (quote === char && next === char) { current += char + next; index += 1; continue; } if (!quote) quote = char; else if (quote === char) quote = null; }
    if (char === ";" && !quote && !dollarTag) { if (current.trim()) statements.push(current.trim()); current = ""; } else current += char;
  }
  if (current.trim()) statements.push(current.trim()); return statements;
}

const pool = new Pool({ connectionString, max: 4 });
const sql = { query: async (text: string, params?: unknown[]) => (await pool.query(text, params)).rows };
const schemaName = `signal_points_test_${randomUUID().replaceAll("-", "")}`;
const searchPath = `SET LOCAL search_path TO "${schemaName}", public`;
async function transaction(statements: Array<{ text: string; params?: unknown[] }>) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN ISOLATION LEVEL READ COMMITTED");
    const results: unknown[][] = [(await client.query(searchPath)).rows];
    for (const statement of statements) results.push((await client.query(statement.text, statement.params)).rows);
    await client.query("COMMIT");
    return results;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}
const row = (result: unknown[][], index = 1) => result[index][0] as Record<string, unknown>;
async function seedShipping(userId: string) {
  await transaction([{ text: `INSERT INTO founder_glass_shipping
    (user_id,account_email,recipient_name,address_line1,address_line2,city,state_code,postal_code,country_code,phone,status)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,'US',$9,'confirmed')`, params: [
    userId, `${userId}@example.com`, `Recipient ${userId}`, "123 Before Cutover Ave", "Unit 4", "Louisville", "KY", "40202", "502-555-0100",
  ] }]);
}

try {
  await sql.query(`CREATE SCHEMA "${schemaName}"`);
  for (const file of ["../src/lib/referral-schema.sql", "../src/lib/founder-shipping-schema.sql", "../src/lib/signal-points-schema.sql", "../src/lib/community-sightings-schema.sql"]) {
    const source = await readFile(new URL(file, import.meta.url), "utf8");
    await transaction(splitSql(source).map((text) => ({ text })));
  }
  await transaction([{ text: `INSERT INTO signal_point_migrations(migration_key,details)
    VALUES('signal_points_clerk_metadata_v1_verified_complete','{"testOnly":true}'::jsonb)` }]);

  const generationOne = await transaction([{ text: "SELECT next_community_sighting_reward_generation($1) AS generation", params: ["generation-member"] }]);
  const generationTwo = await transaction([{ text: "SELECT next_community_sighting_reward_generation($1) AS generation", params: ["generation-member"] }]);
  assert.deepEqual([row(generationOne).generation, row(generationTwo).generation], ["1", "2"], "community sighting reward generations are durable and monotonic per user");

  const sourcePrefix = "signal_points_clerk_metadata_v1";
  const sourceSnapshot = (entries: Array<{ sourceKey: string; targetPoints: number }>) => JSON.stringify(entries.map((entry) => ({ ...entry, metadata: {} })));
  const reconcileSet = (userId: string, generation: number, entries: Array<{ sourceKey: string; targetPoints: number }>, key: string) => transaction([{
    text: "SELECT * FROM reconcile_signal_point_source_set($1,$2,$3,$4::jsonb,$5,$6::jsonb)",
    params: [userId, sourcePrefix, generation, sourceSnapshot(entries), key, "{}"],
  }]);
  await transaction([{ text: "SELECT next_community_sighting_reward_generation($1)", params: ["stale-snapshot-member"] }]);
  await transaction([{ text: "SELECT next_community_sighting_reward_generation($1)", params: ["stale-snapshot-member"] }]);
  await reconcileSet("stale-snapshot-member", 1, [{ sourceKey: `${sourcePrefix}:entry:old`, targetPoints: 10 }], "generation-1-overtaken");
  const overtakenSnapshot = await transaction([{ text: "SELECT balance FROM signal_point_accounts WHERE user_id=$1", params: ["stale-snapshot-member"] }]);
  assert.equal(row(overtakenSnapshot).balance, 0, "an allocated newer mutation prevents an older snapshot from applying before the newer reconciliation starts");
  await reconcileSet("stale-snapshot-member", 2, [{ sourceKey: `${sourcePrefix}:entry:new`, targetPoints: 20 }], "generation-2");
  await reconcileSet("stale-snapshot-member", 1, [{ sourceKey: `${sourcePrefix}:entry:old`, targetPoints: 10 }], "generation-1-stale-retry");
  const staleSnapshot = await transaction([{ text: `SELECT balance,debt,
    (SELECT generation FROM signal_point_reward_generations WHERE user_id=$1) AS generation,
    (SELECT COALESCE(SUM(points),0)::int FROM signal_point_source_balances WHERE user_id=$1 AND (source_key=$2 OR source_key LIKE $2||':%')) AS source_points
    FROM signal_point_accounts WHERE user_id=$1`, params: ["stale-snapshot-member", sourcePrefix] }]);
  assert.deepEqual(row(staleSnapshot), { balance: 20, debt: 0, generation: "2", source_points: 20 }, "an older full snapshot cannot restore a source removed by a newer generation");

  const largeTargets = Array.from({ length: 1001 }, (_, index) => ({ sourceKey: `${sourcePrefix}:entry:bulk-${index}`, targetPoints: 1 }));
  await transaction([{ text: "SELECT next_community_sighting_reward_generation($1)", params: ["complete-set-member"] }]);
  await reconcileSet("complete-set-member", 1, largeTargets, "complete-set-1");
  await transaction([{ text: "SELECT next_community_sighting_reward_generation($1)", params: ["complete-set-member"] }]);
  await reconcileSet("complete-set-member", 2, [largeTargets[1000]], "complete-set-2");
  const completeSet = await transaction([{ text: `SELECT balance,
    (SELECT COUNT(*)::int FROM signal_point_source_balances WHERE user_id=$1 AND points<>0) AS nonzero_sources,
    (SELECT COUNT(*)::int FROM signal_point_ledger WHERE user_id=$1 AND entry_kind='migration_debit') AS zeroing_entries
    FROM signal_point_accounts WHERE user_id=$1`, params: ["complete-set-member"] }]);
  assert.deepEqual(row(completeSet), { balance: 1, nonzero_sources: 1, zeroing_entries: 1000 }, "full source-set reconciliation zeros every omitted source beyond the former 1000-entry cap");

  const referralSeed = await transaction([
    { text: "ALTER TABLE member_referral_point_ledger DISABLE TRIGGER member_referral_signal_points_mirror" },
    { text: `INSERT INTO member_referral_point_ledger(event_key,referrer_user_id,referred_user_id,tier,reason,points)
      VALUES('legacy-adjustment-event','legacy-referrer','legacy-referred','free','referral_free',10) RETURNING id` },
    { text: "ALTER TABLE member_referral_point_ledger ENABLE TRIGGER member_referral_signal_points_mirror" },
  ]);
  const legacyReferralLedgerId = row(referralSeed, 2).id;
  await transaction([
    { text: "INSERT INTO signal_point_accounts(user_id,balance,debt) VALUES('legacy-referrer',0,5)" },
    { text: `INSERT INTO signal_point_ledger(user_id,idempotency_key,entry_kind,points,balance_delta,debt_delta,source_type,source_key,metadata)
      VALUES('legacy-referrer',$1,'credit',1,1,0,'referral','legacy-referred',jsonb_build_object('legacyReferralLedgerId',$2::bigint))`, params: [`referral-ledger:${legacyReferralLedgerId}`, legacyReferralLedgerId] },
    { text: `INSERT INTO signal_point_ledger(user_id,idempotency_key,entry_kind,points,balance_delta,debt_delta,source_type,metadata)
      VALUES('legacy-referrer','legacy-spend','debit',-6,-1,5,'test','{}'::jsonb)` },
  ]);
  const signalSchema = await readFile(new URL("../src/lib/signal-points-schema.sql", import.meta.url), "utf8");
  await transaction([{ text: `INSERT INTO signal_reward_catalog(item_key,catalog_version,name,points_cost,fulfillment_type,option_snapshot,active)
    VALUES('bourbon_shipping_gift_card_25',1,'$25 bourbon-shipping partner gift card',650,'digital','{"ownerFulfillment":true,"requiresAge21Attestation":true}'::jsonb,TRUE)
    ON CONFLICT(item_key) DO UPDATE SET active=TRUE` }]);
  await transaction([{ text: "UPDATE signal_reward_catalog SET active=FALSE WHERE item_key='sticker_pack'" }]);
  await transaction(splitSql(signalSchema).map((text) => ({ text })));
  await transaction(splitSql(signalSchema).map((text) => ({ text })));
  const giftCardRollover = await transaction([{ text: `SELECT item_key,points_cost,active FROM signal_reward_catalog
    WHERE item_key IN ('bourbon_shipping_gift_card_25','bourbon_shipping_gift_card_100') ORDER BY item_key` }]);
  assert.deepEqual(giftCardRollover[1], [
    { item_key: "bourbon_shipping_gift_card_100", points_cost: 2600, active: true },
    { item_key: "bourbon_shipping_gift_card_25", points_cost: 650, active: false },
  ], "gift card rollover preserves the retired historical SKU while activating $100 at four times the points");
  const preservedEmergencyDisable = await transaction([{ text: "SELECT active FROM signal_reward_catalog WHERE item_key='sticker_pack'" }]);
  assert.equal(row(preservedEmergencyDisable).active, false, "schema reapplication preserves an emergency-disabled current SKU");
  await transaction([{ text: "UPDATE signal_reward_catalog SET active=TRUE WHERE item_key='sticker_pack'" }]);
  const adjustedReferral = await transaction([{ text: `SELECT balance,debt,
    (SELECT COUNT(*) FROM signal_point_ledger WHERE user_id=$1 AND idempotency_key=$2) AS adjustment_count,
    (SELECT points FROM signal_point_ledger WHERE user_id=$1 AND idempotency_key=$2) AS adjustment_points
    FROM signal_point_accounts WHERE user_id=$1`, params: ["legacy-referrer", `referral-ledger-adjustment-9x:${legacyReferralLedgerId}`] }]);
  assert.deepEqual(row(adjustedReferral), { balance: 4, debt: 0, adjustment_count: "1", adjustment_points: 9 }, "pre-cutover 1x referral imports receive one append-only 9x adjustment and economic account recomputation");
  const newReferral = await transaction([{
    text: `INSERT INTO member_referral_point_ledger(event_key,referrer_user_id,referred_user_id,tier,reason,points)
      VALUES('post-cutover-event','post-cutover-referrer','post-cutover-referred','standard','referral_standard',50) RETURNING id`,
  }]);
  const newReferralLedgerId = row(newReferral).id;
  const newReferralImport = await transaction([{ text: `SELECT balance,debt,
    (SELECT points FROM signal_point_ledger WHERE user_id=$1 AND idempotency_key=$2) AS imported_points,
    (SELECT COUNT(*) FROM signal_point_ledger WHERE user_id=$1 AND idempotency_key=$3) AS adjustment_count
    FROM signal_point_accounts WHERE user_id=$1`, params: ["post-cutover-referrer", `referral-ledger:${newReferralLedgerId}`, `referral-ledger-adjustment-9x:${newReferralLedgerId}`] }]);
  assert.deepEqual(row(newReferralImport), { balance: 50, debt: 0, imported_points: 50, adjustment_count: "0" }, "new referral ledger rows continue importing at their already-scaled 10x value without an adjustment");
  await transaction([{ text: "SELECT credit_signal_points($1,$2,$3,$4,$5::jsonb)", params: ["member", 100, "seed", "test", "{}"] }]);
  await seedShipping("member");
  const attempts = await Promise.allSettled(["a", "b"].map((key) => transaction([{ text: "SELECT * FROM reserve_signal_reward($1,$2,$3,$4,$5,$6::jsonb,$7,$8)", params: [randomUUID(), "member", "standard", "sticker_pack", key, "{}", "member@example.com", true] }])));
  assert.equal(attempts.filter((attempt) => attempt.status === "fulfilled").length, 1, "concurrent redemptions cannot double-spend");

  await transaction([{ text: "SELECT credit_signal_points($1,$2,$3,$4,$5::jsonb)", params: ["retry-member", 100, "retry-seed", "test", "{}"] }]);
  await seedShipping("retry-member");
  const redemptionId = randomUUID();
  const first = await transaction([{ text: "SELECT * FROM reserve_signal_reward($1,$2,$3,$4,$5,$6::jsonb,$7,$8)", params: [redemptionId, "retry-member", "standard", "sticker_pack", "same-key", "{}", "retry@example.com", true] }]);
  const retry = await transaction([{ text: "SELECT * FROM reserve_signal_reward($1,$2,$3,$4,$5,$6::jsonb,$7,$8)", params: [randomUUID(), "retry-member", "standard", "sticker_pack", "same-key", "{}", "retry@example.com", true] }]);
  assert.equal(row(first).redemption_id, row(retry).redemption_id, "idempotent retry returns the original redemption");
  await transaction([{ text: "SELECT * FROM transition_signal_reward_redemption($1,$2,$3,$4,$5::jsonb)", params: [redemptionId, "retry-member", "canceled", "member", "{}"] }]);
  await transaction([{ text: "SELECT * FROM transition_signal_reward_redemption($1,$2,$3,$4,$5::jsonb)", params: [redemptionId, "retry-member", "canceled", "member", "{}"] }]);
  const canceled = await transaction([{ text: "SELECT balance, (SELECT COUNT(*) FROM signal_point_ledger WHERE redemption_id=$2 AND entry_kind='cancellation_credit') AS credits FROM signal_point_accounts WHERE user_id=$1", params: ["retry-member", redemptionId] }]);
  assert.deepEqual(row(canceled), { balance: 100, credits: "1" }, "cancellation restores points exactly once");
  await assert.rejects(transaction([{ text: "SELECT * FROM transition_signal_reward_redemption($1,$2,$3,$4,$5::jsonb)", params: [redemptionId, "retry-member", "approved", "owner", "{}"] }]));

  await transaction([{ text: "UPDATE signal_reward_catalog SET inventory_remaining=1 WHERE item_key='rocks_glass'" }]);
  for (const user of ["inventory-a", "inventory-b"]) {
    await transaction([{ text: "SELECT credit_signal_points($1,$2,$3,$4,$5::jsonb)", params: [user, 500, `seed-${user}`, "test", "{}"] }]);
    await seedShipping(user);
  }
  const inventory = await Promise.allSettled(["inventory-a", "inventory-b"].map((user) => transaction([{ text: "SELECT * FROM reserve_signal_reward($1,$2,$3,$4,$5,$6::jsonb,$7,$8)", params: [randomUUID(), user, "standard", "rocks_glass", `claim-${user}`, '{"glassStyle":"standard"}', `${user}@example.com`, true] }])));
  assert.equal(inventory.filter((attempt) => attempt.status === "fulfilled").length, 1, "only one member claims the final inventory item");

  for (const target of [80, 120, 80]) {
    await transaction([{ text: "SELECT reconcile_signal_point_source($1,$2,$3,$4,$5::jsonb)", params: ["cycle-member", "clerk", target, `snapshot-${target}`, "{}"] }]);
  }
  const cycled = await transaction([{ text: "SELECT balance, (SELECT revision FROM signal_point_source_balances WHERE user_id=$1 AND source_key='clerk') AS revision FROM signal_point_accounts WHERE user_id=$1", params: ["cycle-member"] }]);
  assert.deepEqual(row(cycled), { balance: 80, revision: 3 }, "a source can return to a prior target without an idempotency collision");

  await transaction([{ text: "SELECT reconcile_signal_point_source($1,$2,$3,$4,$5::jsonb)", params: ["debt-member", "clerk", 100, "debt-initial", "{}"] }]);
  await seedShipping("debt-member");
  await transaction([{ text: "SELECT * FROM reserve_signal_reward($1,$2,$3,$4,$5,$6::jsonb,$7,$8)", params: [randomUUID(), "debt-member", "standard", "sticker_pack", "debt-spend", "{}", "debt-member@example.com", true] }]);
  await transaction([{ text: "SELECT reconcile_signal_point_source($1,$2,$3,$4,$5::jsonb)", params: ["debt-member", "clerk", 0, "debt-rejection", "{}"] }]);
  const rejected = await transaction([{ text: `SELECT balance,debt,
    (SELECT points FROM signal_point_ledger WHERE user_id=$1 AND entry_kind='migration_debit' ORDER BY id DESC LIMIT 1) AS correction_points,
    (SELECT balance_delta FROM signal_point_ledger WHERE user_id=$1 AND entry_kind='migration_debit' ORDER BY id DESC LIMIT 1) AS correction_balance_delta,
    (SELECT debt_delta FROM signal_point_ledger WHERE user_id=$1 AND entry_kind='migration_debit' ORDER BY id DESC LIMIT 1) AS correction_debt_delta
    FROM signal_point_accounts WHERE user_id=$1`, params: ["debt-member"] }]);
  assert.deepEqual(row(rejected), { balance: 0, debt: 75, correction_points: -100, correction_balance_delta: -25, correction_debt_delta: 75 }, "rejection records the full correction and converts the uncovered amount to debt");
  await transaction([{ text: "SELECT credit_signal_points($1,$2,$3,$4,$5::jsonb)", params: ["debt-member", 40, "later-credit", "test", "{}"] }]);
  const partialSettlement = await transaction([{ text: `SELECT balance,debt,
    (SELECT points FROM signal_point_ledger WHERE user_id=$1 AND idempotency_key='later-credit') AS credit_points,
    (SELECT balance_delta FROM signal_point_ledger WHERE user_id=$1 AND idempotency_key='later-credit') AS credit_balance_delta,
    (SELECT debt_delta FROM signal_point_ledger WHERE user_id=$1 AND idempotency_key='later-credit') AS credit_debt_delta
    FROM signal_point_accounts WHERE user_id=$1`, params: ["debt-member"] }]);
  assert.deepEqual(row(partialSettlement), { balance: 0, debt: 35, credit_points: 40, credit_balance_delta: 0, credit_debt_delta: -40 }, "a later credit settles debt before becoming spendable");
  await transaction([{ text: "SELECT reconcile_signal_point_source($1,$2,$3,$4,$5::jsonb)", params: ["debt-member", "referral", 50, "later-source-credit", "{}"] }]);
  const settled = await transaction([{ text: "SELECT balance,debt FROM signal_point_accounts WHERE user_id=$1", params: ["debt-member"] }]);
  assert.deepEqual(row(settled), { balance: 15, debt: 0 }, "credits from any source finish repaying debt before increasing spendable points");

  const creditReplay = await transaction([{ text: "SELECT credit_signal_points($1,$2,$3,$4,$5::jsonb) AS balance", params: ["credit-retry", 25, "credit-key", "sighting", '{"sightingId":"one"}'] }]);
  const matchingCreditReplay = await transaction([{ text: "SELECT credit_signal_points($1,$2,$3,$4,$5::jsonb) AS balance", params: ["credit-retry", 25, "credit-key", "sighting", '{"sightingId":"one"}'] }]);
  assert.equal(row(creditReplay).balance, row(matchingCreditReplay).balance, "an ambiguous matching credit retry is idempotent");
  for (const [points, sourceType, metadata] of [[30, "sighting", '{"sightingId":"one"}'], [25, "referral", '{"sightingId":"one"}'], [25, "sighting", '{"sightingId":"two"}']] as const) {
    await assert.rejects(transaction([{ text: "SELECT credit_signal_points($1,$2,$3,$4,$5::jsonb)", params: ["credit-retry", points, "credit-key", sourceType, metadata] }]), /credit idempotency key conflict/i);
  }
  const creditRetryState = await transaction([{ text: "SELECT balance,(SELECT COUNT(*) FROM signal_point_ledger WHERE user_id=$1) AS entries FROM signal_point_accounts WHERE user_id=$1", params: ["credit-retry"] }]);
  assert.deepEqual(row(creditRetryState), { balance: 25, entries: "1" }, "mismatched credit retries do not mutate the account");

  await Promise.all([
    transaction([{ text: "SELECT reconcile_signal_point_source($1,$2,$3,$4,$5::jsonb)", params: ["concurrent-sightings", "signal_points_clerk_metadata_v1:entry:sighting-a", 10, "sighting-a", "{}"] }]),
    transaction([{ text: "SELECT reconcile_signal_point_source($1,$2,$3,$4,$5::jsonb)", params: ["concurrent-sightings", "signal_points_clerk_metadata_v1:entry:sighting-b", 20, "sighting-b", "{}"] }]),
  ]);
  let concurrentSightings = await transaction([{ text: "SELECT balance FROM signal_point_accounts WHERE user_id=$1", params: ["concurrent-sightings"] }]);
  assert.equal(row(concurrentSightings).balance, 30, "two concurrent sighting sources both commit without a lost update");
  await transaction([{ text: "SELECT reconcile_signal_point_source($1,$2,$3,$4,$5::jsonb)", params: ["concurrent-sightings", "signal_points_clerk_metadata_v1:entry:sighting-a", 0, "remove-a", "{}"] }]);
  await transaction([{ text: "SELECT reconcile_signal_point_source($1,$2,$3,$4,$5::jsonb)", params: ["concurrent-sightings", "signal_points_clerk_metadata_v1:entry:sighting-b", 30, "update-b", "{}"] }]);
  concurrentSightings = await transaction([{ text: "SELECT balance FROM signal_point_accounts WHERE user_id=$1", params: ["concurrent-sightings"] }]);
  assert.equal(row(concurrentSightings).balance, 30, "sighting removal and rarity update reconcile their own durable sources");

  for (const [kind, points, balanceDelta, debtDelta] of [
    ["credit", 10, -1, -11], ["credit", 10, 11, 1], ["debit", -10, 1, 11], ["debit", -10, -11, -1],
  ] as const) {
    await assert.rejects(transaction([{ text: `INSERT INTO signal_point_ledger(user_id,idempotency_key,entry_kind,points,balance_delta,debt_delta,source_type)
      VALUES('credit-retry',$1,$2,$3,$4,$5,'constraint-test')`, params: [`invalid-${kind}-${balanceDelta}-${debtDelta}`, kind, points, balanceDelta, debtDelta] }]), /signal_point_ledger_sign_matches_kind/i);
  }

  await transaction([{ text: "SELECT credit_signal_points($1,$2,$3,$4,$5::jsonb)", params: ["same-key-member", 100, "same-key-seed", "test", "{}"] }]);
  await seedShipping("same-key-member");
  const sameKeyIds = [randomUUID(), randomUUID()];
  const sameKeyAttempts = await Promise.all([
    transaction([{ text: "SELECT * FROM reserve_signal_reward($1,$2,$3,$4,$5,$6::jsonb,$7,$8)", params: [sameKeyIds[0], "same-key-member", "standard", "sticker_pack", "shared-key", "{}", "same-key@example.com", true] }]),
    transaction([{ text: "SELECT * FROM reserve_signal_reward($1,$2,$3,$4,$5,$6::jsonb,$7,$8)", params: [sameKeyIds[1], "same-key-member", "standard", "sticker_pack", "shared-key", "{}", "same-key@example.com", true] }]),
  ]);
  assert.equal(row(sameKeyAttempts[0]).redemption_id, row(sameKeyAttempts[1]).redemption_id, "concurrent same-key retries return the same redemption");
  const sameKeyState = await transaction([{ text: `SELECT balance,
    (SELECT COUNT(*) FROM signal_reward_redemptions WHERE user_id=$1) AS redemptions,
    (SELECT COUNT(*) FROM signal_point_ledger WHERE user_id=$1 AND entry_kind='redemption_debit') AS debits
    FROM signal_point_accounts WHERE user_id=$1`, params: ["same-key-member"] }]);
  assert.deepEqual(row(sameKeyState), { balance: 25, redemptions: "1", debits: "1" }, "same-key concurrency creates one redemption and debit");
  for (const [itemKey, details, email] of [
    ["coaster_set", "{}", "same-key@example.com"],
    ["sticker_pack", '{"changed":true}', "same-key@example.com"],
    ["sticker_pack", "{}", "different@example.com"],
  ]) {
    await assert.rejects(transaction([{ text: "SELECT * FROM reserve_signal_reward($1,$2,$3,$4,$5,$6::jsonb,$7,$8)", params: [randomUUID(), "same-key-member", "standard", itemKey, "shared-key", details, email, true] }]), /idempotency key conflict/i);
  }
  const afterConflicts = await transaction([{ text: "SELECT balance FROM signal_point_accounts WHERE user_id=$1", params: ["same-key-member"] }]);
  assert.equal(row(afterConflicts).balance, 25, "same-key parameter conflicts never debit again");

  await transaction([{ text: "SELECT credit_signal_points($1,$2,$3,$4,$5::jsonb)", params: ["shipping-member", 100, "shipping-seed", "test", "{}"] }]);
  await seedShipping("shipping-member");
  const shippingRedemptionId = randomUUID();
  await transaction([{ text: "SELECT * FROM reserve_signal_reward($1,$2,$3,$4,$5,$6::jsonb,$7,$8)", params: [shippingRedemptionId, "shipping-member", "standard", "sticker_pack", "shipping-key", "{}", "shipping-member@example.com", true] }]);
  await transaction([{ text: "UPDATE founder_glass_shipping SET address_line1='999 Changed Later Rd' WHERE user_id=$1", params: ["shipping-member"] }]);
  const snapshot = await transaction([{ text: "SELECT shipping_address->>'addressLine1' AS address_line_1 FROM signal_reward_fulfillments WHERE redemption_id=$1", params: [shippingRedemptionId] }]);
  assert.equal(row(snapshot).address_line_1, "123 Before Cutover Ave", "physical fulfillment owns an immutable address snapshot");
  await assert.rejects(transaction([{ text: "UPDATE signal_reward_fulfillments SET shipping_address=jsonb_set(shipping_address,'{addressLine1}','\"Mutated\"'::jsonb) WHERE redemption_id=$1", params: [shippingRedemptionId] }]), /fulfillment snapshot is immutable/i);
  await assert.rejects(transaction([{ text: "UPDATE signal_reward_fulfillments SET fulfillment_type='digital',shipping_address=NULL WHERE redemption_id=$1", params: [shippingRedemptionId] }]), /fulfillment snapshot is immutable/i);
  await transaction([{ text: "UPDATE signal_reward_fulfillments SET owner_notes='Packed carefully',updated_at=NOW() WHERE redemption_id=$1", params: [shippingRedemptionId] }]);
  await transaction([{ text: "SELECT * FROM transition_signal_reward_redemption($1,$2,$3,$4,$5::jsonb)", params: [shippingRedemptionId, "owner", "approved", "owner", "{}"] }]);
  await transaction([{ text: "SELECT * FROM transition_signal_reward_redemption($1,$2,$3,$4,$5::jsonb)", params: [shippingRedemptionId, "owner", "packed", "owner", "{}"] }]);
  await assert.rejects(transaction([{ text: "SELECT * FROM transition_signal_reward_redemption($1,$2,$3,$4,$5::jsonb)", params: [shippingRedemptionId, "owner", "shipped", "owner", "{}"] }]), /carrier and tracking/i);
  await transaction([{ text: "SELECT * FROM transition_signal_reward_redemption($1,$2,$3,$4,$5::jsonb)", params: [shippingRedemptionId, "owner", "shipped", "owner", '{"carrier":"UPS","trackingNumber":"1ZTEST"}'] }]);
  const shipment = await transaction([{ text: "SELECT carrier,tracking_number FROM signal_reward_fulfillments WHERE redemption_id=$1", params: [shippingRedemptionId] }]);
  assert.deepEqual(row(shipment), { carrier: "UPS", tracking_number: "1ZTEST" }, "shipped transition atomically saves carrier and tracking");

  console.log("Signal Points Postgres debt, concurrency, retry, cancellation, transition, shipping snapshot, and inventory tests passed.");
} finally {
  await sql.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`).finally(() => pool.end());
}
