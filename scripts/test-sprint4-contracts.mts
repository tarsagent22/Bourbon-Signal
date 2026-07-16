import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path: string) => readFileSync(resolve(path), "utf8");

const alerts = read("src/app/alerts/page.tsx");
assert.match(alerts, /ActivationChecklist/);
assert.match(alerts, /\/api\/user\/preferences/);
assert.doesNotMatch(alerts, /bourbon-signal-alerts-welcome-seen|localStorage/);

const preferences = read("src/app/api/user/preferences/route.ts");
assert.match(preferences, /activation/);
assert.match(preferences, /deriveMemberActivation/);

const delivery = read("src/lib/alert-delivery.ts");
assert.match(delivery, /first_alert_created/);
assert.match(delivery, /alertInbox/);
assert.match(delivery, /onSiteInboxWritten/);

const controlRoomServer = read("src/lib/company-control-room-server.ts");
assert.match(controlRoomServer, /aggregateGrowthFunnels/);
assert.match(controlRoomServer, /growth/);
const controlRoom = read("src/app/admin/control-room/page.tsx");
assert.match(controlRoom, /Growth funnel/);
assert.match(controlRoom, /days7/);
assert.match(controlRoom, /days30/);

const retailerPortal = read("src/app/retailers/portal/page.tsx");
assert.match(retailerPortal, /retailerNextAction/);
assert.match(retailerPortal, /nextAction/);

for (const path of [
  "emails/newsletters/drafts/setup-incomplete-lifecycle.html",
  "emails/newsletters/drafts/free-value-follow-up-lifecycle.html",
  "emails/newsletters/drafts/lifecycle-cohort-contract.json",
]) {
  assert.ok(existsSync(resolve(path)), `${path} must exist as a draft-only lifecycle artifact`);
}
const cohort = read("emails/newsletters/drafts/lifecycle-cohort-contract.json");
assert.match(cohort, /"mode"\s*:\s*"draft-only"/);
assert.match(cohort, /"sending"\s*:\s*false/);
assert.doesNotMatch(cohort, /resend|cron|provider|sender/i);

console.log("Sprint 4 integration contracts passed.");
