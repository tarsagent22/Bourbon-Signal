import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  classifyCompanyMember,
  aggregateCompanyDemand,
  buildOwnerExperimentAggregate,
  extractEngineControlRoomMetrics,
  isCompanyControlRoomOwnerEmail,
  summarizeMemberships,
} from "../src/lib/company-control-room.ts";

assert.equal(isCompanyControlRoomOwnerEmail("chandler@bourbonsignal.com"), true);
assert.equal(isCompanyControlRoomOwnerEmail(" CHANDLERTODD22@GMAIL.COM "), true);
assert.equal(isCompanyControlRoomOwnerEmail("member@example.com"), false);
assert.equal(isCompanyControlRoomOwnerEmail(""), false);

function user(email: string, metadata: Record<string, unknown> = {}, role = "member") {
  return {
    id: `user-${email}`,
    primaryEmailAddressId: "primary",
    emailAddresses: [{ id: "primary", emailAddress: email }],
    publicMetadata: { ...metadata, role },
  };
}

const members = [
  user("free@example.com"),
  user("standard@example.com", { tier: "standard", membershipStatus: "active", billingPlan: "standard_monthly" }),
  user("barrel@example.com", { tier: "barrel", membershipStatus: "active", billingPlan: "barrel_annual" }),
  user("founder@example.com", { tier: "bottled-in-bond", membershipStatus: "lifetime", billingPlan: "bib_lifetime" }),
  user("pastdue@example.com", { tier: "standard", membershipStatus: "past_due", billingPlan: "standard_monthly" }),
  user("store@example.com", {}, "retailer"),
  user("chandler@bourbonsignal.com"),
];

const standard = classifyCompanyMember(members[1]);
assert.equal(standard.effectiveTier, "standard");
assert.equal(standard.isPaid, true);
assert.equal(standard.billingPlan, "standard_monthly");
assert.equal(standard.isCampaignEligibleFreeMember, false);

const pastDue = classifyCompanyMember(members[4]);
assert.equal(pastDue.effectiveTier, "free");
assert.equal(pastDue.isPaid, false);
assert.equal(pastDue.status, "past_due");
assert.equal(pastDue.isCampaignEligibleFreeMember, true);

const retailer = classifyCompanyMember(members[5]);
assert.equal(retailer.isRetailer, true);
assert.equal(retailer.isCampaignEligibleFreeMember, false);

const owner = classifyCompanyMember(members[6]);
assert.equal(owner.isOwner, true);
assert.equal(owner.isCampaignEligibleFreeMember, false);

const summary = summarizeMemberships(members);
assert.deepEqual(summary.counts, {
  total: 7,
  free: 4,
  paid: 3,
  standard: 1,
  barrel: 1,
  founder: 1,
  retailer: 1,
  owner: 1,
  pastDue: 1,
  campaignEligibleFree: 2,
});
assert.equal(summary.estimatedMonthlyRecurringCents, 716);
assert.equal(summary.estimatedAnnualRecurringCents, 8587);
assert.equal(summary.estimatedLifetimeGrossCents, 4999);
assert.equal("emails" in summary, false);

const demandUsers = [
  ...Array.from({ length: 5 }, (_, index) => ({
    id: `demand-${index}`,
    publicMetadata: {
      bottleAlertPreferences: { bottleNames: ["Weller 12"], bottleKeys: [] },
      areaPreferences: { states: ["NC"] },
    },
  })),
  user("chandler@bourbonsignal.com", {
    bottleAlertPreferences: { bottleNames: ["Weller 12"], bottleKeys: [] },
    areaPreferences: { states: ["NC"] },
  }),
];
const demand = aggregateCompanyDemand(demandUsers, [{ id: "weller-12", name: "Weller 12" }], ["NC"]);
assert.equal(demand.eligibleMembers, 5);
assert.equal(demand.bottles[0].memberCount, 5);
assert.equal(JSON.stringify(demand).includes("demand-0"), false);

const emptyExperimentAggregate = buildOwnerExperimentAggregate();
assert.equal(emptyExperimentAggregate.activeExperiment, "release-radar-follow-cta-copy");
assert.equal(emptyExperimentAggregate.registryCount, 1);
assert.equal(emptyExperimentAggregate.killSwitchEnabled, false);
assert.equal(emptyExperimentAggregate.activeDefinition?.primaryMetric, "release_follow_completed");
assert.deepEqual(emptyExperimentAggregate.aggregate.privacy, { minCohortSize: 5, containsPii: false, containsRawHistory: false });
assert.equal(emptyExperimentAggregate.aggregate.experiments.length, 1);
assert.ok(emptyExperimentAggregate.aggregate.experiments[0].variants.every((variant) => variant.suppressed));

assert.deepEqual(extractEngineControlRoomMetrics({
  signalCount: 27014,
  alertCandidateCount: 645,
  storeCount: 2913,
  stateCount: 24,
  stateCoverage: { counts: { live_store_inventory: 12 } },
}), {
  activeStates: 24,
  inventoryStates: 12,
  stores: 2913,
  signals: 27014,
  alertCandidates: 645,
});

const page = readFileSync(new URL("../src/app/admin/control-room/page.tsx", import.meta.url), "utf8");
const layout = readFileSync(new URL("../src/app/admin/control-room/layout.tsx", import.meta.url), "utf8");
const robots = readFileSync(new URL("../src/app/robots.ts", import.meta.url), "utf8");
const sitemap = readFileSync(new URL("../src/app/sitemap.ts", import.meta.url), "utf8");

assert.match(page, /auth\(\)/);
assert.match(page, /notFound\(\)/);
assert.match(page, /isCompanyControlRoomOwnerEmail/);
assert.match(page, /force-dynamic/);
assert.match(page, /Demand-weighted investment/);
assert.match(page, /Controlled experiments/);
assert.match(page, /Unique authenticated members only/);
assert.doesNotMatch(page, /RESEND_API_KEY|CLERK_SECRET_KEY|STRIPE_SECRET_KEY|BLOB_READ_WRITE_TOKEN/);
assert.match(layout, /index:\s*false/);
assert.match(layout, /follow:\s*false/);
assert.match(robots, /\/admin\//);
assert.doesNotMatch(sitemap, /\/admin\//);

console.log("Company Control Room contract passed.");
