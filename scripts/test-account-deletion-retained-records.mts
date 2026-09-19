import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

const root = new URL("../src/lib/", import.meta.url);
const load = (name: string) => readFile(new URL(name, root), "utf8");

test("Signal Points deletion anonymizes identity while immutable value triggers remain active", async () => {
  const db = new PGlite();
  await db.exec(await load("account-deletion-schema.sql"));
  await db.exec(await load("founder-shipping-schema.sql"));
  await db.exec(await load("signal-points-schema.sql"));
  await db.exec(`
    INSERT INTO account_deletion_requests(user_id,request_id,subject_token,status,requested_at,updated_at)
      VALUES ('user_delete','request-delete-0001','deleted:11111111-1111-4111-8111-111111111111','cleanup_queued',NOW(),NOW());
    INSERT INTO signal_point_accounts(user_id,balance) VALUES ('user_delete',90);
    INSERT INTO signal_point_source_balances(user_id,source_key,points) VALUES ('user_delete','community',90);
    INSERT INTO signal_reward_catalog(item_key,catalog_version,name,points_cost,fulfillment_type)
      VALUES ('glass',1,'Glass',10,'physical');
    INSERT INTO signal_reward_redemptions(id,user_id,idempotency_key,item_key,catalog_version,item_snapshot,points_spent,status,account_email)
      VALUES ('red_1','user_delete','idem_1','glass',1,'{}',10,'submitted','member@example.com');
    INSERT INTO signal_point_ledger(user_id,idempotency_key,entry_kind,points,balance_delta,debt_delta,source_type,redemption_id)
      VALUES ('user_delete','ledger_1','redemption_debit',-10,-10,0,'redemption','red_1');
    INSERT INTO signal_reward_fulfillments(redemption_id,fulfillment_type,shipping_profile_user_id,shipping_address)
      VALUES ('red_1','physical','user_delete','{"recipientName":"Member","addressLine1":"1 Main","addressLine2":null,"city":"Louisville","stateCode":"KY","postalCode":"40202","countryCode":"US","phone":"5555555555"}');
  `);
  await assert.rejects(
    () => db.exec("UPDATE signal_point_ledger SET user_id='deleted_illegal' WHERE user_id='user_delete'"),
    /append-only/,
  );
  await assert.rejects(
    () => db.exec("BEGIN; SELECT set_config('app.account_deletion_request_id','forged-request',TRUE); UPDATE signal_point_ledger SET user_id='deleted:22222222-2222-4222-8222-222222222222' WHERE user_id='user_delete'; COMMIT;"),
    /append-only/,
  );
  await db.exec("ROLLBACK");
  await db.query("SELECT anonymize_signal_points_member($1,$2,$3,$4)", [
    "user_delete",
    "deleted:11111111-1111-4111-8111-111111111111",
    "deleted_subject@deleted.invalid",
    "request-delete-0001",
  ]);
  const ledger = await db.query<{ user_id: string; points: number }>(
    "SELECT user_id,points FROM signal_point_ledger WHERE idempotency_key='ledger_1'",
  );
  assert.deepEqual(ledger.rows, [{ user_id: "deleted:11111111-1111-4111-8111-111111111111", points: -10 }]);
  const fulfillment = await db.query<{ shipping_profile_user_id: string; shipping_address: { recipientName: string; addressLine1: string } }>(
    "SELECT shipping_profile_user_id,shipping_address FROM signal_reward_fulfillments WHERE redemption_id='red_1'",
  );
  assert.equal(fulfillment.rows[0]?.shipping_profile_user_id, "deleted:11111111-1111-4111-8111-111111111111");
  assert.equal(fulfillment.rows[0]?.shipping_address.recipientName, "Deleted member");
  assert.notEqual(fulfillment.rows[0]?.shipping_address.addressLine1, "1 Main");
  assert.equal((await db.query("SELECT 1 FROM signal_point_accounts WHERE user_id='user_delete'")).rows.length, 0);
  await assert.rejects(
    () => db.exec("UPDATE signal_reward_fulfillments SET shipping_profile_user_id='other' WHERE redemption_id='red_1'"),
    /immutable/,
  );
  await db.close();
});

