import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { render } from "@react-email/render";
const loadedEmail = await import("../src/components/emails/LowCoverageCommunityEmail.tsx");
const emailModule = { ...loadedEmail, ...((loadedEmail as { default?: object }).default || {}) } as typeof loadedEmail;
const { LowCoverageCommunityEmail } = emailModule;
const loadedPolicy = await import("../src/lib/low-coverage-community-email.ts");
const policyModule = { ...loadedPolicy, ...((loadedPolicy as { default?: object }).default || {}) } as typeof loadedPolicy;
const { LOW_COVERAGE_COMMUNITY_CAMPAIGN_ID, LOW_COVERAGE_COMMUNITY_SUBJECT, classifyLowCoverageCommunityRecipient } = policyModule;

const coverage = [
  { code: "CT", name: "Connecticut", coverageStrength: "none" },
  { code: "KY", name: "Kentucky", coverageStrength: "sparse" },
  { code: "VA", name: "Virginia", coverageStrength: "strong" },
];
const freeUser = {
  id: "user_123",
  publicMetadata: {
    tier: "free",
    memberProfile: { homeState: "CT", homeStateSelectedAt: "2026-08-10T12:00:00.000Z" },
  },
  privateMetadata: {},
  unsafeMetadata: {},
};

assert.equal(LOW_COVERAGE_COMMUNITY_CAMPAIGN_ID, "low-coverage-community-pilot-v1");
assert.equal(LOW_COVERAGE_COMMUNITY_SUBJECT("Connecticut"), "Help improve bourbon coverage in Connecticut");
assert.deepEqual(classifyLowCoverageCommunityRecipient(freeUser, coverage), {
  status: "eligible",
  stateCode: "CT",
  stateName: "Connecticut",
});
assert.equal(classifyLowCoverageCommunityRecipient({ ...freeUser, publicMetadata: { tier: "free" } }, coverage).status, "skipped_unverified_state");
assert.equal(classifyLowCoverageCommunityRecipient({ ...freeUser, publicMetadata: { tier: "free", memberProfile: { homeState: "CT", homeStateSelectedAt: null } } }, coverage).status, "skipped_unverified_state");
assert.equal(classifyLowCoverageCommunityRecipient({ ...freeUser, publicMetadata: { tier: "free", memberProfile: { homeState: "VA", homeStateSelectedAt: "2026-08-10T12:00:00.000Z" } } }, coverage).status, "skipped_not_low_coverage");
assert.equal(classifyLowCoverageCommunityRecipient({ ...freeUser, publicMetadata: { tier: "standard", membershipStatus: "active" } }, coverage).status, "skipped_not_free");
assert.equal(classifyLowCoverageCommunityRecipient({ ...freeUser, privateMetadata: { membershipTrialStartedAt: "2026-08-01T12:00:00.000Z" } }, coverage).status, "skipped_trial_or_paid_history");
assert.equal(classifyLowCoverageCommunityRecipient({ ...freeUser, banned: true }, coverage).status, "skipped_disabled_account");
assert.equal(classifyLowCoverageCommunityRecipient({ ...freeUser, privateMetadata: { emailSuppression: { suppressed: true } } }, coverage).status, "skipped_unsubscribed");
assert.equal(classifyLowCoverageCommunityRecipient({ ...freeUser, unsafeMetadata: { accountType: "retailer" } }, coverage).status, "skipped_operational_account");
assert.equal(classifyLowCoverageCommunityRecipient({ ...freeUser, privateMetadata: { lowCoverageCommunityDelivery: { campaignId: LOW_COVERAGE_COMMUNITY_CAMPAIGN_ID, status: "delivered" } } }, coverage).status, "skipped_already_delivered");
assert.equal(classifyLowCoverageCommunityRecipient({ ...freeUser, privateMetadata: { lowCoverageCommunityDelivery: { campaignId: LOW_COVERAGE_COMMUNITY_CAMPAIGN_ID, status: "reserved" } } }, coverage).status, "skipped_already_delivered");

