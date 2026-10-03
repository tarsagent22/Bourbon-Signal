import assert from "node:assert/strict";

import { TIER_ENTITLEMENTS } from "../src/lib/entitlements.ts";

const expected = {
  free: { limit: 10, dna: false, recommendations: false },
  standard: { limit: null, dna: false, recommendations: false },
  barrel: { limit: null, dna: true, recommendations: true },
  "bottled-in-bond": { limit: null, dna: true, recommendations: true },
} as const;

for (const [tier, contract] of Object.entries(expected) as Array<[keyof typeof expected, (typeof expected)[keyof typeof expected]]>) {
  const entitlements = TIER_ENTITLEMENTS[tier];
  assert.equal(entitlements.canUseCollection, true, `${tier} can use the basic Cellar`);
  assert.equal(entitlements.collectionBottleLimit, contract.limit, `${tier} has the expected Cellar capacity`);
  assert.equal(entitlements.canUseBourbonDna, contract.dna, `${tier} has the expected Bourbon DNA access`);
  assert.equal(entitlements.canUseRecommendations, contract.recommendations, `${tier} has the expected recommendation access`);
}

for (const entitlement of Object.values(TIER_ENTITLEMENTS)) {
  assert.equal(entitlement.canReceiveSmsAlerts, false);
  assert.equal(entitlement.smsDailyLimit, 0);
  assert.equal(entitlement.smsMonthlyLimit, 0);
}

console.log("Cellar entitlement matrix tests passed.");