test("gift anonymization scrubs the deleting purchaser or redeemed recipient without deleting orders", async () => {
  const db = new PGlite();
  await db.exec(await load("account-deletion-schema.sql"));
  await db.exec(await load("gift-schema.sql"));
  await db.exec(`
    INSERT INTO account_deletion_requests(user_id,request_id,subject_token,status,requested_at,updated_at)
      VALUES ('user_delete','request-delete-0002','deleted:22222222-2222-4222-8222-222222222222','cleanup_queued',NOW(),NOW());
    INSERT INTO gift_orders(id,purchaser_request_id,purchaser_user_id,purchaser_email,purchaser_name,recipient_email,recipient_name,gift_message,gift_plan,gift_tier,delivery_mode,payment_status,redeemed_by_user_id,redeemed_by_email,redeemed_at)
      VALUES ('gift_recipient','req_1','buyer_keep','buyer@example.com','Buyer','recipient@example.com','Recipient','Private note','standard_annual_gift','standard','now','funded','user_delete','recipient@example.com',NOW());
    INSERT INTO gift_redemption_recipients(gift_order_id,user_id,verified_email,claim_token,status)
      VALUES ('gift_recipient','user_delete','recipient@example.com','claim_1','claimed');
    INSERT INTO gift_order_events(gift_order_id,event_key,event_type,event_payload)
      VALUES ('gift_recipient','gift-event-1','redeemed','{"recipientEmail":"recipient@example.com","recipientName":"Recipient"}');
    INSERT INTO gift_orders(id,purchaser_request_id,purchaser_user_id,purchaser_email,purchaser_name,recipient_email,recipient_name,gift_message,gift_plan,gift_tier,delivery_mode,payment_status)
      VALUES ('gift_purchaser','req_2','user_delete','purchaser@example.com','Purchaser','other@example.com','Other','Keep for recipient','barrel_annual_gift','barrel','now','funded');
  `);
  await db.query("SELECT anonymize_gift_member($1,$2,$3,$4)", ["user_delete", "deleted:22222222-2222-4222-8222-222222222222", "deleted_subject@deleted.invalid", "request-delete-0002"]);
  const rows = await db.query<Record<string, string | null>>(
    "SELECT id,purchaser_user_id,purchaser_email,recipient_email,recipient_name,gift_message,redeemed_by_user_id,redeemed_by_email FROM gift_orders ORDER BY id",
  );
  const purchaser = rows.rows.find((row) => row.id === "gift_purchaser")!;
  const recipient = rows.rows.find((row) => row.id === "gift_recipient")!;
  assert.equal(purchaser.purchaser_user_id, "deleted:22222222-2222-4222-8222-222222222222");
  assert.equal(purchaser.recipient_email, "other@example.com");
  assert.equal(recipient.purchaser_user_id, "buyer_keep");
  assert.equal(recipient.recipient_email, "deleted_subject@deleted.invalid");
  assert.equal(recipient.recipient_name, "Deleted member");
  assert.equal(recipient.gift_message, null);
  assert.equal(recipient.redeemed_by_user_id, "deleted:22222222-2222-4222-8222-222222222222");
  assert.equal(recipient.redeemed_by_email, "deleted_subject@deleted.invalid");
  assert.equal(rows.rows.length, 2);
  assert.deepEqual((await db.query<{ event_payload: object }>("SELECT event_payload FROM gift_order_events WHERE event_key='gift-event-1'")).rows, [{ event_payload: {} }]);
  await assert.rejects(() => db.exec("UPDATE gift_order_events SET event_payload='{}' WHERE event_key='gift-event-1'"), /append-only/);
  await db.close();
});

test("referral anonymization preserves the other member's rewards in both deletion roles", async () => {
  const db = new PGlite();
  await db.exec(await load("referral-schema.sql"));
  await db.exec(`
    INSERT INTO member_referral_codes(referrer_user_id,code,email_hash) VALUES ('referrer_keep','CODE1','hash1');
    INSERT INTO member_referrals(referred_user_id,referrer_user_id,referral_code,referred_email_hash,awarded_points)
      VALUES ('user_delete','referrer_keep','CODE1','hash2',50);
    INSERT INTO member_referral_point_ledger(event_key,referrer_user_id,referred_user_id,tier,reason,points)
      VALUES ('referral:user_delete:standard','referrer_keep','user_delete','standard','referral_standard',50);
    INSERT INTO member_referral_eligibility_events(source_event_id,referred_user_id,tier)
      VALUES ('member:membership:user_delete','user_delete','standard');
    INSERT INTO member_referral_glass_rewards(referred_user_id,referrer_user_id) VALUES ('user_delete','referrer_keep');
  `);
  await db.query("SELECT anonymize_referral_member($1,$2)", ["user_delete", "deleted_referred"]);
  let ledger = await db.query<Record<string, string>>("SELECT referrer_user_id,referred_user_id FROM member_referral_point_ledger");
  assert.deepEqual(ledger.rows, [{ referrer_user_id: "referrer_keep", referred_user_id: "deleted_referred" }]);
  assert.equal((await db.query("SELECT 1 FROM member_referral_glass_rewards WHERE referrer_user_id='referrer_keep' AND referred_user_id='deleted_referred'")).rows.length, 1);
  assert.equal((await db.query("SELECT 1 FROM member_referral_point_ledger WHERE event_key LIKE '%user_delete%'")).rows.length, 0);
  assert.equal((await db.query("SELECT 1 FROM member_referral_eligibility_events WHERE source_event_id LIKE '%user_delete%'")).rows.length, 0);
  await db.query("SELECT anonymize_referral_member($1,$2)", ["referrer_keep", "deleted_referrer"]);
  ledger = await db.query<Record<string, string>>("SELECT referrer_user_id,referred_user_id FROM member_referral_point_ledger");
  assert.deepEqual(ledger.rows, [{ referrer_user_id: "deleted_referrer", referred_user_id: "deleted_referred" }]);
  assert.equal((await db.query("SELECT 1 FROM member_referral_codes WHERE referrer_user_id='deleted_referrer'")).rows.length, 1);
  assert.equal((await db.query("SELECT 1 FROM member_referral_glass_rewards")).rows.length, 1);
  await db.close();
});
