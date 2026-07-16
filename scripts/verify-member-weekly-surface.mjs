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
const middleware = read("src/middleware.ts");
const preferencesRoute = read("src/app/api/user/preferences/route.ts");
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

for (const phrase of [
  "verifyWeeklyIntelligenceUnsubscribe",
  "updateUserMetadata",
  "weeklyIntelligence",
  "unsubscribedAt",
  "emailEnabled: false",
]) {
  assert.ok(unsubscribe.includes(phrase), `unsubscribe flow must include ${phrase}`);
}

assert.ok(middleware.includes('"/api/member-weekly-intelligence(.*)"'), "weekly API surface is protected by middleware too");
assert.ok(preferencesRoute.includes("applyWeeklyIntelligencePreferenceTransition"), "preference writes must timestamp explicit opt-in and unsubscribe transitions");

for (const forbidden of ["getResendClient", "resend.emails", "sendTwilioSms", "emails.send", "sms.send"]) {
  assert.equal(weeklyFiles.includes(forbidden), false, `weekly preview-only code must not contain ${forbidden}`);
}
assert.ok(server.includes("buildWeeklyIntelligenceDryRun"), "server returns a send-disabled dry-run decision");
assert.ok(server.includes("weeklyIntelligenceEmailKillSwitchActive"), "dry-run decision honors the global kill switch");
assert.ok(server.includes("deliveredMemberWeeks"), "dry-run decision reads durable member-week dedupe history");

console.log("Member weekly intelligence surface contracts passed.");
