import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const [schema, repository, core, revenuecat, meRoute, webhookRoute, repair, migration, packageJson, trialRepository, stripeTrial, stripeWebhook] = await Promise.all([
  read("src/lib/apple-membership-schema.sql"),
  read("src/lib/apple-membership-repository.ts"),
  read("src/lib/apple-membership.ts"),
  read("src/lib/revenuecat.ts"),
  read("src/app/api/v1/me/apple-membership/route.ts"),
  read("src/app/api/webhooks/revenuecat/route.ts"),
  read("scripts/repair-apple-membership.ts"),
  read("scripts/migrate-app-storage.mjs"),
  read("package.json"),
  read("src/lib/membership-trial-repository.ts"),
  read("src/lib/membership-trial-stripe.ts"),
  read("src/app/api/webhooks/stripe/route.ts"),
]);

assert.match(schema, /CREATE TABLE IF NOT EXISTS apple_memberships/);
assert.match(schema, /original_transaction_id TEXT PRIMARY KEY/);
assert.match(schema, /clerk_user_id TEXT NOT NULL/);
assert.match(schema, /last_provider_event_id TEXT/);
assert.match(schema, /environment TEXT NOT NULL/);
assert.match(schema, /product_id TEXT NOT NULL/);
assert.match(schema, /entitlement_status TEXT NOT NULL/);
assert.match(schema, /expires_at TIMESTAMPTZ/);
assert.match(schema, /offer_state TEXT NOT NULL/);
assert.match(schema, /ordered_event_at TIMESTAMPTZ NOT NULL/);
assert.match(schema, /created_at TIMESTAMPTZ NOT NULL/);
assert.match(schema, /updated_at TIMESTAMPTZ NOT NULL/);
assert.match(schema, /CREATE TABLE IF NOT EXISTS apple_membership_events/);
assert.match(schema, /provider_event_id TEXT PRIMARY KEY/);
assert.match(schema, /UNIQUE\s*\(original_transaction_id,\s*clerk_user_id\)/);
assert.doesNotMatch(schema, /founder/i);

for (const source of [repository, core, revenuecat, meRoute, webhookRoute, repair]) {
  assert.doesNotMatch(source, /console\.(log|warn|error)/, "Apple billing paths must not log raw provider identifiers or secrets");
}
assert.match(repository, /\$1/);
assert.match(repository, /ownership_mismatch/);
assert.match(repository, /ordered_event_at/);
assert.match(repository, /status_priority/);
assert.doesNotMatch(repository, /CREATE TABLE|ALTER TABLE/, "runtime repository must be DML-only");

assert.match(meRoute, /await auth\(\)/);
assert.match(meRoute, /userId/);
assert.match(meRoute, /createAppleMembershipApiHandlers/);
assert.doesNotMatch(meRoute, /email|CustomerInfo/i);
assert.match(webhookRoute, /REVENUECAT_WEBHOOK_SECRET/);
assert.match(webhookRoute, /createRevenueCatWebhookHandler/);
assert.doesNotMatch(webhookRoute, /email|CustomerInfo/i);
assert.match(revenuecat, /fetchCurrentSubscriber/);
assert.match(revenuecat, /timingSafeEqual/);
assert.doesNotMatch(revenuecat, /com\.bourbonsignal\.app\.founder/);

assert.match(repair, /dryRun:\s*!apply/);
assert.match(repair, /APPLE_MEMBERSHIP_REPAIR_ENABLED/);
assert.doesNotMatch(repair, /process\.argv.*secret|authorization=/i);
assert.match(migration, /apple-membership-schema\.sql/);
assert.match(migration, /apple_memberships/);
assert.match(migration, /apple_membership_events/);
assert.match(packageJson, /"test:apple-membership"/);
assert.match(trialRepository, /claimAuthoritativeAppleTrial/);
assert.match(trialRepository, /apple_revenuecat/);

// Keep the proven Stripe paid-cycle conversion path independent from Apple membership.
assert.match(stripeTrial, /paidPostTrialInvoiceConvertsMembership[\s\S]*markConverted/);
assert.doesNotMatch(stripeTrial, /if \(input\.subscription\.status === "active"\)[\s\S]*markConverted/);
assert.match(stripeWebhook, /invoice\.payment_succeeded/);
assert.match(stripeWebhook, /reconcileInvoiceSubscription/);
assert.doesNotMatch(`${stripeTrial}\n${stripeWebhook}`, /appleMembership|RevenueCat/i);

console.log("Apple membership schema, route, repair, migration, and Stripe-isolation contracts passed.");
