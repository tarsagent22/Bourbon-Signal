import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { render } from "@react-email/render";
const loadedEmail = await import("../src/components/emails/MissingStateCommunityEmail.tsx");
const emailModule = { ...loadedEmail, ...((loadedEmail as { default?: object }).default || {}) } as typeof loadedEmail;
const { MissingStateCommunityEmail } = emailModule;
const loadedPolicy = await import("../src/lib/missing-state-community-email.ts");
const policyModule = { ...loadedPolicy, ...((loadedPolicy as { default?: object }).default || {}) } as typeof loadedPolicy;
const {
  MISSING_STATE_COMMUNITY_CAMPAIGN_ID,
  classifyMissingStateCommunityRecipient,
  hasStateSelectorEvidence,
  needsLegacySetupPrompt,
} = policyModule;

const freeUser = {
  id: "user_free",
  createdAt: "2026-07-01T12:00:00.000Z",
  publicMetadata: { tier: "free" },
  privateMetadata: {},
  unsafeMetadata: {},
};

assert.equal(MISSING_STATE_COMMUNITY_CAMPAIGN_ID, "missing-state-community-pilot-v1");
assert.equal(hasStateSelectorEvidence({}, {}), false);
assert.equal(hasStateSelectorEvidence({ memberProfile: { homeState: "VA" } }, {}), true);
assert.equal(hasStateSelectorEvidence({ memberProfile: { homeStateSelectedAt: "2026-08-01T00:00:00.000Z" } }, {}), true);
assert.equal(hasStateSelectorEvidence({ areaPreferences: { states: ["VA"] } }, {}), true);
assert.equal(hasStateSelectorEvidence({}, { activation: { onboarding_state_selected: "2026-08-01T00:00:00.000Z" } }), true);
assert.equal(hasStateSelectorEvidence({}, {}, { memberProfile: { homeStateSelectedAt: "2026-08-01T00:00:00.000Z" } }), true);
assert.equal(classifyMissingStateCommunityRecipient(freeUser).status, "eligible");
assert.equal(classifyMissingStateCommunityRecipient({ ...freeUser, publicMetadata: { tier: "free", memberProfile: { homeState: "VA" } } }).status, "skipped_selector_used");
assert.equal(classifyMissingStateCommunityRecipient({ ...freeUser, publicMetadata: { tier: "free", areaPreferences: { states: ["NC"] } } }).status, "skipped_selector_used");
assert.equal(classifyMissingStateCommunityRecipient({ ...freeUser, privateMetadata: { activation: { onboarding_state_selected: "2026-08-01T00:00:00.000Z" } } }).status, "skipped_selector_used");
assert.equal(classifyMissingStateCommunityRecipient({ ...freeUser, privateMetadata: { legacySetupPrompt: { dismissedAt: "2026-08-01T00:00:00.000Z" } } }).status, "skipped_setup_dismissed");
assert.equal(classifyMissingStateCommunityRecipient({ ...freeUser, privateMetadata: { freeMemberDayTwoDelivery: { status: "delivered", deliveredAt: "2026-08-01T00:00:00.000Z" } } }).status, "skipped_trial_email_history");
assert.equal(classifyMissingStateCommunityRecipient({ ...freeUser, privateMetadata: { missingStateCommunityDelivery: { campaignId: MISSING_STATE_COMMUNITY_CAMPAIGN_ID, status: "reserved" } } }).status, "skipped_already_delivered");
assert.equal(classifyMissingStateCommunityRecipient({ ...freeUser, publicMetadata: { tier: "barrel", membershipStatus: "active" } }).status, "skipped_not_free");
assert.equal(classifyMissingStateCommunityRecipient({ ...freeUser, privateMetadata: { membershipTrialStartedAt: "2026-08-01T00:00:00.000Z" } }).status, "skipped_trial_or_paid_history");
assert.equal(classifyMissingStateCommunityRecipient({ ...freeUser, banned: true }).status, "skipped_disabled_account");
assert.equal(needsLegacySetupPrompt(freeUser, new Date("2026-08-20T00:00:00.000Z")), true);
assert.equal(needsLegacySetupPrompt({ ...freeUser, createdAt: "2026-07-20T00:00:00.000Z" }, new Date("2026-08-20T00:00:00.000Z")), false);
assert.equal(needsLegacySetupPrompt({ ...freeUser, publicMetadata: { tier: "free", memberProfile: { homeState: "VA" } } }, new Date("2026-08-20T00:00:00.000Z")), false);

