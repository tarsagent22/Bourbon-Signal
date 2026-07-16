import assert from "node:assert/strict";
import {
  DEFAULT_DEMAND_COHORT_SIZE,
  aggregateMemberDemand,
  containsSensitiveDemandInput,
  resolveCanonicalDemandBottle,
} from "../src/lib/demand-intelligence.ts";

const catalog = [
  { id: "weller-12", name: "Weller 12 Year", aliases: ["Weller Twelve"] },
  { id: "stagg", canonical_id: "stagg", name: "Stagg", aliases: ["Stagg Jr."] },
];

assert.equal(DEFAULT_DEMAND_COHORT_SIZE, 5);
for (const value of [
  "member@example.com",
  "https://example.com/weller",
  "www.example.com/weller",
  "+1 (919) 555-0188",
  "call 919-555-0188",
]) {
  assert.equal(containsSensitiveDemandInput(value), true, `${value} should be rejected`);
}
assert.equal(containsSensitiveDemandInput("Weller 12 Year"), false);
assert.deepEqual(resolveCanonicalDemandBottle("Weller Twelve", catalog), {
  canonicalBottleId: "weller-12",
  canonicalBottleName: "Weller 12 Year",
});
assert.equal(resolveCanonicalDemandBottle("unknown bottle", catalog), null);
assert.equal(resolveCanonicalDemandBottle("member@example.com", catalog), null);

function member(id: string, bottleName: string, states: string[]) {
  return {
    id,
    publicMetadata: {
      bottleAlertPreferences: { bottleNames: [bottleName, bottleName], bottleKeys: [] },
      areaPreferences: { states },
    },
  };
}

const users = [
  ...Array.from({ length: 5 }, (_, index) => member(`nc-${index}`, "Weller Twelve", ["NC", "NC"])),
  ...Array.from({ length: 4 }, (_, index) => member(`va-${index}`, "Stagg Jr.", ["VA"])),
  member("unsafe", "person@example.com", ["XX"]),
];
const snapshot = aggregateMemberDemand(users, {
  catalog,
  approvedStateCodes: ["NC", "VA"],
  minCohortSize: 2,
});

assert.deepEqual(snapshot.privacy, {
  minCohortSize: 5,
  containsPii: false,
  containsRawHistory: false,
});
assert.equal(snapshot.eligibleMembers, 10);
assert.deepEqual(snapshot.bottles, [{
  canonicalBottleId: "weller-12",
  canonicalBottleName: "Weller 12 Year",
  memberCount: 5,
  weightedDemand: 20,
}]);
assert.deepEqual(snapshot.geographies, [{
  state: "NC",
  memberCount: 5,
  weightedDemand: 10,
}]);
assert.deepEqual(snapshot.suppressed, { bottleCohorts: 1, geographyCohorts: 1 });
const serialized = JSON.stringify(snapshot);
for (const forbidden of ["nc-0", "person@example.com", "unknown bottle", "history", "rawQuery", "capturedAt"]) {
  assert.equal(serialized.includes(forbidden), false, `aggregate leaked ${forbidden}`);
}

console.log("Privacy-safe demand intelligence contract passed.");
