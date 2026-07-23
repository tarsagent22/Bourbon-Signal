import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildCoverageDemandSummary } from "../src/lib/coverage-demand.ts";
import type { OwnerCoverageRequestRow } from "../src/lib/coverage-request-repository.ts";
import type { CoverageContract } from "../src/lib/coverage-model.ts";

function read(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

const contract: CoverageContract = {
  contractVersion: "bourbon-signal/coverage@1",
  generatedAt: "2026-07-23T12:00:00.000Z",
  states: [{
    code: "OR",
    name: "Oregon",
    capability: "not-active",
    capabilityLabel: "Not active yet",
    health: "no-recent-update",
    healthLabel: "No recent update",
    summary: "No active source.",
    sourceLabel: null,
    precisions: [],
    areas: ["Portland"],
    representedAreaCount: 1,
    monitoredStoreCount: 0,
    layers: { known: 1, probeable: 1, catalogWatch: 0, live: 0, alertGrade: 0 },
    canSee: ["Known directory locations."],
    cannotSee: ["Live monitoring."],
    fingerprint: "coverage-v1|OR|not-active",
  }],
};

function row(userId: string, canonicalTargetKey: string, targetType: "state" | "city" | "store", areaLabel: string): OwnerCoverageRequestRow {
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
assert.doesNotMatch(JSON.stringify(demand), /user-paid|user-free|user-unknown|userId|email/i, "owner aggregate drops requester identities");

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
assert.match(server, /coverageDemand/, "the owner snapshot includes aggregate coverage demand");
assert.match(server, /classifyCompanyMember/, "paid/free mix uses the existing membership classification");
assert.match(ownerPage, /isCompanyControlRoomOwnerEmail/, "the coverage queue inherits owner-only authorization");
assert.match(ownerPage, /href="#coverage-demand"/, "coverage demand is in Control Room navigation");
assert.match(ownerPage, /Coverage demand/, "coverage demand is in owner attention");
assert.match(ownerPage, /id="coverage-demand"/, "the owner queue has a direct section target");
assert.match(ownerPage, /uniqueRequesters[\s\S]*paidRequesters[\s\S]*freeRequesters/, "queue renders aggregate requester mix");
const coverageSection = ownerPage.slice(ownerPage.indexOf('id="coverage-demand"'), ownerPage.indexOf('id="business"'));
assert.doesNotMatch(coverageSection, /requesterEmail|requesterName|userId/, "requester identity is private by default");

console.log("coverage member and owner surface tests passed");
