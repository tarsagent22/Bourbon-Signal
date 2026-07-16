import assert from "node:assert/strict";
import fs from "node:fs";

function read(path) {
  assert.equal(fs.existsSync(path), true, `${path} must exist`);
  return fs.readFileSync(path, "utf8");
}

const server = read("src/lib/member-weekly-server.ts");
const route = read("src/app/api/member-weekly-intelligence/preview/route.ts");
const email = read("src/components/emails/MemberWeeklyIntelligenceEmail.tsx");
const card = read("src/components/dashboard/WeeklyIntelligenceCard.tsx");
const dashboard = read("src/app/dashboard/page.tsx");
const unsubscribe = read("src/app/weekly-intelligence/unsubscribe/page.tsx");
const unsubscribeRoute = read("src/app/api/member-weekly-intelligence/unsubscribe/route.ts");
const newsletterUnsubscribe = read("src/app/unsubscribe/page.tsx");
const newsletterPreferenceRoute = read("src/app/api/newsletter/preferences/route.ts");
const deliveryRoute = read("src/app/api/member-weekly-intelligence/deliver/route.ts");
const deliveryServer = read("src/lib/member-weekly-delivery-server.ts");
const deliveryRunner = read("src/lib/member-weekly-delivery-runner.ts");
const middleware = read("src/middleware.ts");
const preferencesRoute = read("src/app/api/user/preferences/route.ts");
const vercel = read("vercel.json");
const weeklyFiles = [server, route, email, card, unsubscribe].join("\n");

for (const phrase of [
  "candidateMatchesArea",
  "candidateMatchesBottlePrefs",
  "candidatePassesFreshEmailGuardrails",
  'readSiteExportResults(["alerts", "stats"])',
  "radarEntries",
  "stateCoverage",
]) {
  assert.ok(server.includes(phrase), `weekly source adapter must reuse ${phrase}`);
}
for (const phrase of ["deliveryAreaMatched: true", "deliveryMatchFields", "candidate.storeCity", "candidate.storeCounty", "candidate.boardName", "candidate.storeId"]) {
  assert.ok(server.includes(phrase), `weekly source adapter must preserve canonical delivery matching via ${phrase}`);
}

assert.ok(route.includes("await auth()"), "preview endpoint must authenticate directly");
assert.ok(route.includes("buildWeeklyIntelligencePreview"), "preview endpoint must use the shared deterministic server composer");
assert.ok(route.includes('format === "email"'), "preview endpoint must expose an email HTML preview");
assert.ok(route.includes('"Cache-Control": "private, no-store"'), "member preview must never be publicly cached");

assert.ok(email.includes("report.sections.map"), "email includes only sections present in the report");
assert.equal((email.match(/<Button\b/g) || []).length, 1, "weekly email has exactly one primary CTA");
assert.ok(email.includes("unsubscribeUrl"), "weekly email includes its topic-specific unsubscribe link");
assert.ok(email.includes("MemberWeeklyIntelligence"), "email consumes the same deterministic report as the dashboard");

assert.ok(card.includes('fetch("/api/member-weekly-intelligence/preview"'), "dashboard surface loads the authenticated preview");
assert.ok(card.includes("report.sections.map"), "dashboard renders only relevant report sections");
assert.ok(card.includes("report.primaryAction"), "dashboard renders the report's one action");
assert.ok(card.includes("No new signal this week"), "dashboard has an intentional silent-week state");
assert.ok(card.includes("Email preview"), "dashboard exposes the dry-run email preview");
assert.ok(dashboard.includes("<WeeklyIntelligenceCard"), "weekly intelligence is mounted in the existing dashboard");
assert.ok(dashboard.includes("owner-controlled delivery pilot remains inactive"), "settings distinguish opt-in from pilot authorization");
assert.ok(card.includes("delivery pilot is not active until owner authorization"), "preview truthfully reports inactive pilot delivery");