const html = await render(MissingStateCommunityEmail({
  firstName: "Alex",
  setupUrl: "https://www.bourbonsignal.com/api/campaign/click?t=alex-token",
  unsubscribeUrl: "https://www.bourbonsignal.com/unsubscribe?email=alex%40example.com&sig=test",
}));
const otherHtml = await render(MissingStateCommunityEmail({
  firstName: "Jordan",
  setupUrl: "https://www.bourbonsignal.com/api/campaign/click?t=jordan-token",
  unsubscribeUrl: "https://www.bourbonsignal.com/unsubscribe?email=jordan%40example.com&sig=test",
}));
assert.match(html, /Where do you hunt for bourbon\?/);
assert.match(html, /10–30 Signal Points/);
assert.match(html, /growing rewards catalog/);
assert.match(html, /Member Sightings/);
assert.match(html, /Tell us where you hunt/);
assert.match(html, /alex-token/);
assert.doesNotMatch(html, /jordan-token|Jordan/);
assert.match(otherHtml, /jordan-token|Jordan/);
assert.doesNotMatch(otherHtml, /alex-token|Alex/);
assert.doesNotMatch(html, /Virginia|North Carolina|home state is/i);

const prompt = readFileSync("src/components/LegacyMemberSetupPrompt.tsx", "utf8");
const setupRoute = readFileSync("src/app/api/user/legacy-setup/route.ts", "utf8");
const preferencesRoute = readFileSync("src/app/api/user/preferences/route.ts", "utf8");
const welcome = readFileSync("src/app/welcome/page.tsx", "utf8");
const layout = readFileSync("src/app/layout.tsx", "utf8");
const runner = readFileSync("scripts/send-missing-state-community-pilot.mts", "utf8");
const clickRoute = readFileSync("src/app/api/campaign/click/route.ts", "utf8");
const clickPolicy = readFileSync("src/lib/campaign-click-tracking.ts", "utf8");
const clickSchema = readFileSync("src/lib/campaign-click-tracking-schema.sql", "utf8");

assert.match(setupRoute, /await auth\(\)/);
assert.match(setupRoute, /needsLegacySetupPrompt/);
assert.match(setupRoute, /legacySetupPrompt/);
assert.match(preferencesRoute, /legacySetupPrompt/);
assert.match(preferencesRoute, /completedAt/);
assert.match(prompt, /\/api\/user\/legacy-setup/);
assert.match(prompt, /\/welcome\?legacy=1&source=legacy-setup-prompt/);
assert.match(prompt, /Not now/);
assert.match(layout, /LegacyMemberSetupPrompt/);
assert.match(welcome, /Finish setting up Bourbon Signal/);
assert.match(welcome, /10–30 Signal Points/);
assert.match(welcome, /growing rewards catalog/);
assert.match(clickRoute, /missing-state-community-pilot-v1/);
assert.match(clickPolicy, /case "setup"/);
assert.match(clickSchema, /'setup'/);
for (const marker of [
  "--apply requires the exact --manifest-hash",
  "LOW_COVERAGE_COMMUNITY_EXCLUDED_EMAILS",
  "skipped_trial_email_provider_history",
  "classifyMissingStateCommunityRecipient",
  "emailBinding(row.email)",
  "Idempotency-Key",
  "List-Unsubscribe-Post",
  "randomBytes(16)",
  "durableTrialClearUserIds",
  "Provider history returned an unexpected response shape",
  "Provider history returned an invalid recipient",
  "if (!rows.length) throw new Error(\"Provider history pagination is incomplete.\")",
  "finalEligibility.status",
  "finalHistory.recentRecipients",
  "to: [finalEmail]",
]) assert.ok(runner.includes(marker), `runner is missing safety marker: ${marker}`);
assert.doesNotMatch(runner, /console\.log\([^\n]*(email|firstName|user\.id)/);

console.log("Missing-state community campaign contracts passed.");
