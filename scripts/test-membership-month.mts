import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import * as monthModule from "../src/lib/membership-month.ts";
const {encryptMembershipCode,decryptMembershipCode,membershipMonthRoute} = ((monthModule as any).default || monthModule) as typeof import("../src/lib/membership-month.ts");
import * as entitlementModule from "../src/lib/entitlements.ts";
const {resolveEffectiveMembershipTier} = ((entitlementModule as any).default || entitlementModule) as typeof import("../src/lib/entitlements.ts");
import * as revenuecatModule from "../src/lib/revenuecat.ts";
const {normalizeRevenueCatSubscriber} = ((revenuecatModule as any).default || revenuecatModule) as typeof import("../src/lib/revenuecat.ts");

const db = new PGlite();
try {
  for (const file of ["founder-shipping-schema.sql", "signal-points-schema.sql", "membership-month-schema.sql"]) {
    await db.exec(await readFile(new URL(`../src/lib/${file}`, import.meta.url), "utf8"));
  }
  const fund = (user: string) => db.query("INSERT INTO signal_point_accounts(user_id,balance) VALUES($1,1000)", [user]);
  const redeem = (user: string, id: string, key: string, provider = "earned_access", tier = "free", audience = "free", item = "standard_membership_credit_month") => db.query<{redemption_id:string;redemption_status:string;balance:number}>("SELECT * FROM redeem_signal_membership_month($1,$2,$3,$4,$5,$6,$7,$8)", [id,user,tier,item,key,`${user}@example.com`,provider,audience]);
  await fund("free-user");
  const earned = (await redeem("free-user", "earned-1", "request-1")).rows[0];
  assert.deepEqual(earned, { redemption_id:"earned-1",redemption_status:"delivered",balance:850 });
  assert.deepEqual((await redeem("free-user","discarded-id","request-1")).rows[0], earned, "same request reuses the grant and debit");
  const grant = (await db.query<{details:Record<string,string>}>("SELECT details FROM signal_reward_redemptions WHERE id='earned-1'")).rows[0].details;
  assert.ok(Date.parse(grant.accessExpiresAt) > Date.parse(grant.accessStartsAt) + 27 * 86400000);
  assert.ok(Date.parse(grant.accessExpiresAt) <= Date.parse(grant.accessStartsAt) + 31 * 86400000);
  await assert.rejects(redeem("free-user","earned-2","request-2"), /last 12 months/);
  await assert.rejects(redeem("free-user","cross-tier","other-request","stripe","barrel","member","barrel_membership_credit_month"), /last 12 months/);
  await assert.rejects(db.query("SELECT * FROM reserve_signal_reward('physical','free-user','free','sticker_pack','physical-request','{}','free-user@example.com',TRUE)"), /Paid membership required/);
  await fund("apple-user");
  await assert.rejects(redeem("apple-user","apple-1","apple-request","apple"), /codes are unavailable/);
  assert.equal((await db.query<{balance:number}>("SELECT balance FROM signal_point_accounts WHERE user_id='apple-user'")).rows[0].balance, 1000, "no code rolls back the debit");
  await db.query("INSERT INTO signal_membership_offer_codes(id,offer_id,batch_id,tier,audience,environment,code_hash,encrypted_code,expires_at) VALUES('sandbox','offer','batch','standard','free','SANDBOX','hash-sandbox','encrypted',NOW()+INTERVAL '3 months')");
  await assert.rejects(redeem("apple-user","apple-1","apple-request","apple"), /codes are unavailable/, "sandbox codes never satisfy production claims");
  await db.query("INSERT INTO signal_membership_offer_codes(id,offer_id,batch_id,tier,audience,environment,code_hash,encrypted_code,expires_at) VALUES('production','offer','batch','standard','free','PRODUCTION','hash-production','encrypted',NOW()+INTERVAL '3 months')");
  const apple = (await redeem("apple-user","apple-1","apple-request","apple")).rows[0];
  assert.equal(apple.redemption_status,"delivered");
  assert.deepEqual((await redeem("apple-user","retry-id","apple-request","apple")).rows[0], apple);
  assert.equal((await db.query<{n:number}>("SELECT COUNT(*)::int AS n FROM signal_membership_offer_codes WHERE claimed_at IS NOT NULL")).rows[0].n,1);
  await assert.rejects(db.query("SELECT * FROM transition_signal_reward_redemption('apple-1','apple-user','canceled','member')"), /Invalid redemption transition/, "an issued code cannot be canceled and reused");
  await fund("other-apple-user");
  await assert.rejects(redeem("other-apple-user","apple-2","request","apple"), /codes are unavailable/, "a claimed code is never issued again");
  await assert.rejects(redeem("apple-user","provider-swap","apple-request","earned_access"), /idempotency key conflict/);
  await assert.rejects(redeem("other-apple-user","audience-swap","request","apple","free","member"), /audience mismatch/);

  process.env.MEMBERSHIP_REWARD_CODE_ENCRYPTION_KEY = Buffer.alloc(32,8).toString("base64");
  const ciphertext = encryptMembershipCode("TESTONLYABC123");
  assert.equal(decryptMembershipCode(ciphertext),"TESTONLYABC123");
  assert.ok(!ciphertext.includes("TESTONLYABC123"));
  process.env.MEMBERSHIP_REWARD_CODE_ENCRYPTION_KEY = Buffer.alloc(32,9).toString("base64");
  assert.throws(() => decryptMembershipCode(ciphertext), "wrong keys fail closed");
  assert.deepEqual(membershipMonthRoute("free",{},{},"ios"),{provider:"apple",audience:"free",tier:"standard"});
  assert.deepEqual(membershipMonthRoute("free",{},{},"web"),{provider:"earned_access",audience:"free",tier:"standard"});
  assert.equal(membershipMonthRoute("bottled-in-bond",{},{},"ios"),null);
  assert.equal(membershipMonthRoute("standard",{giftOrderId:"gift"},{},"web"),null);
  assert.equal(membershipMonthRoute("standard",{appleMembershipTier:"standard",appleMembershipStatus:"active"},{appleMembershipProductId:"com.bourbonsignal.app.standard.annual"},"ios"),null);
  assert.equal(resolveEffectiveMembershipTier({rewardMembershipRedemptionId:"earned-1",rewardMembershipExpiresAt:"2026-11-01T00:00:00Z"},new Date("2026-10-05")),"standard");
  assert.equal(resolveEffectiveMembershipTier({rewardMembershipRedemptionId:"earned-1",rewardMembershipExpiresAt:"2026-11-01T00:00:00Z"},new Date("2026-11-02")),"free");
  assert.equal(resolveEffectiveMembershipTier({tier:"barrel",billingPlan:"barrel_monthly",membershipStatus:"active",rewardMembershipRedemptionId:"earned-1",rewardMembershipExpiresAt:"2026-11-01T00:00:00Z"},new Date("2026-10-05")),"barrel");
  const subscriber = {subscriber:{original_app_user_id:"apple-user",subscriptions:{"com.bourbonsignal.app.standard.monthly":{original_transaction_id:"123",is_sandbox:true,period_type:"trial",purchase_date:"2026-10-01T00:00:00Z",expires_date:"2026-11-01T00:00:00Z",verified_offer_type:3}}}};
  assert.equal(normalizeRevenueCatSubscriber("apple-user",subscriber,new Date("2026-10-05")).offerState,"promotional_offer");
  assert.equal(normalizeRevenueCatSubscriber("apple-user",subscriber,new Date("2026-10-05")).status,"active");
  delete (subscriber.subscriber.subscriptions["com.bourbonsignal.app.standard.monthly"] as Record<string,unknown>).verified_offer_type;
  assert.equal(normalizeRevenueCatSubscriber("apple-user",subscriber,new Date("2026-10-05")).offerState,"introductory_trial", "ordinary trials keep their existing guard");
  console.log("Membership month SQL, debit rollback, retry, code inventory, expiry, provider routing, encryption, and Apple offer tests passed.");
} finally { await db.close(); }