const html = await render(LowCoverageCommunityEmail({
  firstName: "Casey",
  stateCode: "CT",
  stateName: "Connecticut",
  coverageUrl: "https://www.bourbonsignal.com/coverage?state=CT&utm_campaign=low_coverage_community_pilot_v1",
  sightingsUrl: "https://www.bourbonsignal.com/dashboard?section=sightings&utm_campaign=low_coverage_community_pilot_v1",
  unsubscribeUrl: "{{unsubscribeUrl}}",
}));
const visible = html.replaceAll("<!-- -->", "");
for (const required of [
  "Hey Casey,",
  "coverage in Connecticut is still growing",
  "store, city, or area",
  "Request coverage",
  "Post a Member Sighting",
  "retailer inventory is incomplete, unpublished, or not confirmed",
  "{{unsubscribeUrl}}",
  "Bourbon Signal is intended for users 21+",
]) assert.ok(visible.includes(required), `missing: ${required}`);
for (const forbidden of ["Start a 7-day free trial", "$3/month", "$6/month", "call the store", "available now", "guaranteed in stock", "Signal Points"]) {
  assert.ok(!visible.includes(forbidden), `must omit: ${forbidden}`);
}
assert.match(html, /background-color:#15100c/i);
assert.match(html, /utm_campaign=low_coverage_community_pilot_v1/);

const [runnerSource, clickSource, clickRouteSource, clickSchemaSource, preflightSource, middlewareSource] = await Promise.all([
  readFile(new URL("./send-low-coverage-community-pilot.mts", import.meta.url), "utf8"),
  readFile(new URL("../src/lib/campaign-click-tracking.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/app/api/campaign/click/route.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/lib/campaign-click-tracking-schema.sql", import.meta.url), "utf8"),
  readFile(new URL("../src/app/api/ops/low-coverage-community-preflight/route.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/middleware.ts", import.meta.url), "utf8"),
]);
for (const invariant of [
  "--apply",
  "--verify",
  "value(\"--limit\")",
  "LOW_COVERAGE_COMMUNITY_CAMPAIGN_ID",
  "PERMANENT_EXCLUDED_EMAIL_HASHES",
  "classifyLowCoverageCommunityRecipient",
  "freeMemberDayTwoDelivery",
  "recentProviderRecipients",
  "durableTrialClearUserIds",
  "x-low-coverage-timestamp",
  "x-low-coverage-signature",
  "randomBytes(16)",
  "offset += 20",
  "Provider history exceeded the safe pagination bound",
  "emailBinding(row.email)",
  "oneClickUnsubscribeUrl",
  "Durable delivery reservation was not confirmed",
  "7 * 24 * 60 * 60_000",
  "verification?.status !== \"verified\"",
  "unsubscribed",
  "lowCoverageCommunityDelivery",
  "reserved",
  "delivered",
  "Idempotency-Key",
  "List-Unsubscribe-Post",
  "campaign_email_clicks",
]) assert.ok(runnerSource.includes(invariant), `runner missing safety contract: ${invariant}`);
assert.match(clickSource, /"coverage"/);
assert.match(clickSource, /"sightings"/);
assert.match(clickSource, /prepareCampaignClickSchema/);
assert.match(clickRouteSource, /low-coverage-community-pilot-v1/);
assert.match(clickSchemaSource, /CHECK \(destination IN \('points', 'trial', 'coverage', 'sightings'\)\)/);
assert.match(clickSchemaSource, /DROP CONSTRAINT IF EXISTS campaign_email_clicks_destination_check/);
assert.match(preflightSource, /assertFreeMemberDayTwoDeliveryAuthorized/);
assert.match(preflightSource, /createHmac\("sha256", secret\)/);
assert.match(preflightSource, /5 \* 60_000/);
assert.match(preflightSource, /consumeCampaignPreflightNonce/);
assert.match(clickSource, /ON CONFLICT \(nonce_hash\) DO NOTHING/);
assert.match(preflightSource, /getMembershipTrialRepository/);
assert.match(preflightSource, /stripe\.customers\.list/);
assert.match(preflightSource, /stripe\.subscriptions\.list/);
assert.match(preflightSource, /prepareCampaignClickSchema/);
assert.match(middlewareSource, /\/api\/ops\/low-coverage-community-preflight/);

console.log("Low-coverage community email contracts passed.");
