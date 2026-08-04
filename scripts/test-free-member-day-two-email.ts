import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { render } from "@react-email/render";
import { FreeMemberDayTwoEmail } from "../src/components/emails/FreeMemberDayTwoEmail.tsx";
import {
  FREE_MEMBER_DAY_TWO_CAMPAIGN_ID,
  FREE_MEMBER_DAY_TWO_LIVE_SEND_SUPPORTED,
  FREE_MEMBER_DAY_TWO_SUBJECT,
  buildFreeMemberDayTwoConfig,
  evaluateFreeMemberDayTwoCandidate,
  isFreeMemberDayTwoWindow,
  resolveFreeMemberDayTwoDeliveryMode,
} from "../src/lib/free-member-day-two.ts";
import { CORE_PAID_MEMBERSHIP_PLANS, PAID_MEMBERSHIP_PLANS } from "../src/lib/membership-plan-catalog.ts";

async function main() {
assert.equal(FREE_MEMBER_DAY_TWO_CAMPAIGN_ID, "free-member-day-two-v1");
assert.equal(FREE_MEMBER_DAY_TWO_SUBJECT, "Make Bourbon Signal work harder for your hunt");
assert.equal(FREE_MEMBER_DAY_TWO_LIVE_SEND_SUPPORTED, false, "V1 must be impossible to send while copy is under review");
assert.deepEqual(CORE_PAID_MEMBERSHIP_PLANS.map((plan) => plan.tier), ["standard", "barrel"]);
assert.deepEqual(CORE_PAID_MEMBERSHIP_PLANS.map((plan) => [plan.monthlyPrice, plan.annualPrice]), [["$2.99", "$24.99"], ["$4.99", "$49.99"]]);
assert.equal(PAID_MEMBERSHIP_PLANS.length, 3, "pricing page keeps the separate conditional Founder offer");

const config = buildFreeMemberDayTwoConfig({
  FREE_MEMBER_DAY_TWO_EMAIL_KILL_SWITCH: "0",
  FREE_MEMBER_DAY_TWO_DELIVERY_ENABLED: "1",
  FREE_MEMBER_DAY_TWO_LIVE_SEND_AUTHORIZED: "1",
  RESEND_DIGEST_AUDIENCE_ID: "audience",
} as unknown as NodeJS.ProcessEnv);
assert.deepEqual(resolveFreeMemberDayTwoDeliveryMode({ requestLive: false, config }), { mode: "dry_run", reason: null });
assert.deepEqual(resolveFreeMemberDayTwoDeliveryMode({ requestLive: true, config }), { mode: "blocked", reason: "live_not_supported" });

assert.equal(isFreeMemberDayTwoWindow({
  createdAt: "2026-08-03T14:30:00.000Z",
  now: "2026-08-04T23:10:00.000Z",
  timeZone: "America/New_York",
}), true, "the exact 7 PM local hour on the calendar day after signup is eligible");
assert.equal(isFreeMemberDayTwoWindow({
  createdAt: "2026-08-03T14:30:00.000Z",
  now: "2026-08-05T00:10:00.000Z",
  timeZone: "America/New_York",
}), false, "delivery must fail closed after the 7 PM local hour");
assert.equal(isFreeMemberDayTwoWindow({
  createdAt: "2026-08-03T14:30:00.000Z",
  now: "2026-08-04T22:59:00.000Z",
  timeZone: "America/New_York",
}), false, "delivery must not begin before 7 PM local");
assert.equal(isFreeMemberDayTwoWindow({
  createdAt: "2026-08-03T14:30:00.000Z",
  now: "2026-08-05T04:01:00.000Z",
  timeZone: "America/New_York",
}), false, "delivery must not spill into another local day");
assert.equal(isFreeMemberDayTwoWindow({
  createdAt: "2026-08-03T14:30:00.000Z",
  now: "2026-08-04T23:10:00.000Z",
  timeZone: "Not/AZone",
}), false, "invalid timezones fail closed");

const freeUser = {
  id: "user_free",
  createdAt: "2026-08-03T14:30:00.000Z",
  firstName: "Casey",
  publicMetadata: { tier: "free" },
  privateMetadata: { lifecycleTimeZone: "America/New_York" },
  unsafeMetadata: {},
};
assert.equal(evaluateFreeMemberDayTwoCandidate({ user: freeUser, now: "2026-08-04T23:10:00.000Z" }), "eligible");
assert.equal(evaluateFreeMemberDayTwoCandidate({ user: { ...freeUser, privateMetadata: {} }, now: "2026-08-04T23:10:00.000Z" }), "skipped_missing_timezone");
assert.equal(evaluateFreeMemberDayTwoCandidate({ user: { ...freeUser, banned: true }, now: "2026-08-04T23:10:00.000Z" }), "skipped_disabled_account");
assert.equal(evaluateFreeMemberDayTwoCandidate({ user: { ...freeUser, publicMetadata: { tier: "standard", membershipStatus: "active" } }, now: "2026-08-04T23:10:00.000Z" }), "skipped_not_free");
assert.equal(evaluateFreeMemberDayTwoCandidate({ user: { ...freeUser, unsafeMetadata: { accountType: "retailer" } }, now: "2026-08-04T23:10:00.000Z" }), "skipped_operational_account");
assert.equal(evaluateFreeMemberDayTwoCandidate({ user: { ...freeUser, privateMetadata: { lifecycleTimeZone: "America/New_York", emailSuppression: { suppressed: true } } }, now: "2026-08-04T23:10:00.000Z" }), "skipped_unsubscribed");
assert.equal(evaluateFreeMemberDayTwoCandidate({ user: { ...freeUser, privateMetadata: { lifecycleTimeZone: "America/New_York", freeMemberDayTwoDelivery: { status: "delivered", deliveredAt: "2026-08-05T00:00:00.000Z" } } }, now: "2026-08-04T23:10:00.000Z" }), "skipped_already_delivered");

const html = await render(FreeMemberDayTwoEmail({
  firstName: "Casey",
  unsubscribeUrl: "{{unsubscribeUrl}}",
  baseUrl: "https://www.bourbonsignal.com",
}));
const visibleHtml = html.replaceAll("<!-- -->", "");
for (const required of [
  "BOURBON SIGNAL",
  "Make Bourbon Signal work harder for your hunt",
  "Chandler here",
  "Standard Proof",
  "$2.99/month",
  "$24.99/year",
  "Barrel Proof",
  "$4.99/month",
  "$49.99/year",
  "Compare membership options",
  "Request coverage",
  "your free account stays free",
  "{{unsubscribeUrl}}",
  "Bourbon Signal is intended for users 21+",
]) assert.ok(visibleHtml.includes(required), `email must include: ${required}`);
for (const forbidden of ["July", "sale", "Founder", "founder", "spots remaining", "guaranteed in stock", "drive now"]) {
  assert.ok(!html.includes(forbidden), `evergreen email must omit: ${forbidden}`);
}
assert.match(html, /pricing\?source=day2_free_followup/);
assert.match(html, /coverage\?source=day2_free_followup/);
assert.match(html, /background-color:#15100c/i, "email must use a native dark shell");
assert.doesNotMatch(html, /background-color:\s*(#fff|white)/i, "email must not expose a white mobile shell");

const [pricingSource, routeSource, middlewareSource, vercelSource, serverSource, newsletterPreferencesSource] = await Promise.all([
  readFile(new URL("../src/app/pricing/PricingPageClient.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/app/api/free-member-day-two/deliver/route.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/middleware.ts", import.meta.url), "utf8"),
  readFile(new URL("../vercel.json", import.meta.url), "utf8"),
  readFile(new URL("../src/lib/free-member-day-two-server.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/app/api/newsletter/preferences/route.ts", import.meta.url), "utf8"),
]);
assert.match(pricingSource, /PAID_MEMBERSHIP_PLANS/);
assert.doesNotMatch(pricingSource, /monthlyPrice:\s*"\$2\.99"/, "pricing and email must share one plan catalog");
assert.match(routeSource, /assertFreeMemberDayTwoDeliveryAuthorized/);
assert.match(middlewareSource, /\/api\/free-member-day-two\/deliver/);
assert.doesNotMatch(vercelSource, /free-member-day-two/, "no production schedule may be registered before V1 approval");
assert.match(serverSource, /FREE_MEMBER_DAY_TWO_LIVE_SEND_SUPPORTED/);
assert.match(serverSource, /recipientMasterSubscription/);
assert.match(serverSource, /idempotencyKey/);
assert.match(serverSource, /List-Unsubscribe/);
assert.match(serverSource, /List-Unsubscribe-Post/);
assert.match(serverSource, /newsletterOneClickUnsubscribeUrl/);
assert.match(serverSource, /verification\?\.status !== "verified"/);
assert.match(serverSource, /to: \[refreshedRecipient\]/);
assert.match(serverSource, /markDeliveryFailed/);
assert.match(newsletterPreferencesSource, /List-Unsubscribe/);
assert.match(newsletterPreferencesSource, /status: 204/);

console.log("Free-member Day-2 email and delivery contracts passed.");
}

void main();
