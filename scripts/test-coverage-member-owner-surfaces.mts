import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildCoverageDemandSummary } from "../src/lib/coverage-demand.ts";
import { CONTROL_ROOM_TIME_ZONE, formatControlRoomDateTime } from "../src/lib/control-room-time.ts";
import type { CoverageRequestTargetType } from "../src/lib/coverage-request.ts";
import type { OwnerCoverageRequestRow } from "../src/lib/coverage-request-repository.ts";
import type { CoverageContract } from "../src/lib/coverage-model.ts";

function read(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

const contract: CoverageContract = {
  contractVersion: "bourbon-signal/coverage@3",
  generatedAt: "2026-07-23T12:00:00.000Z",
  evaluatedAt: "2026-07-23T12:00:00.000Z",
  states: [{
    code: "OR",
    name: "Oregon",
    capability: "not-active",
    capabilityLabel: "Not active yet",
    coverageDepth: "not-available",
    coverageDepthLabel: "Not available yet",
    coverageStatus: "not-available",
    coverageStatusLabel: "Not available yet",
    coverageStrength: "none",
    coverageStrengthLabel: "No coverage",
    capabilities: {
      storeInformation: false,
      publicUpdates: false,
      currentBottleAvailability: false,
      restockAlerts: false,
    },
    updateLabel: null,
    health: "no-recent-update",
    healthLabel: "No recent update",
    summary: "No active source.",
    sourceLabel: null,
    precisions: [],
    areas: ["Portland"],
    representedAreaCount: 1,
    monitoredStoreCount: 0,
    layers: { known: 1, probeable: 1, catalogWatch: 0, live: 0, alertGrade: 0 },
    scope: { knownBoards: 0, trackedShipmentBoards: 0, verifiedSourceTargets: 0, verifiedSourceAreas: 0, shipmentBoards: 0, searchableStores: 1, inventoryMonitoredStores: 0, singleStoreShipmentBoards: 0 },
    freshness: { observedInventoryStores: 0, currentInventoryStores: 0, alertEligibleStores: 0, staleInventoryStores: 0, stalePublicSignals: 0 },
    canSee: ["Known directory locations."],
    cannotSee: ["Live monitoring."],
    fingerprint: "coverage-v2|OR|not-active",
  }],
};

function row(userId: string, canonicalTargetKey: string, targetType: CoverageRequestTargetType, areaLabel: string): OwnerCoverageRequestRow {
  return {
    id: `${userId}-${canonicalTargetKey}`,
    userId,
    targetType,
    stateCode: "OR",
    areaKey: targetType === "state" ? null : "portland",
    areaLabel,
    storeId: null,
    storeName: targetType === "store" ? "Rose City Spirits" : null,
    storeAddress: null,
    canonicalTargetKey,
    status: "requested",
    notificationEnabled: true,
    baselineCoverageFingerprint: "coverage-v1|OR|not-active",
    requestedAt: "2026-07-23T10:00:00.000Z",
    updatedAt: "2026-07-23T11:00:00.000Z",
  };
}

const demand = buildCoverageDemandSummary({
  requests: [
    row("user-paid", "city:OR:portland", "city", "Portland"),
    row("user-free", "city:OR:portland", "city", "Portland"),
    row("user-unknown", "store:OR:manual:portland:rose-city-spirits", "store", "Portland"),
  ],
  memberSegments: {
    "user-paid": "paid",
    "user-free": "free",
    "user-unknown": "unknown",
  },
  requesterProfiles: {
    "user-paid": { name: "Pat Hunter", email: "pat@example.com" },
    "user-free": { name: null, email: "free@example.com" },
  },
  coverage: contract,
});

assert.equal(demand.totalOpenRequests, 3);
assert.equal(demand.uniqueRequesters, 3);
assert.equal(demand.targets.length, 2);
assert.equal(demand.targets[0].label, "Portland");
assert.equal(demand.targets[0].uniqueRequesters, 2);
assert.equal(demand.targets[0].paidRequesters, 1);
assert.equal(demand.targets[0].freeRequesters, 1);
assert.equal(demand.targets[0].currentCapability, "not-active");
assert.match(demand.targets[0].gap, /city|area/i);
assert.equal(demand.notificationOptIns, 3);
const repeatedOptInDemand = buildCoverageDemandSummary({
  requests: [
    row("user-paid", "state:OR", "state", "Oregon"),
    row("user-paid", "city:OR:portland", "city", "Portland"),
  ],
  memberSegments: { "user-paid": "paid" },
  coverage: contract,
});
assert.equal(repeatedOptInDemand.notificationOptIns, 1, "email follow-up counts unique opted-in members");
const paidRequest = demand.recentRequests.find((request) => request.requesterEmail === "pat@example.com");
assert.equal(paidRequest?.requesterName, "Pat Hunter");
assert.equal(paidRequest?.notificationEnabled, true);
assert.doesNotMatch(JSON.stringify(demand), /"userId"/, "owner presentation must not expose raw Clerk ids");
assert.equal(CONTROL_ROOM_TIME_ZONE, "America/New_York");
assert.equal(formatControlRoomDateTime("2026-07-29T20:31:07.519Z"), "Jul 29, 2026, 4:31 PM EDT", "summer request timestamps render in Eastern daylight time");
assert.equal(formatControlRoomDateTime("2026-01-29T20:31:07.519Z"), "Jan 29, 2026, 3:31 PM EST", "winter request timestamps render in Eastern standard time");
assert.equal(formatControlRoomDateTime("invalid"), "No timestamp");

const memberCard = read("src/components/dashboard/CoverageRequestsCard.tsx");
const memberStyles = read("src/components/dashboard/CoverageRequestsCard.module.css");
const dashboard = read("src/app/dashboard/page.tsx");
const explorer = read("src/components/coverage/CoverageExplorer.tsx");
const requestForm = read("src/components/coverage/CoverageRequestForm.tsx");
assert.match(memberCard, /\/api\/coverage\/requests/, "member card reads only the authenticated request endpoint");
for (const label of ["Requested", "On our radar", "Coverage improved", "Closed"]) {
  assert.match(memberCard, new RegExp(label), `member card includes the ${label} status`);
}
assert.match(memberCard, /aria-live=/, "status loading and errors are announced");
assert.match(memberCard, /emptyMode/, "request history supports compact and hidden empty states");
assert.match(memberStyles, /@media\s*\(max-width:\s*640px\)/, "member request status is responsive");
assert.match(memberStyles, /:focus-visible/, "member request links have visible focus");
assert.match(dashboard, /import \{ CoverageRequestsCard \}/);
assert.ok((dashboard.match(/<CoverageRequestsCard\s+emptyMode="compact"\s*\/>/g) || []).length >= 2, "paid and free dashboards use a compact empty coverage link");
assert.ok(dashboard.lastIndexOf("<CoverageRequestsCard") > dashboard.indexOf('renderSectionButton("memberPoints")'), "paid request history sits below primary dashboard tools");
assert.match(explorer, /<CoverageRequestsCard emptyMode="hidden"/, "the public page hides duplicate request history until a request exists");
assert.match(memberCard, /useAuth/, "the public request-status card stays hidden for signed-out visitors");
assert.match(memberCard, /user\?\.id/, "request status reloads on Clerk account changes");
assert.match(memberCard, /setRequests\(\[\]\)/, "an account change clears prior private request rows before reloading");
assert.match(memberCard, /loadSequence/, "slower pre-refresh responses cannot overwrite newer request status");
assert.match(memberCard, /coverage-request-saved/, "saved requests refresh the visible status list");
assert.match(requestForm, /coverage-request-saved/, "successful submissions announce a private status refresh");

const server = read("src/lib/company-control-room-server.ts");
const ownerPage = read("src/app/admin/control-room/page.tsx");
const bottleQueue = read("src/app/admin/bottle-queue/AdminBottleQueueClient.tsx");
const sightingQueue = read("src/app/admin/sightings/AdminSightingsClient.tsx");
assert.match(server, /coverageDemand/, "the owner snapshot includes aggregate coverage demand");
assert.match(server, /classifyCompanyMember/, "paid/free mix uses the existing membership classification");
assert.match(ownerPage, /isCompanyControlRoomOwnerEmail/, "the coverage queue inherits owner-only authorization");
assert.match(ownerPage, /href="#coverage-demand"/, "coverage demand is in Control Room navigation");
assert.match(ownerPage, /Coverage demand/, "coverage demand is in owner attention");
assert.match(ownerPage, /id="coverage-demand"/, "the owner queue has a direct section target");
assert.match(ownerPage, /uniqueRequesters[\s\S]*paidRequesters[\s\S]*freeRequesters/, "queue renders aggregate requester mix");
const coverageSection = ownerPage.slice(ownerPage.indexOf('id="coverage-demand"'), ownerPage.indexOf('id="business"'));
assert.match(coverageSection, /cr-request-state-folders[\s\S]*COVERAGE_REQUEST_STATUS_OPTIONS\.map[\s\S]*cr-request-status-form/, "owner requests are grouped by state and remain directly manageable");
assert.match(coverageSection, /requesterEmail/);
assert.match(coverageSection, /request\.requesterEmail[\s\S]*request\.notificationEnabled[\s\S]*mailto:/, "opted-in members keep an email action even when Clerk has no display name");
assert.match(ownerPage, /Email updates:/);
assert.match(ownerPage, /formatControlRoomDateTime\(request\.updatedAt\)/, "request timestamps use the explicit Eastern Time formatter");
assert.match(bottleQueue, /formatControlRoomDateTime\(item\.updatedAt \|\| item\.createdAt\)/, "embedded bottle queue timestamps use Eastern Time");
assert.match(sightingQueue, /formatControlRoomDateTime\(proof\?\.uploadedAt \|\| sighting\.createdAt\)/, "embedded sighting queue timestamps use Eastern Time");
assert.doesNotMatch(`${ownerPage}\n${bottleQueue}\n${sightingQueue}`, /\.toLocaleString\(/, "Control Room timestamp surfaces do not fall back to browser-local time");
assert.doesNotMatch(coverageSection, /request\.userId/, "Control Room should show useful identity, not raw Clerk ids");

console.log("coverage member and owner surface tests passed");