for (const phrase of [
  "verifyWeeklyIntelligenceUnsubscribe",
  'method="post"',
  "/api/member-weekly-intelligence/unsubscribe",
]) {
  assert.ok(unsubscribe.includes(phrase), `unsubscribe flow must include ${phrase}`);
}
assert.equal(unsubscribe.includes("updateUserMetadata"), false, "GET/render unsubscribe code must never mutate member state");
for (const phrase of ["verifyWeeklyIntelligenceUnsubscribe", "applyWeeklyIntelligenceUnsubscribe", "updateUserMetadata", "export async function POST"]) {
  assert.ok(unsubscribeRoute.includes(phrase), `unsubscribe POST route must include ${phrase}`);
}
assert.equal(unsubscribeRoute.includes("export async function GET"), false, "unsubscribe mutation route must be POST-only");
assert.equal(/unsubscribeNewsletterContact|subscribeNewsletterContact|updateUserMetadata/.test(newsletterUnsubscribe), false, "newsletter GET/render code must never mutate subscription state");
assert.ok(newsletterUnsubscribe.includes('method="post"'), "newsletter GET renders an explicit POST confirmation");
for (const phrase of ["export async function POST", "verifyNewsletterSignature", "unsubscribeNewsletterContact", "emailSuppression", "updateUserMetadata"]) {
  assert.ok(newsletterPreferenceRoute.includes(phrase), `newsletter POST route must enforce ${phrase}`);
}

assert.ok(middleware.includes('"/api/member-weekly-intelligence(.*)"'), "weekly API surface is protected by middleware too");
assert.ok(preferencesRoute.includes("applyWeeklyIntelligencePreferenceTransition"), "preference writes must timestamp explicit opt-in and unsubscribe transitions");

for (const forbidden of ["getResendClient", "resend.emails", "sendTwilioSms", "emails.send", "sms.send"]) {
  assert.equal(weeklyFiles.includes(forbidden), false, `weekly preview-only code must not contain ${forbidden}`);
}
assert.ok(server.includes("buildWeeklyIntelligenceDryRun"), "server returns a send-disabled dry-run decision");
assert.ok(server.includes("weeklyIntelligenceEmailKillSwitchActive"), "dry-run decision honors the global kill switch");
assert.ok(server.includes("deliveredMemberWeeks"), "dry-run decision reads durable member-week dedupe history");
for (const phrase of ["assertMemberWeeklyDeliveryAuthorized", "runMemberWeeklyDelivery", "requestLive", "Cache-Control"]) {
  assert.ok(deliveryRoute.includes(phrase), `owner delivery route must include ${phrase}`);
}
for (const phrase of ["getUserList", 'orderBy: "+created_at"', ".sort(", "explicitOptIn", "masterUnsubscribed", "batchSize", "maxEmailsPerRun", "minSendIntervalMs", "idempotencyKey", "reserveMemberWeek", "markMemberWeekDelivered"]) {
  assert.ok(`${deliveryServer}\n${deliveryRunner}`.includes(phrase), `weekly sender must enforce ${phrase}`);
}
assert.ok(deliveryServer.includes("MemberWeeklyIntelligenceEmail"), "live sender uses the reviewed weekly template");
assert.ok(deliveryServer.includes("getResendClient"), "provider access is isolated to the live sender module");
assert.ok(middleware.includes('url.pathname === "/api/member-weekly-intelligence/deliver"'), "delivery route reaches its own secret authorization");
assert.ok(middleware.includes('url.pathname === "/api/member-weekly-intelligence/unsubscribe"'), "signed unsubscribe POST does not require an active Clerk session");
assert.ok(vercel.includes('/api/member-weekly-intelligence/deliver?cron=v1'), "weekly dry-run route is scheduled for cron");
assert.equal(vercel.includes('/api/member-weekly-intelligence/deliver?cron=v1&live=1'), false, "checked-in weekly cron cannot request live sending");

console.log("Member weekly intelligence surface contracts passed.");
