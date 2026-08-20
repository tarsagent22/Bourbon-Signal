import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { campaignClickDestination, createCampaignClickToken, verifyCampaignClickToken } from "../src/lib/campaign-click-tracking.ts";

const secret = "campaign-click-secret-that-is-long-enough-for-production";
const now = new Date("2026-08-18T20:00:00.000Z");
const token = createCampaignClickToken({
  campaignId: "free-trial-points-pilot-v1",
  recipientId: "pseudonymous-recipient-id",
  destination: "trial",
  expiresAt: "2026-11-18T20:00:00.000Z",
}, secret);
assert.deepEqual(verifyCampaignClickToken(token, secret, now), {
  version: 1,
  campaignId: "free-trial-points-pilot-v1",
  recipientId: "pseudonymous-recipient-id",
  destination: "trial",
  expiresAt: "2026-11-18T20:00:00.000Z",
});
assert.equal(verifyCampaignClickToken(`${token.slice(0, -1)}x`, secret, now), null);
assert.equal(verifyCampaignClickToken(token, secret, new Date("2026-11-19T00:00:00.000Z")), null);
assert.throws(() => createCampaignClickToken({ campaignId: "x", recipientId: "y", destination: "trial", expiresAt: "2026-11-18T20:00:00.000Z" }, "short"));
assert.match(campaignClickDestination("coverage"), /\/coverage\?.*utm_campaign=low_coverage_community_pilot_v1/);
assert.match(campaignClickDestination("sightings"), /section=sightings.*utm_campaign=low_coverage_community_pilot_v1/);
assert.match(campaignClickDestination("setup"), /\/welcome\?legacy=1.*utm_campaign=missing_state_community_pilot_v1/);

const route = readFileSync("src/app/api/campaign/click/route.ts", "utf8");
assert.match(route, /NEWSLETTER_UNSUBSCRIBE_SECRET\s*\|\|\s*process\.env\.RESEND_API_KEY/);
assert.match(route, /recordCampaignClick/);
assert.match(route, /NextResponse\.redirect/);
assert.match(route, /Cache-Control/);
const schema = readFileSync("src/lib/campaign-click-tracking-schema.sql", "utf8");
assert.match(schema, /campaign_email_clicks/);
assert.match(schema, /recipient_hash/);
assert.match(schema, /'points', 'trial', 'coverage', 'sightings', 'setup'/);
assert.match(schema, /DROP CONSTRAINT IF EXISTS campaign_email_clicks_destination_check/);
assert.doesNotMatch(schema, /\n\s*(email|ip_address|user_agent)\s/i);
console.log("Campaign click tracking contract passed.");
